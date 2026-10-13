// DOM-level behavioural test for the cat customization SAVE button.
//
// The reported bug: pressing Save leaves the button on "Loading…"/"Saving…"
// forever and the cat is not persisted. Instead of pattern-matching source
// text, this mounts the REAL CatCustomizer in a real DOM and drives the REAL
// button: idle → Saving… → Saved successfully → idle, plus the failure and
// never-answering paths. The write callback is the test's own promise, so the
// button's state can be observed at every stage.
//
// Run: bun scripts/check-save-ui.ts

import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
// React 19 only flushes act() quietly when it knows it is in a test environment
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CatCustomizer } from "../src/pages/CatCustomizer";
import { normalizeSkin } from "../src/game/draw";
import { SAVE_TIMEOUT_MS } from "../src/game/saveFlow";

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  if (ok) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

const skin = normalizeSkin(undefined);

function mount(node: React.ReactElement): { root: Root; container: HTMLElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { root, container };
}

/** The bottom-bar SAVE button is the one whose label is a save action. */
function saveButton(container: HTMLElement): HTMLButtonElement | null {
  const buttons = [...container.querySelectorAll("button")];
  return (
    (buttons.find((b) => /^(Save Cat|Saving…|Loading…|Retry save)$/.test(b.textContent?.trim() ?? "")) as HTMLButtonElement) ??
    null
  );
}

async function flush(times = 6) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function main() {
  console.log("--- Save button: idle → saving → saved → idle ---");
  {
    let resolveWrite: ((v: void) => void) | null = null;
    const writes: unknown[] = [];
    const saved: unknown[] = [];
    const { container } = mount(
      createElement(CatCustomizer, {
        open: true,
        playerName: "Rusty",
        initialSkin: skin,
        savedSkin: skin,
        favorites: [],
        presets: [],
        onClose: () => undefined,
        onPersist: ({ skin: s }: never) => {
          writes.push(s);
          return new Promise<void>((res) => {
            resolveWrite = res as (v: void) => void;
          });
        },
        onSave: (v: never) => {
          saved.push(v);
        },
      }) as never,
    );

    const btn = saveButton(container);
    check(!!btn, "the Save Cat button is rendered");
    check(btn?.textContent?.trim() === "Save Cat", "it starts idle", btn?.textContent ?? "");
    check(btn?.disabled === false, "and is clickable");

    // 1) press SAVE — the REAL write is in flight now
    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    check(saveButton(container)?.textContent?.trim() === "Saving…", "while the write is in flight it says Saving…", saveButton(container)?.textContent ?? "");
    check(saveButton(container)?.disabled === true, "and cannot be double-submitted");
    check(writes.length === 1, "exactly ONE backend write started", `${writes.length}`);

    // 2) a second press while saving must NOT start another write
    act(() => {
      saveButton(container)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    check(writes.length === 1, "a second press while saving starts no extra write", `${writes.length}`);

    // 3) backend confirms
    await act(async () => {
      resolveWrite?.();
      await Promise.resolve();
    });
    await flush();
    const okLabel = container.textContent ?? "";
    check(okLabel.includes("Saved successfully"), "a confirmed write reports Saved successfully");
    check(saved.length === 1, "the editor is told to close exactly once", `${saved.length}`);
    check(saveButton(container)?.disabled === false, "the button is usable again after success");

    // 4) the confirmation clears itself back to idle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2600));
    });
    check(!(container.textContent ?? "").includes("Saved successfully"), "the confirmation clears after a moment");

    // 5) pressing again re-writes (a fresh look is not skipped)
    act(() => {
      saveButton(container)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    check(writes.length === 1, "the same already-confirmed look is not re-written", `${writes.length}`);
  }

  console.log("--- a FAILED write: error + Retry, never stuck ---");
  {
    let attempt = 0;
    const { container } = mount(
      createElement(CatCustomizer, {
        open: true,
        playerName: "Rusty",
        initialSkin: skin,
        savedSkin: skin,
        favorites: [],
        presets: [],
        onClose: () => undefined,
        onPersist: () => {
          attempt++;
          if (attempt === 1) return Promise.reject(new Error("Not signed in"));
          return Promise.resolve();
        },
        onSave: () => undefined,
      }) as never,
    );

    act(() => {
      saveButton(container)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    check(saveButton(container)?.textContent?.trim() === "Retry save", "a rejected write leaves a Retry button", saveButton(container)?.textContent ?? "");
    check((container.textContent ?? "").includes("Not signed in"), "the real reason is shown to the player");
    check(saveButton(container)?.disabled === false, "the button is never left disabled");

    // retry succeeds
    act(() => {
      saveButton(container)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    check(attempt === 2, "Retry performs a real second write", `${attempt}`);
    check((container.textContent ?? "").includes("Saved successfully"), "and a successful retry reports success");
  }

  console.log("--- a write that NEVER answers is a failure, not an endless spinner ---");
  {
    const started = Date.now();
    const { container } = mount(
      createElement(CatCustomizer, {
        open: true,
        playerName: "Rusty",
        initialSkin: skin,
        savedSkin: skin,
        favorites: [],
        presets: [],
        onClose: () => undefined,
        // never resolves, never rejects — a dead socket
        onPersist: () => new Promise<void>(() => undefined),
        onSave: () => undefined,
      }) as never,
    );

    act(() => {
      saveButton(container)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    check(saveButton(container)?.textContent?.trim() === "Saving…", "Saving… while pending");

    await act(async () => {
      await new Promise((r) => setTimeout(r, SAVE_TIMEOUT_MS + 400));
    });
    const elapsed = Date.now() - started;
    const label = saveButton(container)?.textContent?.trim();
    check(label === "Retry save", `a pending write ends in Retry save (after ${elapsed}ms)`, label ?? "");
    check(
      (container.textContent ?? "").includes("timed out"),
      "the timeout is reported as a failure reason (never a fake success)",
    );
    check(!(container.textContent ?? "").includes("Saved successfully"), "a timeout is NOT reported as saved");
  }

  console.log("--- the account row still loading: honest, bounded, disabled ---");
  {
    const { container } = mount(
      createElement(CatCustomizer, {
        open: true,
        playerName: "Rusty",
        initialSkin: skin,
        savedSkin: skin,
        favorites: [],
        presets: [],
        onClose: () => undefined,
        onPersist: () => Promise.resolve(),
        onSave: () => undefined,
        loading: true,
      }) as never,
    );
    const btn = saveButton(container);
    check(btn?.textContent?.trim() === "Loading…", "while the account row is genuinely in flight it says Loading…", btn?.textContent ?? "");
    check(btn?.disabled === true, "and Save is disabled (no write against a half-known row)");
  }

  console.log(failures === 0 ? "\nALL SAVE UI CHECKS PASS" : `\n${failures} SAVE UI CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
