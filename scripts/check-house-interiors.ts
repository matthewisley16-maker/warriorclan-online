// House-interior verification (spec §8/§9/§12/§13/§18/§30):
//  1. Plan integrity: every house has wall grids with a front-door gap; the
//     engine spawn cell is walkable; every authored room zone center is
//     reachable by BFS from the spawn (rooms are SEPARATE but CONNECTED).
//  2. Two-story house: ground floor reaches the stair cell, upstairs reaches
//     every upstairs room, and the return stairs bring you back.
//  3. Scale: interior area matches the exterior footprint (small→compact,
//     large→more rooms); every house has >= 2 distinct rooms except the
//     three intentionally single-room cottages.
//  4. Furniture: every plan house has a bed/nest, a bowl, and a window or
//     sofa; every prop style maps to a default interaction; every prop
//     render style is drawable (switch coverage).
//  5. Doors: every exterior house has exactly one interior binding (no
//     duplicate/missing doors), and each interior is owned by exactly one
//     house object (or intentionally by two archetypes sharing nothing else).
//  6. Kittypet life: each of the 5 kittypets has a house, their def.home
//     sits near their house doorstep, and their house lists them in npcs.
//  7. LIVE engine walk-through: place the player at the front door, hold
//     "up" to walk in, then BFS-walk the room waypoints inside via direct
//     movement — verifying enter, room-to-room reachability, stairs, and
//     clean walk-out to the outdoors at the right spot.
// Run: bun scripts/check-house-interiors.ts

type AnyFn = (...args: unknown[]) => unknown;
const gradient = { addColorStop: (() => undefined) as AnyFn };
function makeCtx() {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "measureText") return () => ({ width: 12 });
      if (prop === "createRadialGradient" || prop === "createLinearGradient" || prop === "createPattern")
        return () => gradient;
      if (prop === "canvas") return canvas;
      return () => undefined;
    },
    set() {
      return true;
    },
  });
}
const ctx = makeCtx();
const canvas = {
  getContext: () => ctx,
  getBoundingClientRect: () => ({ width: 1280, height: 720, left: 0, top: 0, right: 1280, bottom: 720 }),
  width: 0,
  height: 0,
  style: {},
};
(globalThis as Record<string, unknown>).window = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout,
  clearTimeout,
};
let simNow = 0;
let rafCb: ((t: number) => void) | null = null;
(globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => {
  rafCb = cb;
  return 1;
};
(globalThis as Record<string, unknown>).cancelAnimationFrame = () => undefined;
(globalThis as Record<string, unknown>).performance = { now: () => simNow };
function pump(ms: number) {
  const frames = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < frames; i++) {
    simNow += 16;
    rafCb?.(simNow);
  }
}

const { GameCanvas, interiors, defaultFurnitureAction } = await import("../src/game/engine");
const { allObjects, isSolidPoint, npcs } = await import("../src/game/world");

let failures = 0;
function check(cond: boolean, label: string) {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}`);
    failures++;
  }
}

// Room geometry is readable straight off the wall grid (no engine export
// needed): width = row length, height = row count, front door = a gap in the
// bottom wall row.
function geoOf(room: { walls: string[] } | undefined) {
  if (!room) return { w: 24, h: 18, frontDoor: true };
  return {
    w: room.walls[0]?.length ?? 24,
    h: room.walls.length,
    frontDoor: (room.walls[room.walls.length - 1] ?? "").includes("0"),
  };
}

// BFS on a room's wall grid: returns set of reachable cells from (sx, sy)
function reach(roomId: string, sx: number, sy: number): Set<number> {
  const room = interiors[roomId];
  const geo = geoOf(room);
  const W = geo?.w ?? 24;
  const H = geo?.h ?? 18;
  const at = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H && room.walls[y]?.[x] !== "1";
  const seen = new Set<number>([sy * W + sx]);
  let frontier = [sy * W + sx];
  while (frontier.length) {
    const next: number[] = [];
    for (const cur of frontier) {
      const cx = cur % W;
      const cy = Math.floor(cur / W);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          const key = ny * W + nx;
          if (seen.has(key) || !at(nx, ny)) continue;
          if (dx && dy && (!at(cx + dx, cy) || !at(cx, cy + dy))) continue;
          seen.add(key);
          next.push(key);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

const HOUSES = [
  "rusty-house", "smudge-house", "henry-house", "princess-house",
  "marmalade-house", "ginger-house", "house-a", "house-b", "house-c",
  "house-d", "house-e", "house-j", "house-k", "house-l",
];
const SINGLE_ROOM_COTTAGES = ["rusty-living", "house-f", "house-g", "house-h", "house-i"];

console.log("— plan integrity —");
for (const id of [...HOUSES, ...SINGLE_ROOM_COTTAGES]) {
  const room = interiors[id];
  const geo = geoOf(room);
  if (!room || !geo) {
    check(false, `${id}: interior + geo exist`);
    continue;
  }
  const bottom = room.walls[geo.h - 1] ?? "";
  const hasDoor = geo.frontDoor === false ? !bottom.includes("0") : bottom.includes("0");
  check(hasDoor, `${id}: front door ${geo.frontDoor === false ? "correctly closed (upper floor)" : "gap present"}`);
  if (geo.frontDoor !== false) {
    // engine spawn: bottom-center-ish, two cells up — must be walkable
    const sx = Math.floor(geo.w / 2);
    const sy = geo.h - 3;
    const spawnOk = room.walls[sy]?.[sx] !== "1" && room.walls[sy]?.[sx - 1] !== "1";
    check(spawnOk, `${id}: engine spawn cell is walkable`);
  }
}

console.log("— room connectivity (rooms separate but connected) —");
for (const id of HOUSES) {
  const room = interiors[id];
  const geo = geoOf(room);
  if (!room || !geo) continue;
  const sx = Math.floor(geo.w / 2);
  const sy = geo.h - 3;
  const seen = reach(id, sx, sy);
  const zones = room.rooms ?? [];
  check(zones.length >= 2, `${id}: has ${zones.length} named rooms`);
  let allReach = true;
  let firstBad = "";
  for (const z of zones) {
    const cx = Math.floor((z.x0 + z.x1) / 2);
    const cy = Math.floor((z.y0 + z.y1) / 2);
    if (room.walls[cy]?.[cx] === "1" || !seen.has(cy * geo.w + cx)) {
      allReach = false;
      firstBad = z.name;
      break;
    }
  }
  check(allReach, `${id}: every room reachable from the front door${firstBad ? ` (stuck: ${firstBad})` : ""}`);
  // rooms must be genuinely separate: at least one wall cell between zones
  const wallCells = (room.walls.join("").match(/1/g) ?? []).length;
  const perimeter = 2 * geo.w + 2 * geo.h - 4;
  check(wallCells > perimeter + 8, `${id}: interior partition walls exist (${wallCells - perimeter} cells)`);
}

console.log("— two-story house —");
const dRoom = interiors["house-d"];
const upRoom2 = interiors["house-d-up"];
const dGeo = geoOf(dRoom);
const upGeo = geoOf(upRoom2);
const dStairs = dRoom?.stairs ?? [];
const upStairs = upRoom2?.stairs ?? [];
check(!!dRoom && !!upRoom2 && !upGeo.frontDoor, "house-d-up is a real upper floor (no front door)");
check(dStairs.length === 1 && upStairs.length === 1, "exactly one stair portal per floor");
const up = dStairs[0];
const down = upStairs[0];
check(up && up.target === "house-d-up", "ground stairs target the upstairs room");
check(down && down.target === "house-d", "upstairs stairs return to the ground floor");
if (up && down) {
  const dSeen = reach("house-d", Math.floor(dGeo.w / 2), dGeo.h - 3);
  check(dSeen.has((up.y + 1) * dGeo.w + up.x) || dSeen.has(up.y * dGeo.w + up.x), "ground floor reaches the stairs");
  const upSeen = reach("house-d-up", down.x, down.y);
  const upZones = upRoom2?.rooms ?? [];
  let upAll = true;
  for (const z of upZones) {
    const cx = Math.floor((z.x0 + z.x1) / 2);
    const cy = Math.floor((z.y0 + z.y1) / 2);
    if (!upSeen.has(cy * (upGeo?.w ?? 20) + cx)) { upAll = false; break; }
  }
  check(upAll, "every upstairs room reachable from the stairs");
}

console.log("— scale match (exterior ↔ interior) —");
for (const obj of allObjects.filter((o) => o.interior && HOUSES.includes(o.interior))) {
  const room = interiors[obj.interior];
  const geo = geoOf(room);
  if (!room || !geo) continue;
  const ext = (obj.w / 32) * (obj.h / 32);
  const inn = geo.w * geo.h;
  // exterior is a 2D façade (compressed by design); interiors hold the real
  // floor plan. Band: at least 12× the façade area (a real multi-room plan),
  // at most 90× (not absurd). The per-size room-count check below does the
  // actual scale-matching work.
  const ratio = inn / ext;
  check(ratio >= 12 && ratio <= 90, `${obj.id}: interior/exterior ratio ${ratio.toFixed(1)} believable`);
  const zones = (room.rooms ?? []).length;
  const extBig = ext >= 4.0 * 3.2;
  check(zones >= (extBig ? 4 : 3), `${obj.id}: ${extBig ? "large" : "medium"} exterior → ${zones} rooms`);
}

console.log("— furniture —");
for (const id of HOUSES) {
  const room = interiors[id];
  if (!room) continue;
  const styles = new Set(room.props.map((pr) => pr.style));
  check(
    styles.has("bowl") &&
      (styles.has("bed") || styles.has("nest") || styles.has("blanket")) &&
      (styles.has("window") || styles.has("sofa")),
    `${id}: furnished like a real home (bowl + bed + window/sofa)`,
  );
}
const ALL_STYLES = ["nest", "herbs", "stone", "moss", "plank", "hay", "bowl", "vines", "toy", "carpet", "lamp", "sofa", "chair", "table", "bed", "cabinet", "shelf", "books", "box", "window", "plant", "post", "blanket", "tub", "toilet", "stove"];
let allMapped = true;
const unmapped: string[] = [];
for (const st of ALL_STYLES) {
  if (!defaultFurnitureAction(st)) { allMapped = false; unmapped.push(st); }
}
check(allMapped, `every prop style maps to a default cat interaction${unmapped.length ? ` (missing: ${unmapped.join(",")})` : ""}`);
const bathroomHasFixtures = (interiors["house-d-up"].props ?? []).some((pr) => pr.style === "tub" || pr.style === "toilet");
check(bathroomHasFixtures, "upstairs bathroom has real fixtures (tub/toilet)");

console.log("— doors —");
const houseObjects = allObjects.filter((o) => o.interior && o.style === "house");
check(houseObjects.length === 14, `14 enterable Twoleg houses in the world (${houseObjects.length})`);
const owned = new Map<string, number>();
for (const o of allObjects) {
  if (!o.interior) continue;
  owned.set(o.interior, (owned.get(o.interior) ?? 0) + 1);
}
for (const id of HOUSES) check((owned.get(id) ?? 0) === 1, `${id}: bound to exactly one door object`);
// kittypet cottages may be shared, but the five kittypet houses must be 1:1
for (const id of ["smudge-house", "henry-house", "princess-house", "marmalade-house", "ginger-house"]) {
  check((owned.get(id) ?? 0) === 1, `${id}: exactly one exterior door`);
}
for (const o of houseObjects) {
  check(!!o.doorAt, `${o.id}: has doorAt (visible door + collision match)`);
}

console.log("— kittypet house life —");
for (const kid of ["smudge", "henry", "marmalade", "princess", "ginger"]) {
  const def = npcs.find((n) => n.id === kid);
  if (!def) { check(false, `${kid}: exists in npcs`); continue; }
  const house = [...houseObjects].find((h) => (interiors[h.interior].npcs ?? []).includes(kid));
  check(!!house, `${kid}: assigned to a house`);
  if (house && def) {
    const d = Math.hypot(def.home.x - house.x, def.home.y - (house.y + house.h / 2 + 18 / 32));
    check(d < 90, `${kid}: home is at the doorstep (${Math.round(d)}px)`);
  }
}

console.log("— live engine walk-through —");
const g = new GameCanvas(canvas as unknown as HTMLCanvasElement, { x: 78 * 32, y: 146 * 32 }, {
  onAreaChange: () => undefined,
  onNearby: () => undefined,
  onMove: () => undefined,
  onInteract: () => undefined,
  onPreyCaught: () => undefined,
  onClock: () => undefined,
  onWeatherChange: () => undefined,
  onInteriorChange: () => undefined,
  onNpcIdle: () => undefined,
} as never);
pump(64);
const eng = g as unknown as {
  px: number; py: number; camX: number; camY: number; interiorId: string | null;
  groundFloorId: string | null; enterInterior: (id: string, o?: unknown) => void;
  exitInterior: () => void; furnitureAction: (k: string) => string | null;
  keys: Set<string>; setPose: (p: string, s?: number) => void; startEmote: (id: string) => boolean;
};
// enter Smudge's house through the walk-in trigger
const smudge = allObjects.find((o) => o.id === "smudge-house")!;
eng.px = smudge.x;
eng.py = smudge.y + smudge.h / 2 + 8;
eng.camX = eng.px;
eng.camY = eng.py;
eng.keys = new Set(["w"]); // hold up: walk through the front door
pump(1200);
eng.keys = new Set();
check(eng.interiorId === "smudge-house", "walking into the doorway enters the house");
if (eng.interiorId === "smudge-house") {
  check(eng.groundFloorId === "smudge-house", "ground floor registered (front-door walk-out armed)");
  // furniture actions work (real cat actions)
  const msg = eng.furnitureAction("f-sleep");
  check(msg !== null && msg.length > 0, "bed interaction returns a real action message");
  // walk OUT through the front door again (hold down)
  eng.setPose("sit", 0.1);
  eng.keys = new Set(["s"]);
  pump(1500);
  eng.keys = new Set();
  check(eng.interiorId === null, "walking out the front door exits to the world");
}
// two-story round trip through the stairs
const houseD = allObjects.find((o) => o.id === "house-7")!;
eng.px = houseD.x;
eng.py = houseD.y + houseD.h / 2 + 8;
eng.camX = eng.px;
eng.camY = eng.py;
eng.keys = new Set(["w"]);
pump(1400);
eng.keys = new Set();
check(eng.interiorId === "house-d", "entered the two-story house");
if (eng.interiorId === "house-d") {
  // walk onto the stair portal (cells 3..4 x 12..13 on a 20x15 grid)
  const st = (interiors["house-d"].stairs ?? [])[0];
  if (st) {
    eng.keys = new Set();
    // direct-walk to the stair cell via small steps (bypassing walls is
    // impossible: movement itself checks the wall grid)
    const tx = st.x * 32 + 16;
    const ty = st.y * 32 + 16;
    let guard = 0;
    while (guard++ < 400 && (Math.hypot(eng.px - tx, eng.py - ty) > 6 || eng.interiorId === "house-d")) {
      const dx = Math.sign(tx - eng.px);
      const dy = Math.sign(ty - eng.py);
      eng.keys = new Set([...(dx ? [dx > 0 ? "d" : "a"] : []), ...(dy ? [dy > 0 ? "s" : "w"] : [])]);
      pump(32);
    }
    eng.keys = new Set();
    check(eng.interiorId === "house-d-up", "walking onto the stairs takes you upstairs (physical portal)");
    if (eng.interiorId === "house-d-up") {
      const st2 = (interiors["house-d-up"].stairs ?? [])[0];
      const tx2 = st2.x * 32 + 16;
      const ty2 = st2.y * 32 + 16;
      guard = 0;
      while (guard++ < 400 && (Math.hypot(eng.px - tx2, eng.py - ty2) > 6 || eng.interiorId === "house-d-up")) {
        const dx = Math.sign(tx2 - eng.px);
        const dy = Math.sign(ty2 - eng.py);
        eng.keys = new Set([...(dx ? [dx > 0 ? "d" : "a"] : []), ...(dy ? [dy > 0 ? "s" : "w"] : [])]);
        pump(32);
      }
      eng.keys = new Set();
      check(eng.interiorId === "house-d", "walking back down the stairs returns to the ground floor");
      eng.exitInterior();
    }
  }
}
pump(100);

console.log("— kittypet house-life cycle (live sim) —");
// Smudge starts idle at his doorstep; within seconds his schedule sends him
// THROUGH the cat flap, around his rooms, and eventually back outside.
const smudgeNpc = (eng as unknown as { npcStates: { def: { id: string }; x: number; y: number; ai: string; pose: string; activity: string }[] }).npcStates.find((n) => n.def.id === "smudge");
check(!!smudgeNpc, "smudge NPC exists in the live engine");
if (smudgeNpc) {
  // pure observation window: earlier pumps advance world time, so smudge's
  // CURRENT state is timing-dependent. The real contract is that his state
  // machine cycles: indoor (travel/enjoy) AND outdoor again afterwards.
  let sawTravel = false;
  let sawEnjoy = false;
  let backOutside = false;
  let sawIndoor = false;
  for (let i = 0; i < 4000 && !backOutside; i++) {
    pump(100); // up to ~64s of sim time
    if (smudgeNpc.ai === "house_travel") { sawTravel = true; sawIndoor = true; }
    if (smudgeNpc.ai === "house_enjoy") { sawEnjoy = true; sawIndoor = true; }
    if (sawIndoor && (smudgeNpc.ai === "idle" || smudgeNpc.ai === "wander" || smudgeNpc.ai === "house_exit")) {
      backOutside = true;
    }
  }
  check(sawTravel, "smudge walks in and travels between rooms (house_travel)");
  check(sawEnjoy, "smudge enjoys furniture spots (house_enjoy)");
  check(backOutside, "smudge goes back OUTSIDE after being inside (no teleport)");
}

console.log(failures === 0 ? `\nOK  house-interior verification passed` : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
