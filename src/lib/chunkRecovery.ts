/**
 * §CHUNK-RECOVERY — survive a deploy that happened while the tab was open.
 *
 * Every production build ships content-hashed chunks (`assets/Game-<hash>.js`).
 * `index.html` is revalidated on a full load, but a tab that is already running
 * keeps the OLD shell in memory. Navigating client-side after a deploy then asks
 * for a chunk the new build has removed, and Vite's dynamic import rejects with
 *
 *   TypeError: Failed to fetch dynamically imported module: /assets/Game-<old>.js
 *
 * The route never mounts, so the player is stuck on the Suspense fallback (or a
 * raw stack trace) until they discover a hard refresh.
 *
 * Recovery: refetch the app shell once — with a unique query so even an edge
 * cache hands back fresh HTML — and let the new build pick its own chunk names.
 * Guarded by a short window so a genuinely broken deploy cannot loop the tab.
 */

const RETRY_KEY = "wcrpg:chunk-recovery:at";
const RETRY_PARAM = "__v";
/** One recovery attempt per window; inside it the shell is already fresh. */
const RETRY_WINDOW_MS = 20_000;

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

/** Is this the "that chunk is gone" failure (as opposed to an app bug)? */
export function isChunkLoadError(value: unknown): boolean {
  let message = "";
  if (typeof value === "string") message = value;
  else if (value instanceof Error) message = value.message;
  else if (value && typeof value === "object") {
    const candidate = (value as { message?: unknown }).message;
    if (typeof candidate === "string") message = candidate;
  }
  return CHUNK_ERROR_RE.test(message);
}

function clock(): number {
  const t = Date.now();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Refetch the app shell so the running tab picks up the current build.
 * Returns true when a reload was started (caller should stall, not throw).
 * Returns false when recovery was already tried — the failure is then real and
 * the caller must surface it instead of reloading forever.
 */
export function reloadForFreshBuild(): boolean {
  if (typeof window === "undefined") return false;

  let last = 0;
  try {
    last = Number(window.sessionStorage.getItem(RETRY_KEY) ?? 0);
  } catch {
    /* storage blocked (private mode) — treat as "never tried" */
  }
  if (!Number.isFinite(last)) last = 0;
  if (last > 0 && clock() - last < RETRY_WINDOW_MS) return false;

  try {
    window.sessionStorage.setItem(RETRY_KEY, String(clock()));
  } catch {
    /* best effort only */
  }

  try {
    const url = new URL(window.location.href);
    url.searchParams.set(RETRY_PARAM, String(clock()));
    // replace() keeps the recovery out of the back/forward history.
    window.location.replace(url.toString());
    return true;
  } catch {
    return false;
  }
}

/** Player-initiated reload: bypass the guard and the stale shell. */
export function forceFreshReload(): void {
  try {
    window.sessionStorage.removeItem(RETRY_KEY);
  } catch {
    /* ignore */
  }
  if (!reloadForFreshBuild()) {
    try {
      window.location.reload();
    } catch {
      /* nothing left to try */
    }
  }
}

/** Drop the cache-bust marker once the fresh shell has booted. */
function stripRetryParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(RETRY_PARAM)) return;
    url.searchParams.delete(RETRY_PARAM);
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  } catch {
    /* history/URL unavailable */
  }
}

/**
 * Wrap a route's dynamic import. A missing chunk triggers one shell reload;
 * while the browser navigates, the promise stays pending so Suspense keeps its
 * fallback up instead of unmounting the app with an error.
 */
export async function recoverableImport<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (isChunkLoadError(error) && reloadForFreshBuild()) {
      return new Promise<T>(() => {
        /* resolved by the incoming navigation */
      });
    }
    throw error;
  }
}

/**
 * Install the global hooks. Call once, before render.
 *
 * `prod` defaults to the build flag; it is injectable so the behaviour of both
 * branches can be exercised in a DOM test without a real production bundle.
 */
export function initChunkRecovery(options: { prod?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  const prod = options.prod ?? import.meta.env.PROD;
  stripRetryParam();

  // Vite fires this when a modulepreload / dynamic-import preload fails. The
  // default is a console error and a dead route; recover instead. Dev builds
  // are excluded: there a failed chunk means a code error, and reloading the
  // preview would only hide it.
  window.addEventListener("vite:preloadError", (event) => {
    if (!prod) return;
    if (reloadForFreshBuild()) event.preventDefault();
  });
}
