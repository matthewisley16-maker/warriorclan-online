#!/usr/bin/env python3
"""Patch 19: sign out on title screen + per-account cache isolation."""
import io

# ============ MainMenu.tsx: SIGNED IN AS + SIGN OUT ============
p = 'src/pages/MainMenu.tsx'
src = io.open(p, encoding='utf-8').read()

# imports
old = 'import { useMutation, useQuery } from "convex/react";'
if old not in src:
    # add convex imports near top
    anchor = 'import { useEffect, useMemo, useRef, useState } from "react";'
    assert src.count(anchor) == 1, "react import"
    src = src.replace(anchor, anchor + '\nimport { useMutation } from "convex/react";\nimport { useAuthActions } from "@convex-dev/auth/react";')

# sign out button + confirm dialog on the menu screen
old2 = 'export default function MainMenu({'
assert src.count(old2) == 1, "MainMenu"
src = src.replace(old2, '''function SignOutControl() {
  const { signOut } = useAuthActions();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const savePosition = useMutation(api.players.savePosition);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  const doSignOut = async () => {
    setBusy(true);
    // 1-2: flush a final position save and CONFIRM it completed before
    // touching the session (the cat row itself is already autosaved).
    try {
      setSaveState("saving");
      const raw = localStorage.getItem("wcrpg-last-pos");
      const pos = raw ? (JSON.parse(raw) as { x: number; y: number }) : null;
      if (pos) await savePosition({ x: pos.x, y: pos.y });
      setSaveState("saved");
      // 3-5: safe disconnect → the auth session is cleared; saved cats stay.
      await signOut();
      window.location.hash = "";
      window.location.reload(); // guarantees zero in-memory carryover
    } catch {
      // 6: never sign out while an important save is pending
      setSaveState("failed");
      setBusy(false);
      return;
    }
  };

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        Sign out
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {saveState === "saving" && <span className="text-[11px] text-amber-300">SAVING…</span>}
      {saveState === "saved" && <span className="text-[11px] text-green-400">SAVED!</span>}
      {saveState === "failed" && <span className="text-[11px] text-red-400">SAVE FAILED — TRY AGAIN</span>}
      <button
        onClick={() => setConfirming(false)}
        className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/70 hover:bg-white/10"
      >
        Cancel
      </button>
      <button
        onClick={doSignOut}
        disabled={busy}
        className="rounded-full bg-red-500/80 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-red-500 disabled:opacity-50"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

export default function MainMenu({''')

io.open(p, 'w', encoding='utf-8').write(src)
print("SignOutControl added")

# ============ Game.tsx: persist last position for the sign-out flush ============
p = 'src/pages/Game.tsx'
src = io.open(p, encoding='utf-8').read()
old3 = """  const posRef = useRef(pos);
  posRef.current = pos;"""
assert src.count(old3) == 1, "posRef"
src = src.replace(old3, """  const posRef = useRef(pos);
  posRef.current = pos;
  // persisted for the sign-out flush (save-before-sign-out guarantee)
  useEffect(() => {
    try {
      localStorage.setItem("wcrpg-last-pos", JSON.stringify({ x: pos.x, y: pos.y }));
    } catch { /* storage unavailable */ }
  }, [pos.x, pos.y]);""")

io.open(p, 'w', encoding='utf-8').write(src)
print("position persistence added")
