/**
 * Delegate settlement for VHTLC VTXOs.
 *
 * Allows the client to prepare and sign delegate PSBTs (intent + forfeits),
 * then POST them to the lendaswap backend which runs the Ark batch ceremony.
 *
 * This works for spendable, recoverable, AND expired VTXOs — unlike the
 * offchain submitTx/finalizeTx path which only handles spendable VTXOs.
 */

import {
  type ArkProvider,
  type IndexerProvider,
  type NetworkName,
  type TapLeafScript,
  buildForfeitTx,
  Intent,
  networks,
  RestArkProvider,
  RestIndexerProvider,
  SingleKey,
  VHTLC,
  ConditionWitness,
  setArkPsbtField,
  VtxoTaprootTree,
} from "@arkade-os/sdk";
import { SigHash } from "@scure/btc-signer";
import { ripemd160 } from "@noble/hashes/legacy";
import { sha256 } from "@noble/hashes/sha2";
import { base64, hex } from "@scure/base";

/** Default Arkade server URL by network */
const DEFAULT_ARKADE_URLS: Record<string, string> = {
  bitcoin: "https://arkade.computer",
  mainnet: "https://arkade.computer",
  signet: "https://mutinynet.arkade.sh",
  mutinynet: "https://mutinynet.arkade.sh",
};

function getNetworkName(network: string): NetworkName {
  switch (network.toLowerCase()) {
    case "mainnet":
    case "bitcoin":
      return "bitcoin";
    case "testnet":
      return "testnet";
    case "signet":
      return "signet";
    case "mutinynet":
      return "mutinynet";
    case "regtest":
      return "regtest";
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}

function getNetworkHrp(networkName: NetworkName): string {
  return networks[networkName].hrp;
}

function secondsToTimelock(
  seconds: number,
): VHTLC.Options["unilateralClaimDelay"] {
  return { type: "seconds" as const, value: BigInt(seconds) };
}

function parseXOnlyPubKey(pubKeyHex: string): Uint8Array {
  const bytes = hex.decode(pubKeyHex);
  if (bytes.length === 33) return bytes.slice(1);
  if (bytes.length === 32) return bytes;
  throw new Error(`Invalid public key length: ${bytes.length}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DelegateClaimParams {
  userSecretKey: string;
  userPubKey: string;
  lendaswapPubKey: string;
  arkadeServerPubKey: string;
  preimage: string;
  preimageHash: string;
  vhtlcAddress: string;
  refundLocktime: number;
  unilateralClaimDelay: number;
  unilateralRefundDelay: number;
  unilateralRefundWithoutReceiverDelay: number;
  /** Destination Arkade address */
  destinationAddress: string;
  network: string;
  /** Lendaswap API base URL (e.g. http://localhost:3333) */
  lendaswapApiUrl: string;
  arkadeServerUrl?: string;
}

export interface DelegateRefundParams {
  userSecretKey: string;
  userPubKey: string;
  lendaswapPubKey: string;
  arkadeServerPubKey: string;
  hashLock: string;
  vhtlcAddress: string;
  refundLocktime: number;
  unilateralClaimDelay: number;
  unilateralRefundDelay: number;
  unilateralRefundWithoutReceiverDelay: number;
  destinationAddress: string;
  network: string;
  lendaswapApiUrl: string;
  arkadeServerUrl?: string;
}

export interface DelegateSettleResult {
  commitmentTxid: string;
}

/**
 * Fetch the backend's static delegate cosigner public key.
 */
export async function fetchCosignerPk(
  lendaswapApiUrl: string,
): Promise<string> {
  const url = `${lendaswapApiUrl.replace(/\/$/, "")}/api/delegate/cosigner-pk`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch cosigner pk: ${res.status} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { cosigner_pk: string };
  return body.cosigner_pk;
}

/**
 * Settle a VHTLC via delegate claim (reveal preimage).
 */
export async function delegateClaim(
  params: DelegateClaimParams,
): Promise<DelegateSettleResult> {
  const userPkBytes = parseXOnlyPubKey(params.userPubKey);
  const lendaswapPkBytes = parseXOnlyPubKey(params.lendaswapPubKey);
  const serverPkBytes = parseXOnlyPubKey(params.arkadeServerPubKey);

  const preimageBytes = hex.decode(params.preimage);
  const preimageHashBytes = ripemd160(sha256(preimageBytes));

  if (
    hex.encode(preimageHashBytes) !==
    hex.encode(ripemd160(hex.decode(params.preimageHash)))
  ) {
    throw new Error("Preimage hash mismatch");
  }

  // Build VHTLC — for claim: lendaswap=sender, user=receiver
  const networkName = getNetworkName(params.network);
  const vhtlc = new VHTLC.Script({
    sender: lendaswapPkBytes,
    receiver: userPkBytes,
    server: serverPkBytes,
    preimageHash: preimageHashBytes,
    refundLocktime: BigInt(params.refundLocktime),
    unilateralClaimDelay: secondsToTimelock(params.unilateralClaimDelay),
    unilateralRefundDelay: secondsToTimelock(params.unilateralRefundDelay),
    unilateralRefundWithoutReceiverDelay: secondsToTimelock(
      params.unilateralRefundWithoutReceiverDelay,
    ),
  });

  const hrp = getNetworkHrp(networkName);
  const computedAddr = vhtlc.address(hrp, serverPkBytes).encode();
  if (computedAddr !== params.vhtlcAddress) {
    throw new Error(
      `VHTLC address mismatch: computed ${computedAddr}, expected ${params.vhtlcAddress}`,
    );
  }

  return settleDelegate({
    userSecretKey: params.userSecretKey,
    tapLeafScript: vhtlc.claim(),
    tapTree: vhtlc.encode(),
    vhtlcPkScript: hex.encode(vhtlc.pkScript),
    witnessData: preimageBytes,
    destinationAddress: params.destinationAddress,
    networkName,
    lendaswapApiUrl: params.lendaswapApiUrl,
    arkadeServerUrl: params.arkadeServerUrl,
    locktime: undefined,
  });
}

/**
 * Settle a VHTLC via delegate refund (after locktime expiry).
 */
export async function delegateRefund(
  params: DelegateRefundParams,
): Promise<DelegateSettleResult> {
  const userPkBytes = parseXOnlyPubKey(params.userPubKey);
  const lendaswapPkBytes = parseXOnlyPubKey(params.lendaswapPubKey);
  const serverPkBytes = parseXOnlyPubKey(params.arkadeServerPubKey);

  const hashLockBytes = hex.decode(params.hashLock);
  const preimageHashBytes =
    hashLockBytes.length === 32 ? ripemd160(hashLockBytes) : hashLockBytes;

  // Build VHTLC — for refund: user=sender, lendaswap=receiver
  const networkName = getNetworkName(params.network);
  const vhtlc = new VHTLC.Script({
    sender: userPkBytes,
    receiver: lendaswapPkBytes,
    server: serverPkBytes,
    preimageHash: preimageHashBytes,
    refundLocktime: BigInt(params.refundLocktime),
    unilateralClaimDelay: secondsToTimelock(params.unilateralClaimDelay),
    unilateralRefundDelay: secondsToTimelock(params.unilateralRefundDelay),
    unilateralRefundWithoutReceiverDelay: secondsToTimelock(
      params.unilateralRefundWithoutReceiverDelay,
    ),
  });

  const hrp = getNetworkHrp(networkName);
  const computedAddr = vhtlc.address(hrp, serverPkBytes).encode();
  if (computedAddr !== params.vhtlcAddress) {
    throw new Error(
      `VHTLC address mismatch: computed ${computedAddr}, expected ${params.vhtlcAddress}`,
    );
  }

  return settleDelegate({
    userSecretKey: params.userSecretKey,
    tapLeafScript: vhtlc.refundWithoutReceiver(),
    tapTree: vhtlc.encode(),
    vhtlcPkScript: hex.encode(vhtlc.pkScript),
    witnessData: undefined,
    destinationAddress: params.destinationAddress,
    networkName,
    lendaswapApiUrl: params.lendaswapApiUrl,
    arkadeServerUrl: params.arkadeServerUrl,
    locktime: params.refundLocktime,
  });
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

interface SettleDelegateOpts {
  userSecretKey: string;
  tapLeafScript: TapLeafScript;
  tapTree: Uint8Array;
  vhtlcPkScript: string;
  witnessData: Uint8Array | undefined;
  destinationAddress: string;
  networkName: NetworkName;
  lendaswapApiUrl: string;
  arkadeServerUrl: string | undefined;
  locktime: number | undefined;
}

async function settleDelegate(
  opts: SettleDelegateOpts,
): Promise<DelegateSettleResult> {
  const {
    userSecretKey,
    tapLeafScript,
    tapTree,
    vhtlcPkScript,
    witnessData,
    destinationAddress,
    networkName,
    lendaswapApiUrl,
    arkadeServerUrl,
  } = opts;

  const serverUrl = arkadeServerUrl ?? DEFAULT_ARKADE_URLS[networkName];
  if (!serverUrl) {
    throw new Error(`No Arkade server URL for network: ${networkName}`);
  }

  const arkProvider: ArkProvider = new RestArkProvider(serverUrl);
  const indexerProvider: IndexerProvider = new RestIndexerProvider(serverUrl);
  const serverInfo = await arkProvider.getInfo();

  // Fetch cosigner pk from lendaswap backend
  const cosignerPkHex = await fetchCosignerPk(lendaswapApiUrl);

  // Fetch VTXOs — include all (not just spendable)
  const { vtxos: allVtxos } = await indexerProvider.getVtxos({
    scripts: [vhtlcPkScript],
  });

  // Filter to unspent VTXOs
  const vtxos = allVtxos.filter((v) => !v.isSpent);

  if (vtxos.length === 0) {
    throw new Error("No settleable VTXOs found at the VHTLC address");
  }

  const totalAmount = vtxos.reduce((acc, v) => acc + BigInt(v.value), 0n);
  if (totalAmount === 0n) {
    throw new Error("Total VTXO amount is zero");
  }

  console.log(`Found ${vtxos.length} VTXO(s) totalling ${totalAmount} sats`);

  // Parse destination
  const { ArkAddress } = await import("@arkade-os/sdk");
  const destAddr = ArkAddress.decode(destinationAddress);
  const destPkScript = destAddr.pkScript;

  // Build intent message
  const now = Math.floor(Date.now() / 1000);
  const intentMessage: Intent.RegisterMessage = {
    type: "register",
    onchain_output_indexes: [],
    valid_at: now,
    expire_at: now + 120,
    cosigners_public_keys: [cosignerPkHex],
  };

  // Build intent inputs from VTXOs
  const pkScriptBytes = hex.decode(vhtlcPkScript);
  const intentInputs = vtxos.map((v) => ({
    txid: hex.decode(v.txid),
    index: v.vout,
    witnessUtxo: {
      script: pkScriptBytes,
      amount: BigInt(v.value),
    },
    tapLeafScript: [tapLeafScript],
    sequence: opts.locktime ? 0xfffffffe : undefined,
    sighashType: SigHash.ALL,
  }));

  // Build intent proof PSBT
  const intentProof = Intent.create(intentMessage, intentInputs, [
    { script: destPkScript, amount: totalAmount },
  ]);

  // Set VtxoTaprootTree on each real input (skip input 0 which is the toSpend ref)
  for (let i = 0; i < vtxos.length; i++) {
    setArkPsbtField(intentProof, i + 1, VtxoTaprootTree, tapTree);
  }

  // Sign intent proof
  const signer = SingleKey.fromHex(userSecretKey);

  // Set condition witness (preimage) if claiming
  if (witnessData) {
    for (let i = 0; i < vtxos.length; i++) {
      setArkPsbtField(intentProof, i + 1, ConditionWitness, [witnessData]);
    }
  }

  const signedIntentProof = await signer.sign(intentProof);

  // Build and sign forfeit PSBTs
  const forfeitPkScript = hex.decode(serverInfo.forfeitAddress);
  const signedForfeitPsbts: string[] = [];

  for (const v of vtxos) {
    const forfeitInput = {
      txid: hex.decode(v.txid),
      index: v.vout,
      witnessUtxo: {
        script: pkScriptBytes,
        amount: BigInt(v.value),
      },
      tapLeafScript: [tapLeafScript],
      sequence: opts.locktime ? 0xfffffffe : undefined,
      sighashType: SigHash.ALL_ANYONECANPAY,
    };

    const forfeitTx = buildForfeitTx(
      [forfeitInput],
      forfeitPkScript,
      opts.locktime,
    );

    // Set taproot tree on the forfeit input
    setArkPsbtField(forfeitTx, 0, VtxoTaprootTree, tapTree);

    if (witnessData) {
      setArkPsbtField(forfeitTx, 0, ConditionWitness, [witnessData]);
    }

    const signedForfeit = await signer.sign(forfeitTx);
    signedForfeitPsbts.push(base64.encode(signedForfeit.toPSBT()));
  }

  // Serialize intent proof
  const intentProofBase64 = base64.encode(signedIntentProof.toPSBT());
  const intentMessageJson = Intent.encodeMessage(intentMessage);

  // POST to backend
  const settleUrl = `${lendaswapApiUrl.replace(/\/$/, "")}/api/delegate/settle`;
  const settleRes = await fetch(settleUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intent_proof: intentProofBase64,
      intent_message: intentMessageJson,
      forfeit_psbts: signedForfeitPsbts,
      cosigner_pk: cosignerPkHex,
    }),
  });

  if (!settleRes.ok) {
    const errBody = await settleRes.text();
    throw new Error(
      `Delegate settle failed: ${settleRes.status} ${errBody}`,
    );
  }

  const result = (await settleRes.json()) as { commitment_txid: string };
  return { commitmentTxid: result.commitment_txid };
}
