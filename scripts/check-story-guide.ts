// Story Mode guidance suite: waypoints + gradual survival unlocks.
//
// Verifies the two behaviours the task is about, against the REAL data, the
// REAL resolver and the REAL engine:
//
//  1. every active mission has a waypoint that leads to the destination the
//     mission itself accepts (talk → the cat you must speak with, visit → the
//     area whose name the trigger compares, camp → inside the camp-test radius,
//     patrol → the real border marker, enter → the den's actual doorway), with
//     live distance / direction / off-screen information and an unobtrusive
//     objective panel — and Story guidance never leaks into other modes;
//  2. hunger/stamina are NOT live before the story introduces them: the meters
//     are absent from the HUD AND inert in the engine (no drain, no starvation
//     damage, no stamina penalty), each one switches on exactly at its story
//     milestone with a one-time explanation, and both state and progress
//     survive a reload.
//
// Run: bun scripts/check-story-guide.ts

import fs from "node:fs";
import { storySteps } from "../src/game/story";
import { STAGED_STEPS, STORY_LOCATIONS } from "../src/game/storyStaging";
import { CAMP_POINT, interiorEntrancePoint, resolveStoryWaypoint } from "../src/game/storyWaypoint";
import { SURVIVAL_UNLOCKS, SURVIVAL_UNLOCK_IDS, pendingIntros, storyStepIndexOf, unlockedMeters } from "../src/game/storyUnlocks";
import { areaAt, allObjects, WORLD_H, WORLD_W } from "../src/game/world";
import { ensurePlayer, markSurvivalSeen } from "../src/convex/players";
import { defaultAppearance } from "../src/convex/players";

let failures = 0;
function check(ok: boolean, name: string, detail = "") {
  if (ok) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ===========================================================================
// 1. every story step resolves to a real, correct destination
// ===========================================================================
console.log("\n--- 1. the waypoint leads to the objective the mission accepts ---");
{
  /** the area NAMES Game.tsx's visit trigger compares against (its own map) */
  const VISIT_IDS: Record<string, string> = {
    tallpines: "Tallpines",
    sandy: "Sandy Hollow",
    fourtrees: "Fourtrees",
    sunningrocks: "Sunningrocks",
  };
  let missing = 0;
  let offSource = 0;
  let outside = 0;
  const wrong: string[] = [];
  for (const step of storySteps) {
    const wp = resolveStoryWaypoint(step);
    if (!wp) {
      missing++;
      wrong.push(`${step.id}: no waypoint`);
      continue;
    }
    if (!wp.label || !wp.instruction || wp.radius <= 0) offSource++;
    if (wp.x < 0 || wp.y < 0 || wp.x > WORLD_W || wp.y > WORLD_H) outside++;
    const obj = step.objective;
    switch (obj.kind) {
      case "talk": {
        const staged = STAGED_STEPS[step.id]?.npcs.find((n) => n.npcId === obj.targetNpc);
        if (wp.kind !== "npc" || wp.npcId !== obj.targetNpc || !staged) wrong.push(`${step.id}: talk target not followed`);
        else if (Math.hypot(wp.x - staged.x, wp.y - staged.y) > 1) wrong.push(`${step.id}: waypoint is not at the staged cat`);
        break;
      }
      case "visit": {
        const area = areaAt(wp.x, wp.y);
        const expectedName = VISIT_IDS[obj.areaId];
        if (!area || area.name !== expectedName) wrong.push(`${step.id}: destination is in "${area?.name}", not "${expectedName}"`);
        break;
      }
      case "camp": {
        if (Math.hypot(wp.x - CAMP_POINT.x, wp.y - CAMP_POINT.y) > 1) wrong.push(`${step.id}: camp waypoint is not the camp centre`);
        if (wp.radius < obj.radius) wrong.push(`${step.id}: arrival radius ${wp.radius} < the mission's ${obj.radius}`);
        break;
      }
      case "patrol": {
        const loc = STORY_LOCATIONS[obj.marker];
        if (!loc || Math.hypot(wp.x - loc.x, wp.y - loc.y) > 1) wrong.push(`${step.id}: patrol marker mismatch`);
        const marker = allObjects.find((o) => o.interact === "border-marker" && Math.hypot(o.x - wp.x, o.y - wp.y) < 200);
        if (!marker) wrong.push(`${step.id}: no real border-marker object at the waypoint`);
        break;
      }
      case "enter": {
        const door = interiorEntrancePoint(obj.interior);
        if (!door || Math.hypot(wp.x - door.x, wp.y - door.y) > 1) wrong.push(`${step.id}: entrance mismatch`);
        const owner = allObjects.find((o) => o.interior === obj.interior);
        if (!owner) wrong.push(`${step.id}: no world object owns "${obj.interior}"`);
        break;
      }
      case "hunt": {
        const scene = STAGED_STEPS[step.id]?.scene;
        if (!scene || Math.hypot(wp.x - scene.x, wp.y - scene.y) > 1) wrong.push(`${step.id}: hunt waypoint is not the hunting ground`);
        break;
      }
    }
  }
  check(missing === 0, `every one of the ${storySteps.length} story steps has a waypoint`, wrong[0]);
  check(offSource === 0, "every waypoint carries a label, an instruction and an arrival radius");
  check(outside === 0, "every destination is inside the playable world (never an off-map mark)");
  check(wrong.length === 0, "every destination matches the trigger the mission itself uses", wrong.slice(0, 3).join(" | "));

  // the instruction is human, short and never a raw id
  const instructions = storySteps.map((s) => resolveStoryWaypoint(s)!.instruction);
  check(instructions.every((i) => i.length <= 48 && i.length >= 6), "instructions are short, readable lines");
  const first = resolveStoryWaypoint(storySteps[0])!;
  check(first.instruction === "Find Smudge", `the opening guides to the right cat by NAME (got "${first.instruction}")`);
  check(!instructions.some((i) => /\b(s1|s2|s3|npc|undefined)\b/.test(i)), "no instruction leaks an id, a step code or a placeholder");
}

console.log("\n--- 2. only the ACTIVE objective is guided ---");
{
  const wp0 = resolveStoryWaypoint(storySteps[0])!;
  const wp1 = resolveStoryWaypoint(storySteps[1])!;
  check(wp0.label !== wp1.label, "a new step resolves to a new destination (the marker moves on)");
  check(resolveStoryWaypoint(null) === null && resolveStoryWaypoint(undefined) === null, "no step = no marker (never a stray marker for future missions)");
}

// ===========================================================================
// 3. the engine: live distance, direction, arrival, marker, one objective
// ===========================================================================
console.log("\n--- 3. live guidance from the engine (real render + real update loop) ---");
{
  // --- minimal headless harness (same pattern as the other engine suites) ---
  const gradient = { addColorStop: () => undefined };
  const canvas = {
    getContext: () => recCtx,
    getBoundingClientRect: () => ({ width: 1280, height: 720, left: 0, top: 0, right: 1280, bottom: 720 }),
    width: 1280,
    height: 720,
    style: {},
  };
  type Mat = number[];
  let mat: Mat = [1, 0, 0, 1, 0, 0];
  const stack: Mat[] = [];
  const mul = (m: Mat, n: Mat): Mat => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const applyPt = (m: Mat, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
  let ops: { x: number; y: number }[] = [];
  let recording = false;
  let cameraStage = 0;
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
            case "save": stack.push([...mat]); break;
            case "restore": { const m = stack.pop(); if (m) mat = m; cameraStage = 0; break; }
            case "setTransform": mat = [1, 0, 0, 1, 0, 0]; cameraStage = 1; break;
            case "translate":
              cameraStage = cameraStage === 1 ? 2 : cameraStage === 2 ? 3 : cameraStage;
              if (cameraStage === 3) { mat = [1, 0, 0, 1, 0, 0]; cameraStage = 4; }
              else mat = mul(mat, [1, 0, 0, 1, num(args[0]), num(args[1])]);
              break;
            case "scale": cameraStage = cameraStage === 2 ? 2 : 0; break;
            case "rotate": { const r = num(args[0]); mat = mul(mat, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]); break; }
            default: break;
          }
          if (recording) {
            let x = NaN;
            let y = NaN;
            if (prop === "fillText") { x = num(args[1]); y = num(args[2]); }
            else if (["moveTo", "lineTo", "arc", "ellipse", "fillRect", "strokeRect", "roundRect", "rect"].includes(prop)) { x = num(args[0]); y = num(args[1]); }
            else if (["quadraticCurveTo", "bezierCurveTo", "arcTo"].includes(prop)) { x = num(args[args.length - 2]); y = num(args[args.length - 1]); }
            if (!Number.isNaN(x) && !Number.isNaN(y)) {
              const p = applyPt(mat, x, y);
              ops.push({ x: p.x, y: p.y });
            }
          }
          return undefined;
        };
      },
      set() { return true; },
    },
  ) as unknown as CanvasRenderingContext2D;

  (globalThis as Record<string, unknown>).window = {
    addEventListener: () => undefined, removeEventListener: () => undefined,
    setTimeout, clearTimeout, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  };
  const rafCbs = new Set<(t: number) => void>();
  (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => { rafCbs.add(cb); return rafCbs.size; };
  (globalThis as Record<string, unknown>).cancelAnimationFrame = () => undefined;
  let simTime = 0;
  (globalThis as Record<string, unknown>).performance = { now: () => simTime };
  function stepFrames(n: number) {
    for (let i = 0; i < n; i++) {
      simTime += 16.7;
      for (const cb of [...rafCbs]) cb(simTime);
    }
  }
  function measure(n: number) {
    ops = [];
    recording = true;
    stepFrames(n);
    recording = false;
    return ops;
  }

  const { GameCanvas } = await import("../src/game/engine");
  const SPAWN = { x: 78 * 32, y: 146 * 32 }; // Twolegplace, where story step 1 starts
  let lastInfo: { meters: number; tiles: number; arrived: boolean; onScreen: boolean; angle: number } | null = null;
  const noop = () => undefined;
  const g = new GameCanvas(canvas as unknown as HTMLCanvasElement, SPAWN, {
    onAreaChange: noop, onNearby: noop, onInteract: noop, onMove: noop, onPreyCaught: noop, onClock: noop, onWeatherChange: noop,
    onInteriorChange: noop, onStoryWaypoint: (info) => { lastInfo = info; },
  } as never);
  const G = g as unknown as { px: number; py: number; pxFacing: 1 | -1; pSpeed: number };
  stepFrames(2);

  // a far-away destination: the cue must be OFF-SCREEN and point the right way
  const far = { x: SPAWN.x + 3000, y: SPAWN.y + 600 };
  g.setStoryWaypoint({ ...far, label: "Far place", radius: 120 });
  stepFrames(20); // the engine re-emits guidance on a 0.25s cadence
  const farInfo = lastInfo as unknown as { meters: number; onScreen: boolean; angle: number };
  check(farInfo.meters > 0, "a distant objective reports a distance", `meters=${farInfo.meters}`);
  check(farInfo.onScreen === false, "a destination outside the camera view is reported OFF-SCREEN (so the edge arrow can be shown)");
  check(Math.abs(farInfo.angle - Math.atan2(far.y - G.py, far.x - G.px)) < 0.05, "the reported direction points at the destination", `angle=${farInfo.angle.toFixed(2)}`, );

  // the marker itself is painted at the destination and explains itself
  {
    const log = measure(2);
    const atTarget = log.filter((o) => Math.hypot(o.x - far.x, o.y - far.y) <= 60).length;
    // ~10 pieces of geometry per frame are drawn at the spot; more than that
    // means the marker drifted away from the destination and the filter above
    // would have caught fewer of them.
    check(atTarget >= 10, "the objective marker is painted ON the destination (world space)", `marker ops = ${atTarget}`);
  }
  // ...and steps aside during dialogue/cutscenes
  g.setStoryWaypointVisible(false);
  {
    const log = measure(2);
    const atTarget = log.filter((o) => Math.hypot(o.x - far.x, o.y - far.y) <= 60).length;
    check(atTarget === 0, "the marker is hidden on request (dialogue / cutscenes own the screen)", `marker ops = ${atTarget}`);
  }
  g.setStoryWaypointVisible(true);

  // walking toward it lowers the distance, and arrival is reported
  const near = { x: SPAWN.x + 200, y: SPAWN.y };
  g.setStoryWaypoint({ ...near, label: "Near place", radius: 120 });
  stepFrames(20);
  const before = (lastInfo as unknown as { meters: number }).meters;
  G.px = near.x - 90;
  G.py = near.y;
  stepFrames(20);
  const after = lastInfo as unknown as { meters: number; arrived: boolean; onScreen: boolean };
  check(after.meters < before, "the distance tracks the player as they move (updates every frame)", `${before} m → ${after.meters} m`);
  check(after.onScreen === true, "the destination is ON-SCREEN once it is inside the view");
  G.px = near.x - 20;
  G.py = near.y;
  stepFrames(20);
  check((lastInfo as unknown as { arrived: boolean }).arrived === true, "standing inside the objective's radius reports ARRIVED");

  // the mission waypoint and the player's own map pin are independent slots
  g.setWaypoint(10, 10); // the world-map feature's own pin
  check(g.hasStoryWaypoint && g.hasWaypoint, "a map waypoint never clears the mission waypoint");
  g.setStoryWaypoint(null);
  check(g.hasWaypoint && !g.hasStoryWaypoint, "clearing the mission waypoint leaves the map pin alone");

  // indoors the objective is in another space: guidance points at the doorway
  {
    const target = { x: SPAWN.x + 400, y: SPAWN.y };
    g.setStoryWaypoint({ ...target, label: "Outside place", radius: 120 });
    g.enterInterior("house-a");
    stepFrames(20);
    const info = lastInfo as unknown as { angle: number; onScreen: boolean };
    const door = { x: (15 / 2) * 32, y: (11 - 1) * 32 }; // house-a's walk-out gap
    const want = Math.atan2(door.y - (g as unknown as { py: number }).py, door.x - (g as unknown as { px: number }).px);
    check(Math.abs(info.angle - want) < 0.05, "indoors, guidance points to the room's OWN doorway (a real way out)", `angle=${info.angle.toFixed(2)} want=${want.toFixed(2)}`);
    const log = measure(2);
    const atTarget = log.filter((o) => Math.hypot(o.x - target.x, o.y - target.y) <= 60).length;
    check(atTarget === 0, "...and the outdoor marker is never painted into the room", `ops=${atTarget}`);
    g.exitInterior();
    g.setStoryWaypoint(null);
  }
}

// ===========================================================================
// 4. survival: locked until the story introduces it
// ===========================================================================
console.log("\n--- 4. survival meters stay locked until their story milestone ---");
{
  const allOff = (step: number) => {
    const m = unlockedMeters(step);
    return !m.hunger && !m.energy && !m.health;
  };
  check(
    [0, 1, 2, 3, 4, 5, 6].every(allOff),
    "chapters 1-3 (steps 0-6): no hunger, no stamina, no survival penalties are live",
  );
  const at7 = unlockedMeters(7);
  check(at7.hunger && at7.health && !at7.energy, "the first hunt introduces hunger (and the health it costs)");
  const at8 = unlockedMeters(8);
  check(at8.hunger && at8.energy, "battle training introduces stamina afterwards");
  check(unlockedMeters(16).energy && unlockedMeters(16).hunger, "once introduced, a meter stays live for the rest of the story");

  // introduction points are real steps, in story order
  check(
    SURVIVAL_UNLOCKS.every((u) => storyStepIndexOf(u.stepId) >= 0),
    "every unlock points at a real story step (no dead introduction)",
  );
  check(
    SURVIVAL_UNLOCKS.every((u, i) => i === 0 || storyStepIndexOf(SURVIVAL_UNLOCKS[i - 1].stepId) < storyStepIndexOf(u.stepId)),
    "introductions happen in story order (no mechanic arrives before the one before it)",
  );
  check(
    SURVIVAL_UNLOCKS.every((u) => u.title.length > 3 && u.text.length > 60),
    "each introduction explains the meter and how the player interacts with it",
  );

  // a one-time explanation, remembered in the save
  check(pendingIntros(6, []).length === 0, "no introduction plays before its milestone");
  check(pendingIntros(7, []).map((u) => u.id).join() === "hunger", "reaching the first hunt introduces hunger once");
  check(pendingIntros(7, ["hunger"]).length === 0, "an already-read introduction never replays");
  check(pendingIntros(8, ["hunger"]).map((u) => u.id).join() === "energy", "the next milestone introduces the next mechanic");
  check(pendingIntros(16, SURVIVAL_UNLOCK_IDS).length === 0, "after they are all read, nothing replays");
  check(
    JSON.stringify(unlockedMeters(8)) === JSON.stringify(unlockedMeters(8, ["hunger"] as never as string[])),
    "the unlock is derived from STORY progress only — the seen-list can never unlock a meter",
  );
}

console.log("\n--- 5. the save carries the unlock state ---");
{
  // Real handlers over a fake Convex (same harness the save suite uses).
  interface Doc { _id: string; _creationTime: number; [k: string]: unknown }
  const tables = new Map<string, Doc[]>();
  let seq = 0;
  const rows = (name: string) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  };
  const db = {
    query: (name: string) => {
      const conds: [string, unknown][] = [];
      const api: Record<string, unknown> = {
        withIndex: (_i: string, cb: (q: { eq: (f: string, v: unknown) => unknown }) => unknown) => { cb({ eq: (f, v) => (conds.push([f, v]), undefined) }); return api; },
        first: async () => rows(name).find((d) => conds.every(([f, v]) => d[f] === v)) ?? null,
        collect: async () => rows(name),
      };
      return api;
    },
    insert: async (name: string, doc: Record<string, unknown>) => { const _id = `${name}:${++seq}`; rows(name).push({ _id, _creationTime: seq, ...doc }); return _id; },
    patch: async (id: string, patch: Record<string, unknown>) => {
      const d = [...tables.values()].flat().find((x) => x._id === id);
      if (!d) throw new Error("no row");
      Object.assign(d, patch);
    },
    get: async (id: string) => [...tables.values()].flat().find((x) => x._id === id) ?? null,
  };
  const userId = "user-story";
  const ctx = { auth: { getUserIdentity: async () => ({ subject: `${userId}|session`, issuer: "test", tokenIdentifier: "test" }) }, db };
  type Handler = (ctx: unknown, args: never) => Promise<unknown>;
  const callEnsure = (ensurePlayer as unknown as { _handler: Handler })._handler;
  const callMark = (markSurvivalSeen as unknown as { _handler: Handler })._handler;

  const created = (await callEnsure(ctx, { mode: "story", appearance: defaultAppearance, catName: "Rusty" } as never)) as Doc;
  const row = rows("players").find((r) => r._id === created._id)!;
  check(row.survivalSeen === undefined || (row.survivalSeen as string[]).length === 0, "a brand-new story save starts with NO introductions seen (so nothing is unlocked early)");
  check(row.storyStep === 0, "...and it starts at story step 0 (the meters stay locked)");

  const first = await callMark(ctx, { mechanic: "hunger" } as never);
  const second = await callMark(ctx, { mechanic: "hunger" } as never);
  check(first === true && second === false, "recording an introduction writes the save once (idempotent)", `first=${String(first)} second=${String(second)}`);
  check(JSON.stringify(row.survivalSeen) === JSON.stringify(["hunger"]), "the save stores exactly the mechanics that were introduced");
  await callMark(ctx, { mechanic: "energy" } as never);
  check((row.survivalSeen as string[]).includes("energy") && (row.survivalSeen as string[]).length === 2, "later introductions accumulate");
  check(row.storyStep === 0, "progress is untouched by the introduction bookkeeping");
  // a reload: the meters come from story progress, the introductions from the save
  const reloaded = rows("players").find((r) => r._id === created._id)!;
  check(pendingIntros(7, reloaded.survivalSeen as string[]).length === 0 && unlockedMeters(7).hunger, "after a reload the same mechanics are live and no introduction replays", );
}

console.log("\n--- 6. the engine really does stop tracking a locked meter ---");
{
  const gradient = { addColorStop: () => undefined };
  const mkCanvas = () => ({
    getContext: () => new Proxy({}, {
      get: (_t, p: string) => {
        if (p === "canvas") return stub;
        if (p === "measureText") return () => ({ width: 12 });
        if (p === "createRadialGradient" || p === "createLinearGradient" || p === "createPattern") return () => gradient;
        return () => undefined;
      },
      set: () => true,
    }),
    getBoundingClientRect: () => ({ width: 1280, height: 720 }),
    width: 1280,
    height: 720,
    style: {},
  });
  const stub = mkCanvas();
  (globalThis as Record<string, unknown>).window = {
    addEventListener: () => undefined, removeEventListener: () => undefined, setTimeout, clearTimeout,
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  };
  const cbs = new Set<(t: number) => void>();
  (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => { cbs.add(cb); return cbs.size; };
  (globalThis as Record<string, unknown>).cancelAnimationFrame = () => undefined;
  let t = 0;
  (globalThis as Record<string, unknown>).performance = { now: () => t };
  const frames = (n: number, step: number) => {
    for (let i = 0; i < n; i++) {
      t += step;
      for (const cb of [...cbs]) cb(t);
    }
  };
  const { GameCanvas } = await import("../src/game/engine");
  const noop = () => undefined;
  const g = new GameCanvas(stub as unknown as HTMLCanvasElement, { x: 78 * 32, y: 146 * 32 }, {
    onAreaChange: noop, onNearby: noop, onInteract: noop, onMove: noop, onPreyCaught: noop, onClock: noop, onWeatherChange: noop, onInteriorChange: noop,
  } as never);
  frames(2, 16.7);

  // a whole simulated day with the meters LOCKED: nothing may drain
  g.setSurvivalActive({ hunger: false, energy: false });
  const h0 = g.needs.hunger;
  const e0 = g.needs.energy;
  const hp0 = g.needs.health;
  g.needs.hunger = 0; // a stale value from an old save must have no effect while locked
  g.needs.energy = 0;
  frames(180, 1000); // 3 in-game minutes at 1s steps
  check(g.needs.health === hp0 && g.needs.hunger === 0, "locked hunger does not drain — and a leftover 0 causes no starvation damage", `health ${hp0}→${g.needs.health}`);
  check(g.needs.energy === 0, "locked stamina does not drain and applies no exhaustion penalty");
  check(g.survivalActive.hunger === false && g.survivalActive.energy === false, "the engine reports the locked state truthfully");

  // introduce hunger (as the story does) and it starts tracking from a healthy value
  g.beginSurvivalMeter("hunger");
  check(g.needs.hunger >= 80, "a meter introduced for the first time starts healthy (never an instantly starving cat)", `hunger=${g.needs.hunger}`);
  g.setSurvivalActive({ hunger: true, energy: true });
  g.beginSurvivalMeter("energy");
  const h1 = g.needs.hunger;
  const e1 = g.needs.energy;
  g.needs.drain(60, false, false, false);
  check(g.needs.hunger < h1 && g.needs.energy < e1, "once introduced, hunger and stamina really do drain", `${h1}→${g.needs.hunger}, ${e1}→${g.needs.energy}`);

  // empty belly costs health again once hunger is live
  g.needs.hunger = 0;
  g.needs.health = 100;
  frames(120, 16.7); // ~2s of frames through the engine's own update loop
  check(g.needs.health < 100, "with hunger live, an empty belly costs health (the penalty is real)", `health=${g.needs.health.toFixed(2)}`);

  // and the default (every other mode) keeps both meters live
  const g2 = new GameCanvas(stub as unknown as HTMLCanvasElement, { x: 78 * 32, y: 146 * 32 }, {
    onAreaChange: noop, onNearby: noop, onInteract: noop, onMove: noop, onPreyCaught: noop, onClock: noop, onWeatherChange: noop, onInteriorChange: noop,
  } as never);
  check(g2.survivalActive.hunger === true && g2.survivalActive.energy === true, "every other mode is untouched: a fresh engine has both meters live");
}

// ===========================================================================
// 7. wiring: HUD + save + mode separation
// ===========================================================================
console.log("\n--- 7. the wiring that makes it true in the game ---");
{
  const game = fs.readFileSync("src/pages/Game.tsx", "utf8");
  const engine = fs.readFileSync("src/game/engine.ts", "utf8");
  const schema = fs.readFileSync("src/convex/schema.ts", "utf8");
  check(game.includes("import { pendingIntros, unlockedMeters, type SurvivalUnlock } from \"@/game/storyUnlocks\";"), "the game derives unlocks from the story tables");
  check(game.includes("const meters = unlockedMeters(storyStep);") && game.includes("g?.setSurvivalActive({ hunger: meters.hunger, energy: meters.energy });"), "the engine is switched to exactly the unlocked meters");
  check(game.includes("if (mode !== \"story\") {") && game.includes("g?.setSurvivalActive({ hunger: true, energy: true });"), "Free Play / Online keep both meters (unchanged behaviour)");
  check(game.includes("const fresh = pendingIntros(storyStep, survivalSeenRef.current);"), "the one-time explanation is driven by the save + the story");
  check(game.includes("markSurvivalSeen({ mechanic: u.id })"), "reading an introduction is persisted");
  check(game.includes("survivalSeenRef.current = player.survivalSeen ?? [];"), "the save's introduction state is loaded on boot");
  check(game.includes("g?.beginSurvivalMeter(m)"), "a newly live meter starts from a healthy value");
  check(game.includes(".filter(([, , , live]) => live)"), "the HUD draws ONLY the meters this mode has unlocked");
  check(game.includes("{(survival.hunger || survival.energy) && ("), "early Story Mode shows no survival strip at all");
  check(game.includes("New — {survivalIntros[0].title}"), "the contextual explanation is rendered, once, non-modally");
  check(game.includes("resolveStoryWaypoint(step, {") && game.includes("g.setStoryWaypoint(wp);"), "each step sets the objective waypoint");
  check(game.includes("setStoryWaypointVisible(!storyBusy)"), "the marker steps aside during dialogue/cutscenes");
  check(game.includes("storyWpInfo && !storyWpInfo.onScreen"), "an off-screen objective pins an arrow to the screen edge");
  check(game.includes("}, [phase, mode, storyStep]);") , "the waypoint is re-resolved whenever the story advances");
  check(engine.includes("if (this.hungerActive) this.hunger -= dt *"), "the drain itself is gated (not merely hidden)");
  check(engine.includes("if (this.needs.hungerActive && this.needs.hunger <= 0) {"), "starvation damage is gated");
  check(engine.includes("if (this.needs.energyActive && this.needs.energy <= 0) {"), "the exhaustion penalty is gated");
  check(schema.includes("survivalSeen: v.optional(v.array(v.string())),"), "the unlock state is part of the save");
}

console.log(failures === 0 ? "\nALL STORY GUIDANCE CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
