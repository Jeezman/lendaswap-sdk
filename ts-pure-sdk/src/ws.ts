import type { SwapStatus } from "./api/client.js";

export type SwapStatusHandler = (swapId: string, status: SwapStatus) => void;

export interface SwapStatusWatcher {
  /**
   * Subscribe to status updates for the given swap ids. `onUpdate` fires for
   * every status change of any id in the set. Returns an unsubscribe function
   * that removes this handler from all of the passed ids at once (equivalent
   * to calling `unsubscribe(ids, onUpdate)`).
   */
  subscribe(ids: string[], onUpdate: SwapStatusHandler): () => void;
  /**
   * Remove `onUpdate` from the given swap ids. Any id whose subscriber set
   * becomes empty is unsubscribed on the wire; the socket closes once no ids
   * remain. No-op if `onUpdate` wasn't registered for those ids.
   */
  unsubscribe(ids: string[], onUpdate: SwapStatusHandler): void;
  /** Force-close the socket and drop all subscribers. */
  close(): void;
}

const MIN_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;

type Channel = "swap_status";

interface SubscribeFrame {
  op: "subscribe";
  channel: Channel;
  args: string[];
}

interface UnsubscribeFrame {
  op: "unsubscribe";
  channel: Channel;
  args: string[];
}

interface DataFrame {
  channel: Channel;
  data: Record<string, SwapStatus>;
}

interface AckFrame {
  op: "subscribed" | "unsubscribed";
  channel: Channel;
  args: string[];
}

interface ErrorFrame {
  op: string;
  message: string;
}

function httpToWs(baseUrl: string): string {
  const url = baseUrl.replace(/\/$/, "");
  if (url.startsWith("https://"))
    return `wss://${url.slice("https://".length)}/ws`;
  if (url.startsWith("http://"))
    return `ws://${url.slice("http://".length)}/ws`;
  return `${url}/ws`;
}

export function createSwapStatusWatcher(baseUrl: string): SwapStatusWatcher {
  const url = httpToWs(baseUrl);
  const subscribers = new Map<string, Set<SwapStatusHandler>>();
  let socket: WebSocket | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closingIntentionally = false;

  function ensureSocket(): void {
    if (socket && socket.readyState !== WebSocket.CLOSED) return;
    closingIntentionally = false;
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      reconnectAttempt = 0;
      const ids = Array.from(subscribers.keys());
      if (ids.length > 0) sendSubscribe(ids);
    });

    socket.addEventListener("message", (evt) => {
      let parsed: DataFrame | AckFrame | ErrorFrame;
      try {
        parsed = JSON.parse(evt.data as string);
      } catch {
        return;
      }
      if ("data" in parsed && parsed.channel === "swap_status") {
        for (const [swapId, status] of Object.entries(parsed.data)) {
          const set = subscribers.get(swapId);
          if (set) {
            for (const cb of set) cb(swapId, status);
          }
        }
      }
    });

    socket.addEventListener("close", () => {
      socket = null;
      if (closingIntentionally || subscribers.size === 0) return;
      scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      try {
        socket?.close();
      } catch {}
    });
  }

  function scheduleReconnect(): void {
    if (reconnectTimer) return;
    const delay = Math.min(
      MAX_RECONNECT_MS,
      MIN_RECONNECT_MS * 2 ** reconnectAttempt,
    );
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (subscribers.size > 0) ensureSocket();
    }, delay);
  }

  function sendSubscribe(ids: string[]): void {
    if (ids.length === 0 || socket?.readyState !== WebSocket.OPEN) return;
    const frame: SubscribeFrame = {
      op: "subscribe",
      channel: "swap_status",
      args: ids,
    };
    socket.send(JSON.stringify(frame));
  }

  function sendUnsubscribe(ids: string[]): void {
    if (ids.length === 0 || socket?.readyState !== WebSocket.OPEN) return;
    const frame: UnsubscribeFrame = {
      op: "unsubscribe",
      channel: "swap_status",
      args: ids,
    };
    socket.send(JSON.stringify(frame));
  }

  function closeIfIdle(): void {
    if (subscribers.size > 0) return;
    closingIntentionally = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    try {
      socket?.close();
    } catch {}
    socket = null;
  }

  function unsubscribe(ids: string[], onUpdate: SwapStatusHandler): void {
    const toUnsubscribe: string[] = [];
    for (const id of ids) {
      const set = subscribers.get(id);
      if (!set) continue;
      set.delete(onUpdate);
      if (set.size === 0) {
        subscribers.delete(id);
        toUnsubscribe.push(id);
      }
    }
    if (toUnsubscribe.length > 0) sendUnsubscribe(toUnsubscribe);
    closeIfIdle();
  }

  return {
    subscribe(ids, onUpdate) {
      const newlyAdded: string[] = [];
      for (const id of ids) {
        let set = subscribers.get(id);
        if (!set) {
          set = new Set();
          subscribers.set(id, set);
          newlyAdded.push(id);
        }
        set.add(onUpdate);
      }
      ensureSocket();
      if (newlyAdded.length > 0) sendSubscribe(newlyAdded);

      return () => unsubscribe(ids, onUpdate);
    },
    unsubscribe,
    close() {
      subscribers.clear();
      closeIfIdle();
    },
  };
}
