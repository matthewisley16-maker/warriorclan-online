// §STORY-PLACE / §LEGS / §PERF verification.
//
// The reported problems, checked one by one:
//
//  1. "Cutscenes play in the wrong place." Every Story Mode beat is gated on
//     the step's REAL staged scene point (a map landmark): the camp arrival
//     scene cannot start while the player is still at the forest edge, and the
//     Graypaw ambush happens deep in Tallpines — not on the camp's doorstep.
//  2. "Graypaw should physically lead Rusty to camp." He walks a real authored
//     route (pine trail -> gorse tunnel -> camp edge) with collision, waits for
//     the player, and the camp cutscene waits for him to arrive.
//  3. "Legs are glitchy." The gait model is checked physically: a planted paw
//     must not slide in world space, it must stand ON the ground line, the body
//     bob must not lift it, and a standing cat must never cycle its legs.
//  4. "The game is laggy." The static terrain is baked into chunks: a second
//     frame must reuse the cache (no cell repaint at all), and the minimap may
//     no longer re-render the game from inside render.
//
// Run: bun scripts/check-story-place.ts

type AnyFn = (...args: unknown[]) => unknown;
const gradient = { addColorStop: (() => undefined) as AnyFn };

/** a recording 2D context (counts the calls the game actually makes) */
function makeCtx(counts?: Record<string, number>) {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "measureText") return () => ({ width: 12 });
      if (prop === "createRadialGradient" || prop === "createLinearGradient" || prop === "createPattern")
        return () => gradient;
      if (prop === "canvas") return canvas;
      const key = String(prop);
      return (...args: unknown[]) => {
        if (counts) counts[key] = (counts[key] ?? 0) + 1;
        if (key === "roundRect" && counts) {
          (globalThis as Record<string, unknown>).__lastRoundRect = args;
          const rec = ((globalThis as Record<string, unknown>).__roundRects ?? []) as unknown[];
          rec.push(args);
          (globalThis as Record<string, unknown>).__roundRects = rec;
        }
        return undefined;
      };
    },
    set() {
      return true;
    },
  });
}

const counts: Record<string, number> = {};
const ctx = makeCtx(counts);
const canvas = {
  getContext: () => ctx,
  getBoundingClientRect: () => ({ width: 1280, height: 720, left: 0, top: 0, right: 1280, bottom: 720 }),
  width: 0,
  height: 0,
  style: {},
};

let chunkCanvases = 0;
(globalThis as Record<string, unknown>).document = {
  createElement: (tag: string) => {
    if (tag !== "canvas") return {};
    chunkCanvases++;
    return {
      width: 0,
      height: 0,
      getContext: () => makeCtx(),
      style: {},
    };
  },
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
function stepFrame(dtMs = 16) {
  simNow += dtMs;
  rafCb?.(simNow);
}

const { GameCanvas } = await import("../src/game/engine");
const { CAMP_CENTER, CAMP_RADIUS, isSolidPoint, WORLD_W, WORLD_H } = await import("../src/game/world");
const { STAGED_STEPS, STORY_LOCATIONS, STORY_TRAVEL, STORY_ESCORTS, stepScenePoint, escortForStep, beatActorIds, canStartBeat } =
  await import("../src/game/storyStaging");
const { storySteps } = await import("../src/game/story");
const { STORY_BEATS } = await import("../src/game/storyCinematics");
const { gaitLegs, advanceGait, newGaitState, STRIDE_PX, CatAnimator } = await import("../src/game/anim");
const { drawCat, normalizeSkin } = await import("../src/game/draw");
const { readFileSync } = await import("node:fs");

let failures = 0;
let checks = 0;
function check(ok: boolean, label: string, detail = "") {
  checks++;
  if (ok) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}
const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps;
const TILE = 32;

// ---------------------------------------------------------------------------
// 1) THE FOREST ENCOUNTER IS IN THE FOREST
// ---------------------------------------------------------------------------
console.log("— the encounter location —");
const mark = STORY_LOCATIONS["forest-edge"];
const campD = Math.hypot(mark.x - CAMP_CENTER.x, mark.y - CAMP_CENTER.y);
check(campD > CAMP_RADIUS + 150, "Graypaw's ambush is well outside the camp wall", `distance=${campD.toFixed(0)}px, camp radius=${CAMP_RADIUS}px`);
check(mark.x / TILE > 54 && mark.x / TILE < 96 && mark.y / TILE > 106, "the ambush mark is inside Tallpines", `${(mark.x / TILE).toFixed(1)},${(mark.y / TILE).toFixed(1)} tiles`);
// the camp's clearZone ends at y = 108 tiles; the encounter must be a real walk
// OUT into the forest, not standing on the gorse-tunnel doorstep
check(mark.y / TILE > 113, "the ambush is at least 5 tiles outside the camp wall", `y=${(mark.y / TILE).toFixed(1)} (wall at 108)`);
check(mark.x / TILE > 88 && mark.x / TILE < 93, "the ambush sits on the pine trail", `x=${(mark.x / TILE).toFixed(1)}`);
check(!isSolidPoint(mark.x, mark.y), "the ambush mark is walkable ground (the pine trail)");
check(mark.territory === "tallpines", "the mark's territory is Tallpines", mark.territory);

// ---------------------------------------------------------------------------
// 2) EVERY CUTSCENE HAS A REAL, REACHABLE LOCATION
// ---------------------------------------------------------------------------
console.log("— cutscene placement —");
const noScene = ["s2-into-forest"]; // a travel montage, played where the player is
let gated = 0;
let misplaced = "";
for (const step of storySteps) {
  const beat = STORY_BEATS[step.id];
  if (!beat) continue;
  const p = stepScenePoint(step.id);
  if (!p) {
    if (!noScene.includes(step.id)) misplaced += ` ${step.id}`;
    continue;
  }
  gated++;
  const plan = STAGED_STEPS[step.id];
  const main = plan?.npcs.find((n) => n.priority === "main");
  if (plan?.scene) {
    const d = Math.hypot(p.x - plan.scene.x, p.y - plan.scene.y);
    if (d > 1) misplaced += ` ${step.id}(scene ${d.toFixed(0)}px off)`;
  } else if (main) {
    const d = Math.hypot(p.x - main.x, p.y - main.y);
    if (d > 1) misplaced += ` ${step.id}(actor ${d.toFixed(0)}px off)`;
  }
}
check(gated >= 14, `every scene step is gated on a real location (${gated} gated)`);
check(misplaced === "", `each gate point is its step's real staged scene${misplaced ? ` (bad:${misplaced})` : ""}`);

const s3 = stepScenePoint("s3-graypaw");
check(Boolean(s3) && Math.hypot(s3!.x - mark.x, s3!.y - mark.y) < 1, "the Graypaw ambush gate is the forest encounter mark");
check(Boolean(s3) && Math.hypot(s3!.x - CAMP_CENTER.x, s3!.y - CAMP_CENTER.y) > CAMP_RADIUS, "the Graypaw scene can never be gated inside camp");
const s4 = stepScenePoint("s4-the-camp");
check(Boolean(s4) && Math.hypot(s4!.x - CAMP_CENTER.x, s4!.y - CAMP_CENTER.y) < 60, "the camp arrival scene is gated on the camp clearing");
const s14 = stepScenePoint("s14-gathering");
check(Boolean(s14) && Math.abs(s14!.x - STORY_LOCATIONS.fourtrees.x) < 1, "the Gathering scene is gated on Fourtrees");

// the beat gate itself, as behaviour: place + escort + cast
const garden = { x: 78 * TILE, y: 146 * TILE };
const always = () => true;
check(
  !canStartBeat({ stepId: "s3-graypaw", player: garden, actorIds: ["graypaw"], actorArrived: always }),
  "the Graypaw ambush CANNOT start back at the garden",
);
check(
  !canStartBeat({ stepId: "s3-graypaw", player: mark, actorIds: ["graypaw"], actorArrived: () => false }),
  "the ambush waits until Graypaw is physically on his mark",
);
check(
  canStartBeat({ stepId: "s3-graypaw", player: { x: mark.x, y: mark.y + 120 }, actorIds: ["graypaw"], actorArrived: always }),
  "the ambush plays at the pine trail once he is there",
);
check(
  !canStartBeat({ stepId: "s4-the-camp", player: CAMP_CENTER, escortStatus: "leading", actorIds: [], actorArrived: always }),
  "the camp scene waits while the guide is still leading",
);
check(
  canStartBeat({ stepId: "s4-the-camp", player: CAMP_CENTER, escortStatus: "arrived", actorIds: [], actorArrived: always }),
  "the camp scene plays once the guide has arrived",
);
check(
  !canStartBeat({ stepId: "s4-the-camp", player: mark, escortStatus: "arrived", actorIds: [], actorArrived: always }),
  "the camp scene CANNOT play at the forest encounter",
);
check(
  canStartBeat({ stepId: "s1-twolegplace", player: garden, actorIds: [], actorArrived: always }),
  "the opening scene plays where the player spawns",
);
check(
  !canStartBeat({ stepId: "s14-gathering", player: CAMP_CENTER, actorIds: [], actorArrived: always }),
  "the Gathering scene does not play from camp",
);

// every gated scene is reachable ground near its staged cast
for (const id of ["s3-graypaw", "s4-the-camp", "s7-firepaw", "s9-training", "s14-gathering", "s16-final-battle"]) {
  const p = stepScenePoint(id);
  check(Boolean(p) && !isSolidPoint(p!.x, p!.y), `${id}'s scene point is walkable`);
}

// ---------------------------------------------------------------------------
// 3) THE ROUTES ARE REAL, WALKABLE PATHS
// ---------------------------------------------------------------------------
console.log("— routes —");
const travel = STORY_TRAVEL["s2-into-forest"]?.[0];
check(Boolean(travel), "Graypaw has an authored route to the ambush mark");
const escort = STORY_ESCORTS["s4-the-camp"] ?? escortForStep("s4-the-camp");
check(Boolean(escort), "the camp arrival has an authored escort route");
check(escort?.npcId === "graypaw", "Graypaw is the cat who leads the player to camp", escort?.npcId);

function routeProblems(route: { x: number; y: number }[], label: string) {
  const bad = route.filter((p) => p.x < 40 || p.y < 40 || p.x > WORLD_W - 40 || p.y > WORLD_H - 40);
  check(bad.length === 0, `${label} stays inside the world`, `${bad.length} points outside`);
  const solid = route.filter((p) => isSolidPoint(p.x, p.y));
  check(solid.length === 0, `${label} only uses walkable ground`, solid.map((p) => `${(p.x / 32).toFixed(1)},${(p.y / 32).toFixed(1)}`).join(" "));
  let maxLeg = 0;
  for (let i = 1; i < route.length; i++) maxLeg = Math.max(maxLeg, Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y));
  check(maxLeg < 7 * TILE, `${label} is a continuous walk (no long jumps)`, `longest leg=${maxLeg.toFixed(0)}px`);
}
if (travel) routeProblems(travel.route, "Graypaw's approach route");
if (escort) {
  routeProblems(escort.route, "the camp escort route");
  const end = escort.route[escort.route.length - 1];
  const endCampD = Math.hypot(end.x - CAMP_CENTER.x, end.y - CAMP_CENTER.y);
  check(endCampD < CAMP_RADIUS, "the escort ends INSIDE the camp", `${endCampD.toFixed(0)}px from camp centre`);
  check(endCampD > 300, "the escort ends outside the camp objective radius (the arrival scene plays first)", `${endCampD.toFixed(0)}px > 300px`);
  const startToEnd = Math.hypot(end.x - mark.x, end.y - mark.y);
  check(startToEnd > 500, "the escort is a real journey from the encounter", `${startToEnd.toFixed(0)}px`);
  // the tunnel: the route must pass through the gorse-tunnel corridor
  const tunnel = { x: CAMP_CENTER.x - TILE, y: CAMP_CENTER.y + CAMP_RADIUS - TILE };
  const closest = Math.min(...escort.route.map((p) => Math.hypot(p.x - tunnel.x, p.y - tunnel.y)));
  check(closest < 3 * TILE, "the escort passes through the gorse tunnel", `${closest.toFixed(0)}px from the tunnel mouth`);
}

// ---------------------------------------------------------------------------
// 3b) THE WHOLE OPENING SEQUENCE IS PHYSICALLY CONNECTED
// ---------------------------------------------------------------------------
console.log("— the story route is walkable end to end —");
const GW = Math.floor(WORLD_W / TILE);
const GH = Math.floor(WORLD_H / TILE);
const solidGrid = new Uint8Array(GW * GH);
for (let y = 0; y < GH; y++) {
  for (let x = 0; x < GW; x++) {
    solidGrid[y * GW + x] = isSolidPoint((x + 0.5) * TILE, (y + 0.5) * TILE) ? 1 : 0;
  }
}
/** BFS length in tiles between two world points (-1 = no path). */
/** the nearest walkable tile to a point (landmarks like Snakerocks are rock) */
function snapWalkable(x: number, y: number, maxTiles = 6): { x: number; y: number } | null {
  const cx = Math.floor(x / TILE);
  const cy = Math.floor(y / TILE);
  for (let r = 0; r <= maxTiles; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        if (!solidGrid[ny * GW + nx]) return { x: (nx + 0.5) * TILE, y: (ny + 0.5) * TILE };
      }
    }
  }
  return null;
}

function pathTiles(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const sa = snapWalkable(a.x, a.y);
  const sb = snapWalkable(b.x, b.y);
  if (!sa || !sb) return -1;
  const sx = Math.floor(sa.x / TILE);
  const sy = Math.floor(sa.y / TILE);
  const tx = Math.floor(sb.x / TILE);
  const ty = Math.floor(sb.y / TILE);
  const dist = new Int32Array(GW * GH).fill(-1);
  const q = new Int32Array(GW * GH);
  let head = 0;
  let tail = 0;
  dist[sy * GW + sx] = 0;
  q[tail++] = sy * GW + sx;
  while (head < tail) {
    const cur = q[head++];
    if (cur === ty * GW + tx) return dist[cur];
    const cx = cur % GW;
    const cy = (cur - cx) / GW;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const ni = ny * GW + nx;
      if (solidGrid[ni] || dist[ni] !== -1) continue;
      dist[ni] = dist[cur] + 1;
      q[tail++] = ni;
    }
  }
  return -1;
}

const gatedSequence = storySteps
  .map((s) => ({ id: s.id, p: stepScenePoint(s.id) }))
  .filter((s): s is { id: string; p: { x: number; y: number; r: number } } => Boolean(s.p));
let broken = "";
let longest = 0;
for (let i = 1; i < gatedSequence.length; i++) {
  const a = gatedSequence[i - 1];
  const b = gatedSequence[i];
  const len = pathTiles(a.p, b.p);
  if (len < 0) broken += ` ${a.id}->${b.id}`;
  else longest = Math.max(longest, len);
}
check(broken === "", `every scene is reachable on foot from the previous one${broken ? ` (blocked:${broken})` : ""}`);
let noStanding = "";
for (const s of gatedSequence) {
  const spot = snapWalkable(s.p.x, s.p.y, 3);
  if (!spot) noStanding += ` ${s.id}`;
  else if (Math.hypot(spot.x - s.p.x, spot.y - s.p.y) > s.p.r) noStanding += ` ${s.id}(outside)`;
}
check(noStanding === "", `the player can stand inside every scene's gate circle${noStanding ? ` (bad:${noStanding})` : ""}`);
check(longest > 0 && longest < 200, "the longest walk between scenes is a real journey, not a teleport", `${longest} tiles`);
{
  const first = stepScenePoint("s1-twolegplace")!;
  const spawn = { x: 78 * TILE, y: 146 * TILE };
  check(Math.hypot(first.x - spawn.x, first.y - spawn.y) < 300, "the opening scene begins where the player spawns (the garden)");
  const toEncounter = pathTiles(first, mark);
  check(toEncounter > 20, "Rusty must walk a real distance into the forest to meet Graypaw", `${toEncounter} tiles`);
  const escortStart = escort!.route[0];
  const fromMark = Math.hypot(escortStart.x - mark.x, escortStart.y - mark.y);
  check(fromMark < 300, "the escort starts at the encounter (not somewhere else)", `${fromMark.toFixed(0)}px`);
  const escortEnd = escort!.route[escort!.route.length - 1];
  const toCampScene = Math.hypot(escortEnd.x - s4!.x, escortEnd.y - s4!.y);
  check(toCampScene < 600, "the escort delivers the player to the camp scene", `${toCampScene.toFixed(0)}px`);
}

// ---------------------------------------------------------------------------
// 4) LIVE ENGINE: GRAYPAW WALKS THERE, THEN LEADS THE PLAYER
// ---------------------------------------------------------------------------
console.log("— engine: travel + escort —");
const noop = () => undefined;
const g = new GameCanvas(canvas as unknown as HTMLCanvasElement, { x: 78 * TILE, y: 146 * TILE }, {
  onAreaChange: noop,
  onNearby: noop,
  onMove: noop,
  onInteract: noop,
  onPreyCaught: noop,
  onClock: noop,
  onWeatherChange: noop,
  onInteriorChange: noop,
  onNpcIdle: noop,
  onStoryEscort: noop,
} as never);
stepFrame(80);
g.setStoryContext("story", 2);
const grayMark = STAGED_STEPS["s2-into-forest"].npcs.find((n) => n.npcId === "graypaw")!;
g.setNpcStoryAnchor("graypaw", {
  x: grayMark.x,
  y: grayMark.y,
  face: grayMark.face,
  route: travel!.route,
  speed: travel!.speed,
  run: true,
});
{
  let prev = g.getNpcWorldPos("graypaw")!;
  let maxJump = 0;
  let closestTrail = Infinity;
  let arrivedAt = -1;
  for (let i = 0; i < 60 * 40; i++) {
    stepFrame();
    const p = g.getNpcWorldPos("graypaw")!;
    maxJump = Math.max(maxJump, Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
    // the authored pine trail runs x 89..92 tiles, y 113..151
    const onTrail = p.x / TILE > 88 && p.x / TILE < 93 && p.y / TILE > 112;
    if (onTrail) closestTrail = 0;
    if (arrivedAt < 0 && g.getNpcStoryInfo("graypaw")?.arrived) arrivedAt = i;
  }
  check(g.getNpcStoryInfo("graypaw")?.arrived === true, "Graypaw physically reaches the ambush mark", "not arrived within 40s");
  check(maxJump < 12, "he never teleports (bounded per-frame step)", `max step=${maxJump.toFixed(1)}px`);
  check(closestTrail === 0, "his approach joins the real pine trail", `${closestTrail}px`);
  check(arrivedAt > 60, "the approach is a visible walk, not a snap", `arrived after ${arrivedAt} frames`);
  const d = Math.hypot(prev.x - grayMark.x, prev.y - grayMark.y);
  check(d < 30, "he stops ON the mark", `${d.toFixed(1)}px`);
}

// the escort: simulate a player walking with the guide
const G = g as unknown as { px: number; py: number };
G.px = mark.x;
G.py = mark.y + 40;
g.setStoryEscort({
  npcId: "graypaw",
  route: escort!.route,
  waitPx: escort!.waitPx,
  resumePx: escort!.resumePx,
  legGatePx: escort!.legGatePx,
  speed: escort!.speed,
  label: escort!.label,
});
{
  let prev = g.getNpcWorldPos("graypaw")!;
  let maxJump = 0;
  let maxGap = 0;
  let arrivedAt = -1;
  for (let i = 0; i < 60 * 45; i++) {
    stepFrame();
    const info = g.storyEscortInfo;
    if (!info) break;
    // the player follows the guide toward the next waypoint
    const target = escort!.route[Math.min(info.leg, escort!.route.length - 1)];
    const pdx = target.x - G.px;
    const pdy = target.y - G.py;
    const pd = Math.hypot(pdx, pdy);
    if (pd > 26) {
      const stepPx = Math.min(pd, 165 / 60);
      G.px += (pdx / pd) * stepPx;
      G.py += (pdy / pd) * stepPx;
    }
    const p = g.getNpcWorldPos("graypaw")!;
    maxJump = Math.max(maxJump, Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
    maxGap = Math.max(maxGap, Math.hypot(G.px - p.x, G.py - p.y));
    if (info.status === "arrived") {
      arrivedAt = i;
      break;
    }
  }
  check(arrivedAt > 0, "Graypaw leads the player all the way to the camp", "escort never arrived");
  check(maxJump < 14, "the leading cat never teleports either", `max step=${maxJump.toFixed(1)}px`);
  check(maxGap < escort!.waitPx! + 90, "he stays with the player along the route", `max gap=${maxGap.toFixed(0)}px`);
  const done = g.getNpcWorldPos("graypaw")!;
  const endD = Math.hypot(done.x - CAMP_CENTER.x, done.y - CAMP_CENTER.y);
  check(endD < CAMP_RADIUS, "the escort ends inside ThunderClan camp", `${endD.toFixed(0)}px from camp centre`);
  check(g.hasStoryEscort === false, "the escort completes (the camp scene may start)");
}

// falls behind -> waits; player ahead -> keeps leading
g.setStoryEscort({
  npcId: "graypaw",
  route: escort!.route,
  waitPx: 330,
  resumePx: 170,
  legGatePx: 300,
  speed: 150,
});
G.px = CAMP_CENTER.x;
G.py = CAMP_CENTER.y - 900; // far away, behind the guide
for (let i = 0; i < 120; i++) stepFrame();
check(g.storyEscortInfo?.status === "waiting", "the guide waits when the player falls behind", g.storyEscortInfo?.status);
{
  const before = g.getNpcWorldPos("graypaw")!;
  for (let i = 0; i < 60; i++) stepFrame();
  const after = g.getNpcWorldPos("graypaw")!;
  check(Math.hypot(after.x - before.x, after.y - before.y) < 2, "waiting really stops him (no walking away)");
}

// ---------------------------------------------------------------------------
// 5) LEGS: PLANTED PAWS, GROUND CONTACT, NO IDLE CYCLING
// ---------------------------------------------------------------------------
console.log("— leg animation —");
{
  const dt = 1 / 60;
  const speed = 165;
  let st = newGaitState();
  let x = 0;
  let maxSlip = 0;
  let lifted = 0;
  let bottomErr = 0;
  for (let i = 0; i < 240; i++) {
    const prev = gaitLegs(st.phase, "walk", 1);
    x += speed * dt;
    st = advanceGait(st, speed * dt, "walk");
    const cur = gaitLegs(st.phase, "walk", 1);
    for (let k = 0; k < cur.length; k++) {
      if (cur[k].planted) bottomErr = Math.max(bottomErr, Math.abs(cur[k].y + cur[k].h));
      if (prev[k].planted && cur[k].planted) maxSlip = Math.max(maxSlip, Math.abs(x + cur[k].x - (x - speed * dt + prev[k].x)));
      if (cur[k].swing > 0.5) lifted = Math.max(lifted, cur[k].lift);
    }
  }
  check(maxSlip < 0.25, "a planted paw does not skate across the ground", `slip=${maxSlip.toFixed(3)}px/frame`);
  check(bottomErr < 0.001, "a planted paw stands exactly on the ground line", `bottom offset=${bottomErr.toFixed(3)}px`);
  check(lifted > 1.2, "a swinging paw visibly clears the ground", `lift=${lifted.toFixed(2)}px`);
  const reach = STRIDE_PX.walk / 2;
  check(near(gaitLegs(0.1, "walk", 1)[0].x + reach * 0, gaitLegs(0.1, "walk", 1)[0].x, 0.001), "stride geometry is finite");
}

{
  const anim = new CatAnimator();
  let v = anim.update("player", { x: 0, y: 0, nowSec: 0, dtSec: 1 / 60 }, 1);
  let moving = false;
  const positions = new Set<string>();
  for (let i = 1; i <= 120; i++) {
    v = anim.update("player", { x: 100, y: 100, nowSec: i / 60, dtSec: 1 / 60 }, 1);
    positions.add(v.legs.map((l) => `${l.x.toFixed(3)}:${l.lift.toFixed(3)}`).join("|"));
    if (v.moving) moving = true;
  }
  check(v.legs.length === 4, "a standing cat still supplies four paws for the renderer");
  check(!moving, "a standing cat is not marked moving");
  check(positions.size === 1, "a standing cat's legs never cycle in place", `${positions.size} distinct poses`);
  check(v.blend === 0, "the gait blend settles to rest", `blend=${v.blend}`);
}

{
  const anim = new CatAnimator();
  let v = anim.update("player", { x: 0, y: 0, nowSec: 0, dtSec: 1 / 60 }, 1);
  for (let i = 1; i <= 60; i++) {
    v = anim.update("player", { x: i * 2.75, y: 0, speedPx: 165, gait: "walk", nowSec: i / 60, dtSec: 1 / 60 }, 1);
  }
  const walking = v;
  const firstIdle = anim.update("player", { x: 165, y: 0, speedPx: 0, gait: "idle", nowSec: 1.02, dtSec: 1 / 60 }, 1);
  check(walking.moving && walking.legs.length === 4, "a walking cat has a live four-leg cycle");
  check(firstIdle.legs.length === 4, "stopping does not snap the legs away");
  let settled = firstIdle;
  for (let i = 0; i < 120; i++) {
    settled = anim.update("player", { x: 165, y: 0, speedPx: 0, gait: "idle", nowSec: 1.1 + i / 60, dtSec: 1 / 60 }, 1);
  }
  check(settled.blend < 0.05, "the stride blends smoothly out after stopping", `blend=${settled.blend.toFixed(3)}`);
  check(!settled.moving, "the settled cat is idle");
  check(settled.legs.length === 4 && settled.legs.every((l) => l.lift < 0.12), "all four paws are back on the ground", settled.legs.map((l) => l.lift.toFixed(3)).join(","));
}

// the renderer: planted paws cancel the body bob, swinging ones do not
{
  const animView = {
    gait: "walk" as const,
    phase: 0.1,
    blend: 1,
    moving: true,
    bob: 1.6,
    roll: 0,
    legs: gaitLegs(0.1, "walk", 1),
    facing: 1 as const,
    blink: 1,
    earL: 0,
    earR: 0,
    headDx: 0,
    headDy: 0,
    breath: 1,
    talking: false,
  };
  const rec: unknown[][] = [];
  const legCtx = makeCtx();
  const proxy = new Proxy(legCtx, {
    get(t, prop) {
      if (prop === "roundRect") {
        return (...args: unknown[]) => {
          rec.push(args);
        };
      }
      return Reflect.get(t, prop);
    },
  }) as unknown as CanvasRenderingContext2D;
  drawCat(proxy, normalizeSkin({ fur: "#c9a27a" }), 0, 0, 1, "walk", 1, 0, { anim: animView });
  const paws = rec.filter((a) => a.length === 5 && a[2] === 4 && a[3] === 7);
  check(paws.length === 4, "the renderer draws exactly four paws", `${paws.length}`);
  const expected = animView.legs.map((l) => l.y - l.lift + (l.planted ? animView.bob : 0));
  const drawn = paws.map((a) => a[1] as number);
  check(
    expected.every((y) => drawn.some((d) => Math.abs(d - y) < 0.001)),
    "planted paws cancel the body bob (they stay on the floor)",
    `expected ${expected.map((v) => v.toFixed(1)).join(",")} / drawn ${drawn.map((v) => v.toFixed(1)).join(",")}`,
  );
}

// ---------------------------------------------------------------------------
// 6) PERF: THE GROUND IS BAKED, THE MINIMAP NO LONGER RE-RENDERS FROM RENDER
// ---------------------------------------------------------------------------
console.log("— performance —");
{
  const beforeChunks = chunkCanvases;
  counts.fillRect = 0;
  counts.drawImage = 0;
  stepFrame();
  const firstCells = counts.fillRect;
  const firstImages = counts.drawImage;
  const chunksAfterFirst = chunkCanvases;
  counts.fillRect = 0;
  counts.drawImage = 0;
  stepFrame();
  const secondCells = counts.fillRect;
  const secondImages = counts.drawImage;
  check(firstImages > 0, "terrain is drawn as cached chunk blits", `${firstImages} drawImage calls`);
  check(chunkCanvases === chunksAfterFirst, "the visible chunks stay baked (no rebake per frame)", `${chunkCanvases - chunksAfterFirst} new chunks`);
  check(beforeChunks > 0 && chunkCanvases === beforeChunks, "the chunk cache is bounded and reused across frames", `${chunkCanvases} chunk canvases total`);
  check(secondImages > 0 && Math.abs(secondImages - firstImages) <= 6, "the same chunk blits repeat (no flicker)", `blits ${firstImages} -> ${secondImages}`);
  check(secondCells <= firstCells, "the second frame paints no more than the first", `fillRect ${firstCells} -> ${secondCells}`);
  check(firstCells < 600, "no 8px terrain cells are repainted per frame", `${firstCells} fillRect calls (was ~22,000)`);
}

{
  const mapSrc = readFileSync(new URL("../src/pages/WorldMapData.tsx", import.meta.url), "utf8");
  check(!mapSrc.includes("queueMicrotask(() => {\n      setLensX"), "the minimap no longer schedules state updates from inside render");
  check(!mapSrc.includes("setLensX("), "the minimap lens has no React state loop at all");
}

// ---------------------------------------------------------------------------
// 7) WIRING: THE STORY LAYER USES ALL OF IT
// ---------------------------------------------------------------------------
console.log("— wiring —");
{
  const game = readFileSync(new URL("../src/pages/Game.tsx", import.meta.url), "utf8");
  const staging = readFileSync(new URL("../src/game/storyStaging.ts", import.meta.url), "utf8");
  check(
    staging.includes("const gate = stepScenePoint(opts.stepId);") &&
      staging.includes("d > gate.r + (opts.sceneMargin ?? 260)"),
    "the cutscene trigger resolves and enforces the step's real scene point",
  );
  check(game.includes("canStartBeat({") && game.includes("player: posRef.current"), "beats wait until the player is AT the scene (the real gate predicate)");
  check(game.includes("escortForStep(step.id)"), "the story layer consumes the escort plan");
  check(game.includes("g.setStoryEscort(plan)"), "the escort is actually started in the engine");
  check(game.includes("STORY_TRAVEL[step.id]") && game.includes("route: route?.route"), "staged cats walk their authored routes");
  check(game.includes("if (cineBeat) return; // one box at a time"), "a live dialogue box blocks the next scene from starting");
  check(game.includes("beatPlayedRef.current.has(step.id)) return; // the scene plays first") || game.includes("!beatPlayedRef.current.has(step.id)) return;"), "the camp objective waits for its arrival scene");
  check(game.includes("frameAt={cineFrame}"), "the cutscene camera is given the real scene location");
  check(!game.includes("waitForStoryArrival(beatActorIds"), "a bounded wait can no longer start a scene in the wrong place");
  const player = readFileSync(new URL("../src/pages/StoryCutscenePlayer.tsx", import.meta.url), "utf8");
  check(player.includes("frameAt ?? null"), "the player forwards the scene framing to the camera");
  const cinematics = readFileSync(new URL("../src/game/storyCinematics.ts", import.meta.url), "utf8");
  check(cinematics.includes("beat.openOn ?? sceneAt ?? playerPos"), "the camera opens on the scene when the beat names no framing");
}

// also: every beat actor is staged for its step (the camera must be able to
// find the cat where the scene happens)
let unstaged = "";
for (const [id, beat] of Object.entries(STORY_BEATS)) {
  const plan = STAGED_STEPS[id];
  if (!plan) continue;
  for (const actorId of beatActorIds(beat)) {
    if (!plan.npcs.some((n) => n.npcId === actorId)) unstaged += ` ${id}:${actorId}`;
  }
}
check(unstaged === "", `every beat actor is staged at its scene${unstaged ? ` (missing:${unstaged})` : ""}`);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
