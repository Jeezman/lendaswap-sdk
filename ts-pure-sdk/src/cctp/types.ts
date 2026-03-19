/**
 * CCTP type definitions.
 */

/** Status of a CCTP attestation request. */
export type AttestationStatus = "pending_confirmations" | "complete";

/** Response from the IRIS attestation API (V2). */
export interface AttestationResponse {
  messages: Array<{
    message: string;
    attestation: string;
    status: AttestationStatus;
    eventNonce: string;
  }>;
}

/** Parameters for initiating a CCTP bridge. */
export interface BridgeParams {
  /** Amount of USDC to bridge (in smallest unit, e.g. 1000000 = 1 USDC). */
  amount: bigint;
  /** Source chain name (e.g. "Polygon"). */
  sourceChain: string;
  /** Destination chain name (e.g. "Ethereum"). */
  destinationChain: string;
  /** Recipient address on the destination chain. */
  mintRecipient: string;
}

/** Result of a CCTP burn (source chain). */
export interface BurnResult {
  /** Transaction hash of the burn. */
  txHash: string;
  /** CCTP message nonce. */
  nonce: bigint;
  /** Raw message bytes (hex-encoded). */
  messageBytes: string;
  /** keccak256 hash of the message bytes. */
  messageHash: string;
  /** Source domain ID. */
  sourceDomain: number;
}

/** Result of a CCTP mint (destination chain). */
export interface MintResult {
  /** Transaction hash of the mint on the destination chain. */
  txHash: string;
}
