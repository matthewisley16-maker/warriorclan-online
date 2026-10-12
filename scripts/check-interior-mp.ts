// Two-player ONLINE interior multiplayer suite.
//
// The reported bug: in multiplayer, entering a house made the other player
// vanish (or the entrant kept appearing outside), and the session could get
// stuck. This suite drives BOTH halves of the pipeline as written:
//
//   1. the SERVER — the real presence.heartbeat / listOnline / leave handlers
//      over a fake Convex auth + in-memory db, proving that a player's SPACE
//      (outdoors vs a specific interior id) travels with their position, that a
//      legitimate enter/exit is never mistaken for a teleport, and that the
//      authority still rejects impossible jumps WITHIN a space;
//   2. the ENGINE — two real GameCanvas instances plus a transform-aware
//      recording 2D context, proving that another player's cat is actually
//      PAINTED inside the room they share (at room-local coordinates, in the
//      right depth order, with cleanup when they leave) and is never painted
//      into a space it does not belong to.
//
// Run: bun scripts/check-interior-mp.ts

import fs from "node:fs";
import { heartbeat as heartbeatFn, listOnline as listOnlineFn, leave as leaveFn } from "../src/convex/presence";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ===========================================================================
// PART 1 — the server: space-aware presence
// ===========================================================================
console.log("\n--- 1. presence carries the SPACE, not just coordinates ---");

type Handler = (ctx: unknown, args: never) => Promise<unknown>;
const callHeartbeat = (heartbeatFn as unknown as { _handler: Handler })._handler;
const callListOnline = (listOnlineFn as unknown as { _handler: Handler })._handler;
const callLeave = (leaveFn as unknown as { _handler: Handler })._handler;

interface Doc {
  _id: string;
  _creationTime: number;
  [k: string]: unknown;
}
function makeDb() {
  const tables = new Map<string, Doc[]>();
  let seq = 0;
  const rows = (name: string): Doc[] => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  };
  const builder = (name: string, conds: [string, unknown][]) => {
    const match = (d: Doc) => conds.every(([f, v]) => d[f] === v);
    const api: Record<string, unknown> = {
      withIndex: (_index: string, cb: (q: { eq: (f: string, v: unknown) => unknown }) => unknown) => {
        const local: [string, unknown][] = [];
        cb({ eq: (f, v) => (local.push([f, v]), undefined) });
        return builder(name, local);
      },
      first: async () => rows(name).find(match) ?? null,
      collect: async () => rows(name).filter(match),
      take: async (n: number) => rows(name).filter(match).slice(0, n),
      order: () => api,
      unique: async () => rows(name).find(match) ?? null,
    };
    return api;
  };
  const db = {
    query: (name: string) => builder(name, []),
    get: async (id: string) => [...tables.values()].flat().find((d) => d._id === id) ?? null,
    insert: async (name: string, doc: Record<string, unknown>) => {
      const _id = `${name}:${++seq}`;
      rows(name).push({ _id, _creationTime: seq, ...doc });
      return _id;
    },
    patch: async (id: string, patch: Record<string, unknown>) => {
      const d = [...tables.values()].flat().find((x) => x._id === id);
      if (!d) throw new Error(`no document ${id}`);
      Object.assign(d, patch);
    },
    delete: async (id: string) => {
      for (const [k, list] of tables) tables.set(k, list.filter((r) => r._id !== id));
    },
  };
  return { db, rowOf: (name: string, userId: string) => rows(name).find((r) => r.userId === userId) ?? null };
}
function ctxFor(userId: string | null, db: unknown) {
  return {
    auth: {
      getUserIdentity: async () =>
        userId === null ? null : { subject: `${userId}|session-1`, issuer: "test", tokenIdentifier: "test" },
    },
    db,
  };
}

const { db, rowOf } = makeDb();
const A_CTX = ctxFor("user-a", db);
const B_CTX = ctxFor("user-b", db);

const SKIN = {
  fur: "#b5713f", furDark: "#8a5528", eye: "#4d9086",
  pattern: "tabby", furLength: 1, tail: "normal", ears: "normal", size: 1, scar: false,
};
const OUTDOOR_A = { x: 2100, y: 4500 };
const OUTDOOR_B = { x: 2140, y: 4520 };
const ROOM_A = { x: 220, y: 300 }; // room-local px inside house-a
let seq = 0;
const hb = (ctx: unknown, args: Record<string, unknown>) =>
  callHeartbeat(ctx, { catName: "Cat", rank: "apprentice", appearance: SKIN, inputSequence: ++seq, ...args } as never);

// --- both players outdoors: their rows say "no interior" --------------------
await hb(A_CTX, { ...OUTDOOR_A, facing: 1, moving: false, mode: "open", interior: null });
let aRow = rowOf("presence", "user-a");
check("outdoors: a player's space is null (the outdoor world)", aRow?.interior === null, `interior=${String(aRow?.interior)}`);
check("outdoors: the outdoor position is stored verbatim", aRow?.x === OUTDOOR_A.x && aRow?.y === OUTDOOR_A.y);
check("outdoors: the row is a real, typed presence row", typeof aRow?.updatedAt === "number" && typeof aRow?.stateVersion === "number");

// --- A walks into house-a: room-local coordinates + the interior id ---------
await hb(A_CTX, { ...ROOM_A, facing: -1, moving: true, mode: "open", interior: "house-a", movementState: "walk", animationState: "walk" });
aRow = rowOf("presence", "user-a");
check("entering: the interior id is stored (the row knows WHERE, not just how far)", aRow?.interior === "house-a", `interior=${String(aRow?.interior)}`);
check(
  "entering: the room-local position is accepted — a space change is NOT clamped back to the old world position",
  aRow?.x === ROOM_A.x && aRow?.y === ROOM_A.y,
  `stored=(${String(aRow?.x)},${String(aRow?.y)}) sent=(${ROOM_A.x},${ROOM_A.y})`,
);
check("entering: movement state still synchronizes indoors", aRow?.movementState === "walk" && aRow?.animationState === "walk");

// --- the authority still bites WITHIN a space, while a space change is NOT a
//     teleport: the very same step, once inside one space and once through a
//     door, must be judged differently -----------------------------------------
await hb(A_CTX, { x: 220, y: 300, facing: 1, moving: false, mode: "open", interior: "house-a" });
await hb(A_CTX, { x: 620, y: 300, facing: 1, moving: true, mode: "open", interior: "house-a" });
aRow = rowOf("presence", "user-a");
check(
  "same space: an impossible step is still rejected by the speed authority",
  aRow?.x === 220,
  `x=${String(aRow?.x)} (expected the last confirmed 220)`,
);
await hb(A_CTX, { x: 620, y: 300, facing: 1, moving: true, mode: "open", interior: null });
aRow = rowOf("presence", "user-a");
check(
  "space change: the identical step IS accepted — the coordinate system changed (room px ⇄ world px)",
  aRow?.x === 620 && aRow?.y === 300 && aRow?.interior === null,
  `x=${String(aRow?.x)} interior=${String(aRow?.interior)}`,
);
// back in the room for the rest of the server section
await hb(A_CTX, { ...ROOM_A, facing: -1, moving: true, mode: "open", interior: "house-a", movementState: "walk", animationState: "walk" });

// --- B walks in too, and each client can tell the two spaces apart ----------
await hb(B_CTX, { ...OUTDOOR_B, facing: 1, moving: false, mode: "open", interior: null });
let listForB = (await callListOnline(B_CTX as never, {} as never)) as { userId: string; interior: string | null; x: number; y: number }[];
check("A in a house, B outside: B's view reports A inside house-a", listForB.find((r) => r.userId === "user-a")?.interior === "house-a");
check("...and keeps A's position (room-local, useless outdoors but truthful)", listForB.find((r) => r.userId === "user-a")?.x === ROOM_A.x);
check("B still sees the outdoor world for himself? (self is excluded from the list)", listForB.every((r) => r.userId !== "user-b"));

await hb(B_CTX, { ...ROOM_A, facing: 1, moving: false, mode: "open", interior: "house-a" });
let listForA = (await callListOnline(A_CTX as never, {} as never)) as { userId: string; interior: string | null }[];
check("both inside the same house: each sees the other in the SAME room id", listForA.find((r) => r.userId === "user-b")?.interior === "house-a");
check("late entrant: the players already inside are in the list the moment they join", listForA.length === 1);

// --- B moves inside: A receives B's movement in room coordinates ------------
await hb(B_CTX, { x: ROOM_A.x + 45, y: ROOM_A.y + 12, facing: 1, moving: true, mode: "open", interior: "house-a", movementState: "walk", animationState: "walk" });
listForA = (await callListOnline(A_CTX as never, {} as never)) as { userId: string; interior: string | null; x: number; y: number }[];
const bInRoom = listForA.find((r) => r.userId === "user-b");
check(
  "inside, movement is synchronized through the same channel as outdoors (a plausible step is accepted)",
  bInRoom?.x === ROOM_A.x + 45 && bInRoom?.y === ROOM_A.y + 12,
  `stored=(${String(bInRoom?.x)},${String(bInRoom?.y)})`,
);

// --- a player in a DIFFERENT interior is a different space ------------------
await hb(B_CTX, { x: 400, y: 260, facing: 1, moving: false, mode: "open", interior: "house-b" });
listForA = (await callListOnline(A_CTX as never, {} as never)) as { userId: string; interior: string | null }[];
check("a player in another house is identifiable as a DIFFERENT space", listForA.find((r) => r.userId === "user-b")?.interior === "house-b");

// --- B walks back outside: the space returns to null and the world position is
//     a real world position again (never the room-local leftover) ------------
await hb(B_CTX, { ...OUTDOOR_B, facing: 1, moving: false, mode: "open", interior: null });
const bRow = rowOf("presence", "user-b");
check("exiting: the space goes back to the outdoor world", bRow?.interior === null);
check("exiting: the outdoor position is stored again (restored, not the room's)", bRow?.x === OUTDOOR_B.x && bRow?.y === OUTDOOR_B.y);

// --- legacy rows / older clients -------------------------------------------
{
  const legacy = makeDb();
  const ctx = ctxFor("user-c", legacy.db);
  await callHeartbeat(ctx, {
    x: 100, y: 100, facing: 1, moving: false, mode: "open", catName: "Old", rank: "apprentice", appearance: SKIN,
  } as never);
  const row = legacy.rowOf("presence", "user-c");
  check("a client that never sends the field (or a pre-interior row) reads as OUTDOORS", row?.interior === null);
  const list = (await callListOnline(ctxFor("user-d", legacy.db) as never, {} as never)) as { interior: string | null }[];
  check("...and is projected as outdoors to everyone else", list.every((r) => r.interior === null));
}

// --- leaving removes the row (no stale cats left in a room) -----------------
await callLeave(B_CTX as never, {} as never);
listForA = (await callListOnline(A_CTX as never, {} as never)) as { userId: string }[];
check("leaving removes the presence row outright (no ghost cat left indoors)", !listForA.some((r) => r.userId === "user-b"));

// ===========================================================================
// PART 2 — the engine: rendering other players inside a house
// ===========================================================================

// ---- a transform-aware recording context (tracks translate/scale/rotate) ---
const gradient = { addColorStop: () => undefined };
type Mat = [number, number, number, number, number, number];
const IDENT: Mat = [1, 0, 0, 1, 0, 0];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const applyPt = (m: Mat, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

let ops: { op: string; x: number; y: number }[] = [];
let recording = false;
let mat: Mat = [...IDENT] as Mat;
const stack: Mat[] = [];
// The camera transform (translate(cw/2,ch/2) · scale · translate(-camX,-camY))
// is applied once per frame before the world is drawn. Recording ENTITY
// coordinates means compensating for it: while the world transform is being
// established the tracked matrix stays at identity, so every point recorded
// afterwards is in the space's own coordinates (world px outdoors, room-local
// px inside a den) — exactly what the position assertions below compare with.
let cameraStage = 0;

const canvas = {
  getContext: () => recCtx,
  getBoundingClientRect: () => ({ width: 1280, height: 720, left: 0, top: 0, right: 1280, bottom: 720 }),
  width: 1280,
  height: 720,
  style: {},
};
const num = (v: unknown) => (typeof v === "number" ? v : NaN);
const recCtx = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === "canvas") return canvas;
      if (prop === "measureText") return () => ({ width: 12 });
      if (prop === "createRadialGradient" || prop === "createLinearGradient" || prop === "createPattern") return () => gradient;
      return (...args: unknown[]) => {
        switch (prop) {
          case "save": stack.push([...mat] as Mat); break;
          case "restore": { const m = stack.pop(); if (m) mat = m; cameraStage = 0; break; }
          case "setTransform": mat = [...IDENT] as Mat; cameraStage = 1; break;
          case "translate":
            cameraStage = cameraStage === 1 ? 2 : cameraStage === 2 ? 3 : cameraStage;
            if (cameraStage === 3) { mat = [...IDENT] as Mat; cameraStage = 4; }
            else mat = mul(mat, [1, 0, 0, 1, num(args[0]), num(args[1])]);
            break;
          case "scale": cameraStage = cameraStage === 2 ? 2 : 0; break;
          case "rotate": { const r = num(args[0]); mat = mul(mat, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]); break; }
          case "transform": mat = mul(mat, [num(args[0]), num(args[1]), num(args[2]), num(args[3]), num(args[4]), num(args[5])]); break;
          default: break;
        }
        if (!recording) return undefined;
        // every drawing call takes its anchor as the first coordinates
        let x = NaN;
        let y = NaN;
        if (prop === "fillText") { x = num(args[1]); y = num(args[2]); }
        else if (prop === "moveTo" || prop === "lineTo" || prop === "arc" || prop === "ellipse" || prop === "fillRect" || prop === "strokeRect" || prop === "roundRect" || prop === "rect") {
          x = num(args[0]); y = num(args[1]);
        } else if (prop === "quadraticCurveTo" || prop === "bezierCurveTo" || prop === "arcTo") {
          x = num(args[args.length - 2]); y = num(args[args.length - 1]);
        }
        if (!Number.isNaN(x) && !Number.isNaN(y)) {
          const p = applyPt(mat, x, y);
          ops.push({ op: prop, x: p.x, y: p.y });
        }
        return undefined;
      };
    },
    set() { return true; },
  },
) as unknown as CanvasRenderingContext2D;

// ---- the standard headless engine harness ---------------------------------
(globalThis as Record<string, unknown>).window = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout,
  clearTimeout,
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
};
const rafCbs = new Set<(t: number) => void>();
(globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => {
  rafCbs.add(cb);
  return rafCbs.size;
};
(globalThis as Record<string, unknown>).cancelAnimationFrame = () => undefined;
let simTime = 0;
(globalThis as Record<string, unknown>).performance = { now: () => simTime };
function stepFrames(n: number) {
  for (let i = 0; i < n; i++) {
    simTime += 16.7;
    for (const cb of [...rafCbs]) cb(simTime);
  }
}

const { GameCanvas } = await import("../src/game/engine");
type RemotePlayer = import("../src/game/engine").RemotePlayer;

const noop = () => undefined;
const makeCb = () => ({ onAreaChange: noop, onNearby: noop, onInteract: noop, onMove: noop, onPreyCaught: noop, onClock: noop, onWeatherChange: noop, onInteriorChange: noop }) as never;

const b = new GameCanvas(canvas as unknown as HTMLCanvasElement, OUTDOOR_B, makeCb());
const B = b as unknown as {
  remotes: Map<string, RemotePlayer>;
  remoteRender: Map<string, { x: number; y: number; space?: string | null; buffer: unknown[] }>;
  px: number;
  py: number;
  pxFacing: 1 | -1;
  pSpeed: number;
  pPose: string;
};
stepFrames(2);

/** paint ops within `r` px of a point in the CURRENT space's coordinates */
function paintNear(x: number, y: number, r = 46): number {
  let n = 0;
  for (const o of ops) if (Math.hypot(o.x - x, o.y - y) <= r) n++;
  return n;
}
/**
 * Render `frames` frames and keep ONLY their paint log (the scene is recorded
 * through the same transform stack the engine uses, so every recorded point is
 * in the space's own coordinates: world px outdoors, room-local px inside).
 */
function measure(frames: number): { x: number; y: number }[] {
  ops = [];
  recording = true;
  stepFrames(frames);
  recording = false;
  return ops;
}
function remoteAt(uid: string, interior: string | null, x: number, y: number): RemotePlayer {
  return {
    userId: uid,
    catName: `Cat-${uid}`,
    clan: "thunderclan",
    rank: "apprentice",
    appearance: { fur: "#b5713f", furDark: "#8a5528", eye: "#4d9086", pattern: "tabby", furLength: 1, tail: "normal", ears: "normal", size: 1, scar: false },
    x,
    y,
    facing: 1,
    moving: false,
    interior,
    movementState: "idle",
    animationState: "sit",
    serverTick: ++seq,
  };
}

// Probe points, and the rule for every "is the cat drawn?" question:
//   painted  =  ops at the point rise well ABOVE that point's own background
//   missing  =  ops fall back to the background level
// (a room's props and the street's scenery paint plenty of their own ops, so an
// absolute count would prove nothing either way).
const OUT_SPOT = { x: 2200, y: 4520 };
const OUT_SPOT_2 = { x: 2210, y: 4560 };
const ROOM_SPOT = { ...ROOM_A };
const IMPOSTOR_SPOT = { x: ROOM_A.x + 70, y: ROOM_A.y + 30 };
const ROOM_SPOT_BACK = { x: ROOM_A.x + 40, y: ROOM_A.y - 40 };
const ROOM_SPOT_FRONT = { x: ROOM_A.x + 120, y: ROOM_A.y + 60 };
const MARGIN = 14; // a cat sprite at this scale paints far more than this

console.log("\n--- 2. two players in the SAME house see each other's cat ---");
// background level: no other players at all
B.remotes.clear();
measure(6);
const decorOutdoor = paintNear(OUT_SPOT.x, OUT_SPOT.y);

// B stands outdoors next to A: A's cat is painted out in the world
B.remotes.set("A", remoteAt("A", null, OUT_SPOT.x, OUT_SPOT.y));
measure(6);
const outdoorsPaint = paintNear(OUT_SPOT.x, OUT_SPOT.y);
check(
  "outdoors: another player's cat is painted at their world position",
  outdoorsPaint > decorOutdoor + MARGIN,
  `ops near A = ${outdoorsPaint} (street background ${decorOutdoor})`,
);

// A walks into house-a. B is still outside: A must NOT be painted in the street
B.remotes.set("A", remoteAt("A", "house-a", ROOM_SPOT.x, ROOM_SPOT.y));
measure(6);
const staleOutdoor = paintNear(OUT_SPOT.x, OUT_SPOT.y);
check(
  "A enters the house while B stays outside: A's cat is gone from the street",
  staleOutdoor <= decorOutdoor + 4,
  `ops=${staleOutdoor}, background=${decorOutdoor}, with A outside=${outdoorsPaint}`,
);

// B enters the same house: now they share a space
b.enterInterior("house-a");
check("the local player really is inside the room", b.space === "house-a", `space=${String(b.space)}`);
check("the local cat is in room coordinates, not world px", B.px < 1200 && B.py < 900, `player=(${B.px.toFixed(0)},${B.py.toFixed(0)})`);
// the room's own background level at each probe point (still nobody else here)
B.remotes.clear();
measure(8);
const decorRoom = paintNear(ROOM_SPOT.x, ROOM_SPOT.y);
const decorImpostor = paintNear(IMPOSTOR_SPOT.x, IMPOSTOR_SPOT.y);
const decorBack = paintNear(ROOM_SPOT_BACK.x, ROOM_SPOT_BACK.y);
const decorFront = paintNear(ROOM_SPOT_FRONT.x, ROOM_SPOT_FRONT.y);

// A is in the SAME room now -> the cat must appear at A's room-local position
B.remotes.set("A", remoteAt("A", "house-a", ROOM_SPOT.x, ROOM_SPOT.y));
measure(10);
const inRoom = paintNear(ROOM_SPOT.x, ROOM_SPOT.y);
check(
  "inside the same room: the other player's cat IS painted at their room-local position",
  inRoom > decorRoom + MARGIN,
  `ops near A in the room = ${inRoom} (room background ${decorRoom})`,
);
check("the remote render state follows the room's coordinate system", Math.abs((B.remoteRender.get("A")?.x ?? 1e9) - ROOM_SPOT.x) < 60, `render x=${B.remoteRender.get("A")?.x}`);
{
  const log = measure(2);
  const catOps = log.filter((o) => Math.hypot(o.x - ROOM_SPOT.x, o.y - (ROOM_SPOT.y - 20)) <= 46);
  check(
    "the indoor remote cat is drawn by the shared cat renderer (body + name plate)",
    catOps.length > MARGIN,
    `ops at the cat = ${catOps.length}`,
  );
}

console.log("\n--- 3. the coordinate-system change is not interpolated across ---");
// A switches to another house: a space change must REBUILD the timeline, not
// ease the cat across the jump (which would drag it through the room's walls).
B.remotes.set("A", remoteAt("A", "house-b", 4000, 4000));
measure(1);
const rr = B.remoteRender.get("A");
check(
  "a remote that changed space is placed at the authoritative snapshot immediately",
  rr?.space === "house-b" && Math.abs((rr?.x ?? 0) - 4000) < 1 && Math.abs((rr?.y ?? 0) - 4000) < 1,
  `space=${String(rr?.space)} pos=(${rr?.x},${rr?.y})`,
);
check("...and its interpolation timeline was rebuilt, not reused", rr?.buffer.length === 1, `buffer=${rr?.buffer.length}`);
check("exactly ONE render object exists per remote (no duplicate cats when switching rooms)", B.remoteRender.size === B.remotes.size, `${B.remoteRender.size} vs ${B.remotes.size}`);

// The nasty case: a space change whose two coordinate systems happen to be
// numerically CLOSE (leaving a den puts the cat a few px from where they stood
// inside). Without the space rule the cat would be smoothly eased from one
// place to the other instead of being placed exactly — a slow slide through
// scenery. One frame must be enough to be EXACTLY at the new spot.
B.remotes.set("A", remoteAt("A", null, 2200, 4520));
measure(8);
B.remotes.set("A", remoteAt("A", "house-a", 2210, 4530));
measure(1);
const near = B.remoteRender.get("A");
check(
  "a numerically-close space change is exact after a single frame (no easing across spaces)",
  Math.abs((near?.x ?? 0) - 2210) < 1e-6 && Math.abs((near?.y ?? 0) - 4530) < 1e-6,
  `pos=(${near?.x},${near?.y}) expected (2210,4530)`,
);
check("...and no interpolation history was carried across it", near?.buffer.length === 1, `buffer=${near?.buffer.length}`);

console.log("\n--- 4. different houses never see each other ---");
// A (house-b) is handed coordinates that sit right where B's room is: a
// coordinate-only renderer would happily paint them into this room.
B.remotes.set("A", remoteAt("A", "house-b", IMPOSTOR_SPOT.x, IMPOSTOR_SPOT.y));
measure(8);
const otherHouse = paintNear(IMPOSTOR_SPOT.x, IMPOSTOR_SPOT.y);
check(
  "a player in a DIFFERENT house is not rendered in this room (even at the same local coordinates)",
  otherHouse <= decorImpostor + 4,
  `ops=${otherHouse}, room background=${decorImpostor}`,
);
check("and the room still renders normally for everyone else (the local cat is painted)", paintNear(B.px, B.py, 40) > MARGIN, `local cat ops = ${paintNear(B.px, B.py, 40)}`);

console.log("\n--- 5. depth order inside the room ---");
{
  B.remotes.set("A", remoteAt("A", "house-a", ROOM_SPOT_BACK.x, ROOM_SPOT_BACK.y)); // smaller y = further back
  B.remotes.set("C", remoteAt("C", "house-a", ROOM_SPOT_FRONT.x, ROOM_SPOT_FRONT.y)); // lower on screen
  measure(10);
  const log = measure(2);
  const firstA = log.findIndex((o) => Math.hypot(o.x - ROOM_SPOT_BACK.x, o.y - ROOM_SPOT_BACK.y) <= 46);
  const firstC = log.findIndex((o) => Math.hypot(o.x - ROOM_SPOT_FRONT.x, o.y - ROOM_SPOT_FRONT.y) <= 46);
  check("both roommates are painted", firstA >= 0 && firstC >= 0, `A@${firstA} C@${firstC}`);
  check("the cat further back (smaller y) is drawn first — correct sprite layering", firstA >= 0 && firstC > firstA, `A@${firstA} C@${firstC}`);
  check("no duplicates: one render state per player", B.remoteRender.size === 2, `size=${B.remoteRender.size}`);
}

console.log("\n--- 6. leaving cleans up (no stale cats) ---");
{
  const withC = paintNear(ROOM_SPOT_FRONT.x, ROOM_SPOT_FRONT.y);
  check("the second roommate really was painted before leaving", withC > decorFront + MARGIN, `ops=${withC}, background=${decorFront}`);
  B.remotes.delete("C");
  measure(6);
  check("a player who left is removed from the room's render list", B.remoteRender.size === 1, `size=${B.remoteRender.size}`);
  const afterLeave = paintNear(ROOM_SPOT_FRONT.x, ROOM_SPOT_FRONT.y);
  check(
    "...and their sprite stops being painted (only room decor remains)",
    afterLeave <= decorFront + 4,
    `with C=${withC}, after leaving=${afterLeave}, background=${decorFront}`,
  );
  check("the remaining roommate is still painted", paintNear(ROOM_SPOT_BACK.x, ROOM_SPOT_BACK.y) > decorBack + MARGIN);
}

console.log("\n--- 7. walking back outside re-syncs the world space ---");
{
  b.exitInterior();
  B.px = OUT_SPOT_2.x;
  B.py = OUT_SPOT_2.y;
  check("the local player is outdoors again", b.space === null);
  // background at the return spot with nobody else around, then the roommate
  B.remotes.clear();
  measure(6);
  const decorOutdoor2 = paintNear(OUT_SPOT_2.x, OUT_SPOT_2.y);
  B.remotes.set("A", remoteAt("A", null, OUT_SPOT_2.x, OUT_SPOT_2.y));
  measure(8);
  const backOutside = paintNear(OUT_SPOT_2.x, OUT_SPOT_2.y);
  check(
    "the other player's cat is painted at their world position again",
    backOutside > decorOutdoor2 + MARGIN,
    `ops=${backOutside} (background ${decorOutdoor2})`,
  );
  check("indoor render state did not leak outdoors (one object per player)", B.remoteRender.size === 1);
}

console.log("\n--- 8. the client actually wires this up (source of truth) ---");
{
  const game = fs.readFileSync("src/pages/Game.tsx", "utf8");
  const engine = fs.readFileSync("src/game/engine.ts", "utf8");
  const schema = fs.readFileSync("src/convex/schema.ts", "utf8");
  const presenceSrc = fs.readFileSync("src/convex/presence.ts", "utf8");
  check("the presence table stores the interior id", schema.includes("interior: v.optional(v.union(v.string(), v.null()))"));
  check("listOnline projects the space to every client", presenceSrc.includes("interior: r.interior ?? null"));
  check(
    "the server clamps only within one space (an enter/exit is never a teleport)",
    presenceSrc.includes("const sameSpace = prevInterior === interior;") && presenceSrc.includes("if (existing && sameSpace) {"),
  );
  check("the engine exposes the local player's space", engine.includes("get space(): string | null {"));
  check("one shared rule decides which remotes belong to a space", engine.includes("private remoteInMySpace(r: RemotePlayer): boolean {"));
  check(
    "both the outdoor and indoor paths + prompts apply the space rule",
    engine.split("if (!this.remoteInMySpace(r)) continue;").length >= 4,
  );
  check("outdoors and interiors share ONE remote-cat renderer", engine.includes("private drawRemoteCat(r: RemotePlayer, rp: RemoteRenderState) {"));
  check("interiors render same-space remote cats", engine.includes("§MULTIPLAYER INTERIORS: other online players who are in THIS room render"));
  check("a space change rebuilds the interpolation timeline", engine.includes("cur.space !== space"));
  check(
    "every presence packet (5s heartbeat, 300ms sync, immediate push) carries the space",
    game.split("interior: space,").length >= 3,
  );
  check("entering/leaving a house pushes presence immediately, not up to 5s later", game.includes("pushPresence(id)"));
  check(
    "movement packets go out indoors too (the old interior early-return is gone)",
    game.includes("movement is synchronized INSIDE interiors too") && !game.includes("if (!g || interiorRef.current) return;"),
  );
  check("the client routes remotes by space", game.includes("if ((r.interior ?? null) !== mySpace) continue;"));
  check("a local space change re-routes the remote list", game.includes("}, [remotesRaw, interior]);"));
  check("the autosave never stores a room-local coordinate as a world position", game.includes("const saved = interiorRef.current ? outdoorRef.current : posRef.current;"));
}

console.log(failures === 0 ? "\nALL INTERIOR MULTIPLAYER CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
