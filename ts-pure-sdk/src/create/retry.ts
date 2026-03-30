/**
 * Retry helper for swap creation when the server rejects a duplicate hash lock.
 */

import type { CreateSwapContext } from "./types.js";

const MAX_RETRIES = 10;
const SKIP_COUNT = 10;

/**
 * Returns true if the error indicates a hash lock collision (409 Conflict
 * from the server, or a rejection for a reused preimage hash).
 */
function isHashCollisionError(message: string): boolean {
  return message.includes("a swap with this preimage hash exists already");
}

/**
 * Wraps a swap creation attempt with automatic retry on hash lock collisions.
 *
 * When the server returns 409 (duplicate hash lock) or rejects the
 * preimage, this skips the key index forward and retries with fresh params.
 *
 * @param ctx - The swap creation context (must include skipKeyIndices).
 * @param attempt - A function that derives params and creates the swap.
 *                  Called once per attempt; must call ctx.deriveSwapParams() internally.
 */
export async function retryOnHashCollision<T>(
  ctx: CreateSwapContext,
  attempt: () => Promise<T>,
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await attempt();
    } catch (e) {
      console.log(`Failed creating swap: ${e}`);

      if (e instanceof Error && isHashCollisionError(e.message)) {
        lastError = e;
        if (ctx.skipKeyIndices) {
          await ctx.skipKeyIndices(SKIP_COUNT);
        }
        continue;
      }
      throw e;
    }
  }

  throw lastError;
}
