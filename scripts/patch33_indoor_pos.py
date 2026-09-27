#!/usr/bin/env python3
# patch33_indoor_pos.py — inside an interior the engine's px/py are ROOM-LOCAL
# coordinates. Broadcasting them makes other players see a ghost cat near the
# world origin. While inside: heartbeats send the last OUTDOOR position (the
# cat reads as sitting at the den it entered) and the 300ms movement sync
# pauses until the player walks back out.
import io, sys

def sub1(src, old, new, path):
    n = src.count(old)
    if n != 1:
        print(f"FAIL {path}: expected 1 match, got {n} for:\n{old[:160]}")
        sys.exit(1)
    return src.replace(old, new)

with io.open("src/pages/Game.tsx", encoding="utf-8") as f:
    g = f.read()

# refs next to inputSeq
g = sub1(
    g,
    """  /** monotonic client input sequence — the server rejects already-processed inputs */
  const inputSeq = useRef(0);""",
    """  /** monotonic client input sequence — the server rejects already-processed inputs */
  const inputSeq = useRef(0);
  /** live interior id (null = outdoors); engine coords are room-local inside */
  const interiorRef = useRef<string | null>(null);
  /** last known OUTDOOR world position — what presence broadcasts */
  const outdoorRef = useRef({ x: 0, y: 0 });""",
    "src/pages/Game.tsx",
)

# callbacks: track interior + outdoor position
g = sub1(
    g,
    "      onMove: (x, y) => setPos({ x, y }),",
    """      onMove: (x, y) => {
        if (!interiorRef.current) outdoorRef.current = { x, y };
        setPos({ x, y });
      },""",
    "src/pages/Game.tsx",
)
g = sub1(
    g,
    "      onInteriorChange: (id) => setInterior(id),",
    """      onInteriorChange: (id) => {
        interiorRef.current = id;
        setInterior(id);
      },""",
    "src/pages/Game.tsx",
)

# 5s presence heartbeat: outdoor position + no movement state while inside
g = sub1(
    g,
    """        const g = gameRef.current;
        if (!g) return;
        heartbeat({
          inputSequence: ++inputSeq.current,
          x: posRef.current.x,
          y: posRef.current.y,
          ...movementSample(g),
          mode: "open",""",
    """        const g = gameRef.current;
        if (!g) return;
        const p = interiorRef.current ? outdoorRef.current : posRef.current;
        const m = interiorRef.current ? { facing: 1, moving: false } : movementSample(g);
        heartbeat({
          inputSequence: ++inputSeq.current,
          x: p.x,
          y: p.y,
          ...m,
          mode: "open",""",
    "src/pages/Game.tsx",
)

# 300ms movement sync: pause while inside an interior
g = sub1(
    g,
    """      sync = window.setInterval(() => {
        const g = gameRef.current;
        if (!g) return;
        const s = g.engineState();""",
    """      sync = window.setInterval(() => {
        const g = gameRef.current;
        if (!g || interiorRef.current) return; // room-local coords are not world positions
        const s = g.engineState();""",
    "src/pages/Game.tsx",
)

# ping sampler: outdoor position too
g = sub1(
    g,
    """        await heartbeat({
          x: posRef.current.x,
          y: posRef.current.y,
          ...movementSample(gameRef.current),
          mode: mode === "story" ? "story" : "open",""",
    """        const p = interiorRef.current ? outdoorRef.current : posRef.current;
        await heartbeat({
          x: p.x,
          y: p.y,
          ...(interiorRef.current ? { facing: 1, moving: false } : movementSample(gameRef.current)),
          mode: mode === "story" ? "story" : "open",""",
    "src/pages/Game.tsx",
)

with io.open("src/pages/Game.tsx", "w", encoding="utf-8") as f:
    f.write(g)
print("ok src/pages/Game.tsx indoor position handling")
