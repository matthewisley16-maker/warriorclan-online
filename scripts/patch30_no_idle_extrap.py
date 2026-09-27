#!/usr/bin/env python3
# patch30_no_idle_extrap.py — a stationary remote must never coast: hold the
# authoritative position through packet stalls. Only genuinely moving states
# extrapolate along their velocity.
import io, sys

with io.open("src/game/engine.ts", encoding="utf-8") as f:
    e = f.read()

OLD = """    } else {
      // past the newest sample: brief safe extrapolation along its velocity,
      // then hold the authoritative position (never run away from the server)
      const prev = buf.length > 1 ? buf[buf.length - 2] : b;
      const dtS = Math.max(1, b.receivedAt - prev.receivedAt) / 1000;
      const overS = Math.min(Math.max(0, (targetMs - b.receivedAt) / 1000), REMOTE_EXTRAPOLATE_MS / 1000);
      nx = b.x + ((b.x - prev.x) / dtS) * overS;
      ny = b.y + ((b.y - prev.y) / dtS) * overS;
      const d = Math.hypot(nx - b.x, ny - b.y);
      if (d > REMOTE_MAX_EXTRAP) {
        nx = b.x + ((nx - b.x) / d) * REMOTE_MAX_EXTRAP;
        ny = b.y + ((ny - b.y) / d) * REMOTE_MAX_EXTRAP;
      }
    }"""
NEW = """    } else if (b.pose === "walk" || b.pose === "run") {
      // past the newest sample of a MOVING cat: brief safe extrapolation along
      // its velocity, distance-capped so it can never run away from the server
      const prev = buf.length > 1 ? buf[buf.length - 2] : b;
      const dtS = Math.max(1, b.receivedAt - prev.receivedAt) / 1000;
      const overS = Math.min(Math.max(0, (targetMs - b.receivedAt) / 1000), REMOTE_EXTRAPOLATE_MS / 1000);
      nx = b.x + ((b.x - prev.x) / dtS) * overS;
      ny = b.y + ((b.y - prev.y) / dtS) * overS;
      const d = Math.hypot(nx - b.x, ny - b.y);
      if (d > REMOTE_MAX_EXTRAP) {
        nx = b.x + ((nx - b.x) / d) * REMOTE_MAX_EXTRAP;
        ny = b.y + ((ny - b.y) / d) * REMOTE_MAX_EXTRAP;
      }
    } else {
      // stationary states (idle/sit/...) hold the authoritative position —
      // a stopped cat never coasts through a packet stall
      nx = b.x;
      ny = b.y;
    }"""
n = e.count(OLD)
if n != 1:
    print(f"FAIL: expected 1 match, got {n}")
    sys.exit(1)
e = e.replace(OLD, NEW)
with io.open("src/game/engine.ts", "w", encoding="utf-8") as f:
    f.write(e)
print("ok stationary states hold through stalls")
