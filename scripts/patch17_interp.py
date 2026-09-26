#!/usr/bin/env python3
"""Patch 17: client interpolation + inputSequence + worldTime/weather authority."""
import io

# ================= engine.ts: RemotePlayer fields + interpolation =================
p = 'src/game/engine.ts'
src = io.open(p, encoding='utf-8').read()

old = """export interface RemotePlayer {
  userId: string;
  catName: string;
  clan?: string;
  rank?: string;
  appearance: CatSkin;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  emote?: string;
}"""
assert src.count(old) == 1, "RemotePlayer"
src = src.replace(old, """export interface RemotePlayer {
  userId: string;
  catName: string;
  clan?: string;
  rank?: string;
  appearance: CatSkin;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  emote?: string;
  // server authority metadata (ordering + staleness rejection)
  serverTick?: number;
  stateVersion?: number;
  lastProcessedInput?: number;
}""")

# interpolation buffer on the engine
old2 = "  // multiplayer remotes (set by React)\n  public remotes = new Map<string, RemotePlayer>();"
assert src.count(old2) == 1, "remotes field"
src = src.replace(old2, """  // multiplayer remotes (set by React) — rendered positions are interpolated
  // toward the latest SERVER state (smooth movement, no packet-snap)
  public remotes = new Map<string, RemotePlayer>();
  /** render positions for remote cats: eased toward server state each frame */
  private remoteRender = new Map<string, { x: number; y: number; facing: number }>();""")

# update() — ease render positions toward authoritative server positions
old3 = """    // --- prey AI ---"""
assert src.count(old3) == 1, "prey anchor"
src = src.replace(old3, """    // --- remote interpolation: ease toward the latest SERVER-confirmed state.
    // Never render raw packet positions; stale updates (older stateVersion)
    // were already rejected by the server, so easing here is always toward
    // the newest accepted state. ---
    for (const [uid, r] of this.remotes) {
      const cur = this.remoteRender.get(uid) ?? { x: r.x, y: r.y, facing: r.facing };
      const k = 1 - Math.pow(0.001, dt); // smooth ~100ms catch-up
      cur.x += (r.x - cur.x) * k;
      cur.y += (r.y - cur.y) * k;
      if (r.facing !== cur.facing) cur.facing = r.facing;
      this.remoteRender.set(uid, cur);
    }
    for (const uid of [...this.remoteRender.keys()]) {
      if (!this.remotes.has(uid)) this.remoteRender.delete(uid);
    }

    // --- prey AI ---""")

# render remotes using interpolated positions
old4 = """    // remote players
    for (const [, r] of this.remotes) {
      if (r.x < viewL - 60 || r.x > viewR + 60 || r.y < viewT - 60 || r.y > viewB + 60) continue;
      ents.push({
        y: r.y,
        draw: () => {
          drawCat(
            ctx,
            { ...r.appearance },
            r.x,
            r.y,"""
assert src.count(old4) == 1, "remote render"
src = src.replace(old4, """    // remote players (interpolated render positions)
    for (const [uid, r] of this.remotes) {
      const rp = this.remoteRender.get(uid) ?? r;
      if (rp.x < viewL - 60 || rp.x > viewR + 60 || rp.y < viewT - 60 || rp.y > viewB + 60) continue;
      ents.push({
        y: rp.y,
        draw: () => {
          drawCat(
            ctx,
            { ...r.appearance },
            rp.x,
            rp.y,""")
# fix remaining r.x/r.y references inside that draw closure (label + bubble anchor)
i = src.find("    // remote players (interpolated render positions)")
j = src.find("// player\n", i)
seg = src[i:j]
seg2 = seg.replace("ctx.roundRect(r.x - tw / 2 - 7, r.y - 47, tw + 14, sub ? 29 : 17, 8);", "ctx.roundRect(rp.x - tw / 2 - 7, rp.y - 47, tw + 14, sub ? 29 : 17, 8);")
seg2 = seg2.replace('ctx.fillText(label, r.x, r.y - 35);', 'ctx.fillText(label, rp.x, rp.y - 35);')
seg2 = seg2.replace('ctx.fillText(sub, r.x, r.y - 24);', 'ctx.fillText(sub, rp.x, rp.y - 24);')
src = src[:i] + seg2 + src[j:]

# bubble tracking uses interpolated positions too
old5 = """      } else if (b.track) {
        // follow the remote cat; drop the bubble if that player left
        const r = this.remotes.get(b.track);
        if (!r) continue;
        bx = r.x;"""
assert src.count(old5) == 1, "bubble track"
src = src.replace(old5, """      } else if (b.track) {
        // follow the remote cat (interpolated); drop if that player left
        const r = this.remoteRender.get(b.track) ?? this.remotes.get(b.track);
        if (!r) continue;
        bx = r.x;""")

io.open(p, 'w', encoding='utf-8').write(src)
print("engine: interpolation + serverTick metadata")

# ================= Game.tsx: inputSequence + interpolation-friendly remotes =================
p = 'src/pages/Game.tsx'
src = io.open(p, encoding='utf-8').read()

# monotonic input sequence ref
old6 = "  /** guards against double-sends when Enter is pressed repeatedly */\n  const lastSendAt = useRef(0);"
assert src.count(old6) == 1, "lastSendAt"
src = src.replace(old6, """  /** guards against double-sends when Enter is pressed repeatedly */
  const lastSendAt = useRef(0);
  /** monotonic client input sequence — the server rejects already-processed inputs */
  const inputSeq = useRef(0);""")

# heartbeat sends inputSequence
old7 = """        heartbeat({
          x: posRef.current.x,
          y: posRef.current.y,
          facing: 1,
          moving: false,
          mode: "open","""
assert src.count(old7) == 1, "heartbeat call"
src = src.replace(old7, """        heartbeat({
          inputSequence: ++inputSeq.current,
          x: posRef.current.x,
          y: posRef.current.y,
          facing: 1,
          moving: false,
          mode: "open",""")

io.open(p, 'w', encoding='utf-8').write(src)
print("Game.tsx: inputSequence on heartbeats")
