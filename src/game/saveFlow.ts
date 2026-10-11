// WarriorCatsRPG — shared save-flow primitives.
//
// The customization SAVE must ALWAYS end in a definite state. The backend
// write is a promise (a Convex mutation) that — when the socket is down, the
// deployment is being swapped, or the request is simply slow — can stay
// PENDING FOREVER: it neither resolves nor rejects. A UI that awaits it
// directly therefore hangs on "Saving…" with no way out. Everything that
// touches the write goes through `withTimeout` so a pending request is
// reported as a FAILURE (never as a success), the editor keeps the player's
// edits on screen and offers Retry.
//
// Kept dependency-free so both the editor and the check suites can drive it.

/** How long a single appearance write may stay pending before it is reported
 *  as a failure. Convex mutations normally confirm in well under a second;
 *  15s leaves room for a slow phone connection while still guaranteeing that
 *  the editor can never be stuck loading indefinitely. */
export const SAVE_TIMEOUT_MS = 15_000;

/** A write that never answered in time. Never treated as a successful save. */
export class SaveTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveTimeoutError";
  }
}

/**
 * Await `work` but give up after `ms`. `work` may be a promise or a thunk
 * (a thunk also catches a synchronous throw). The timeout path REJECTS with a
 * `SaveTimeoutError`; the abandoned promise is simply ignored, so a late
 * arrival can never be mistaken for the save we reported as failed.
 */
export async function withTimeout<T>(
  work: Promise<T> | (() => Promise<T> | T),
  ms: number = SAVE_TIMEOUT_MS,
  label = "save",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const pending = typeof work === "function" ? Promise.resolve().then(work) : work;
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new SaveTimeoutError(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** A short, player-readable reason for a failed write. */
export function errorMessage(err: unknown): string {
  if (err instanceof SaveTimeoutError) return "the request timed out — check your connection and try again";
  if (err instanceof Error && err.message) return err.message;
  const s = String(err);
  return s && s !== "undefined" ? s : "unknown error";
}
