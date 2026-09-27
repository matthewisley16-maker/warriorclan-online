#!/usr/bin/env python3
# patch29_sync_tuning.py — two engine improvements found by check-sync.ts:
# 1. Anti-rubber-banding: cap the per-frame catch-up correction so remote
#    convergence never exceeds ~1.4x RUN_SPEED — small desyncs glide smoothly
#    instead of jerking.
# 2. Authoritative snap on packet discontinuity: if a new server sample is
#    REMOTE_SNAP_DIST px from the previous buffered sample, the stream jumped
#    (teleport/reconnect/server correction) — reset the buffer to the new
#    truth and snap the render immediately instead of racing across the map.
import io, sys

with io.open("src/game/engine.ts", encoding="utf-8") as f:
    e = f.read()

def sub1(src, old, new):
    global e
    n = src.count(old)
    if n != 1:
        print(f"FAIL: expected 1 match, got {n} for:\n{old[:160]}")
        sys.exit(1)
    e = src.replace(old, new)

# 1) new constant next to the others
sub1(
    e,
    "const REMOTE_SNAP_DIST = 250; // larger desync = authoritative correction",
    "const REMOTE_SNAP_DIST = 250; // larger desync = authoritative correction\nconst REMOTE_MAX_CATCHUP = 350; // max convergence speed px/s (anti rubber-band)",
)

# 2) discontinuity snap when buffering a new sample
sub1(
    e,
    """      const tick = r.serverTick ?? 0;
      if (tick > cur.serverTick) {
        // a newer server state arrived: buffer it (bounded) and advance
        const s = this.remoteStateOf(r, nowMs);
        cur.buffer.push(s);""",
    """      const tick = r.serverTick ?? 0;
      if (tick > cur.serverTick) {
        // a newer server state arrived: buffer it (bounded) and advance
        const s = this.remoteStateOf(r, nowMs);
        const last = cur.buffer[cur.buffer.length - 1];
        if (last && Math.hypot(s.x - last.x, s.y - last.y) > REMOTE_SNAP_DIST) {
          // discontinuity: the cat teleported server-side (correction,
          // reconnect). Reset the timeline to the new truth and snap now.
          cur.buffer = [s];
          cur.x = s.x;
          cur.y = s.y;
          cur.pose = s.pose;
          cur.serverTick = tick;
          cur.receivedAt = s.receivedAt;
          continue;
        }
        cur.buffer.push(s);""",
)

# 3) capped catch-up: replaces the pure exponential ease
sub1(
    e,
    """    // --- large desync: snap (authoritative correction, no slow drift back) ---
    const drift = Math.hypot(nx - cur.x, ny - cur.y);
    if (drift > REMOTE_SNAP_DIST) {
      cur.x = nx;
      cur.y = ny;
    } else {
      // anti-rubber-banding: glide toward the timeline, never teleport
      const k = 1 - Math.exp(-dt * REMOTE_SOFT_CATCHUP);
      cur.x += (nx - cur.x) * k;
      cur.y += (ny - cur.y) * k;
    }""",
    """    // --- correction: glide toward the timeline, capped so convergence can
    // never outrun plausible movement (anti rubber-banding) ---
    const drift = Math.hypot(nx - cur.x, ny - cur.y);
    if (drift > 0.01) {
      const step = Math.min(drift, REMOTE_MAX_CATCHUP * dt);
      cur.x += ((nx - cur.x) / drift) * step;
      cur.y += ((ny - cur.y) / drift) * step;
    }""",
)

with io.open("src/game/engine.ts", "w", encoding="utf-8") as f:
    f.write(e)
print("ok engine.ts catch-up cap + discontinuity snap")
