// WarriorCatsRPG — the customization SAVE QUEUE.
//
// One serialized writer for appearance writes, extracted so its behaviour is
// testable without a browser (it used to be inline in CatCustomizer). The rules
// it enforces are the fix for the reported \"Save stuck loading forever\" bug:
//
//   1. Writes never overlap: at most one backend write is in flight, and they
//      run in the order they were requested.
//   2. Every caller is answered with the REAL outcome of the write of ITS OWN
//      item. The old inline version answered a queued save with an immediate
//      `true`, so the editor closed and claimed \"Saved successfully\" while the
//      write was still in flight — and could still fail.
//   3. A write that never settles can never hang the queue: the bounded write
//      (`withTimeout`) resolves to `false`, which is reported as a FAILURE.
//   4. An item already confirmed written this session is not written again
//      (no duplicate save requests) — and only a CONFIRMED write may shortcut.
//
// It never reports success on its own: `save()` resolves true only after the
// supplied `write` resolved true for that item.

export type SaveState = "saving" | "saved" | "failed";

export interface SaveQueue<T> {
  /** Queue a write; resolves with the truth about THIS item's write. */
  save(item: T): Promise<boolean>;
  /** True while a write is in flight (drives the disabled Save button). */
  readonly busy: boolean;
}

export function createSaveQueue<T>(opts: {
  /** The bounded backend write. Resolves `true` only on a confirmed save. */
  write: (item: T) => Promise<boolean>;
  /** Content identity, for skipping an item already confirmed this session. */
  key?: (item: T) => string;
  /** Notified around every write: "saving", then "saved" or "failed". */
  onState?: (state: SaveState) => void;
}): SaveQueue<T> {
  const keyOf = opts.key ?? ((item: T) => JSON.stringify(item));
  interface Req {
    item: T;
    key: string;
    waiters: ((ok: boolean) => void)[];
  }
  const queue: Req[] = [];
  let inFlight = false;
  let last: { key: string; ok: boolean } | null = null;

  const drain = async (): Promise<void> => {
    if (inFlight) return; // rule 1: one writer only
    inFlight = true;
    while (queue.length) {
      const req = queue.shift()!;
      opts.onState?.("saving");
      let ok = false;
      try {
        ok = await opts.write(req.item);
      } catch (err) {
        // a throwing write is a FAILED save, never a swallowed success
        console.error("[save-queue] write threw", err);
        ok = false;
      }
      last = { key: req.key, ok };
      opts.onState?.(ok ? "saved" : "failed");
      // rule 2: answer every waiter with the outcome of ITS OWN item's write
      for (const waiter of req.waiters) waiter(ok === true);
    }
    inFlight = false;
  };

  return {
    save(item: T): Promise<boolean> {
      const key = keyOf(item);
      // rule 4: already confirmed on the server this session — no duplicate write
      if (!inFlight && queue.length === 0 && last?.ok === true && last.key === key) {
        return Promise.resolve(true);
      }
      return new Promise<boolean>((resolve) => {
        const tail = queue[queue.length - 1];
        if (tail && tail.key === key) tail.waiters.push(resolve); // same look queued twice
        else queue.push({ item, key, waiters: [resolve] });
        void drain();
      });
    },
    get busy() {
      return inFlight;
    },
  };
}
