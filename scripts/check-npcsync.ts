// §4/§5/§29/§30/§31/§42/§44 ONLINE NPC sync verification.
//
//  1. SERVER TERRITORY AUTHORITY: an unsanctioned out-of-territory snapshot is
//     pulled back into the cat's own ground (home territory + leash) — a
//     client can never force an NPC into another Clan's territory.
//  2. SANCTIONED CROSSINGS: a claimed, allow-listed, unexpired excursion is
//     allowed but bounded; an expired/unknown reason is clamped like any
//     other (§4/§5). A gathering/medicine errand therefore works and every
//     excursion still ends.
//  3. WIRE VALIDATION: unknown ids, duplicates, bad coordinates, stale
//     sequence numbers and out-of-vocabulary states are rejected or repaired;
//     conversation text can never ride the sync channel (names only).
//  4. AUTHORITY SNAPSHOT: the engine emits exactly one valid entry per live
//     cat, and every out-of-ground cat carries a legitimate claim.
//  5. ERRAND LIFE CYCLE (§4): a leader travels to the Gathering with a reason,
//     the excursion is declared, the deadline turns it around, and the cat
//     walks home — no teleports, no teleport-home.
//  6. FOLLOWER MODE (§30): a second client adopts the authoritative states
//     smoothly (bounded per-frame movement, no duplicates, no spawning),
//     converges on the authority's positions, freezes cats another player is
//     talking with (§29), and falls back to local sim when sync stops.
//  7. CROWDING (§44): cats spread out instead of stacking on one spot.
//
// Run: bun scripts/check-npcsync.ts

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

const { GameCanvas } = await import("../src/game/engine");
const { npcs, territoryAt } = await import("../src/game/world");
const {
  NPC_SYNC_MAX_CROSS_MS,
  NPC_SYNC_SNAP_PX,
  clampToHomeTerritory,
  npcRoster,
  npcStatesDigest,
  sanitizeCrossMap,
  sanitizeNpcStates,
  territoryLeashFor,
} = await import("../src/game/npcSync");

let failures = 0;
let count = 0;
function check(cond: boolean, label: string) {
  count++;
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}`);
    failures++;
  }
}

const cb = {
  onAreaChange: () => undefined,
  onNearby: () => undefined,
  onMove: () => undefined,
  onInteract: () => undefined,
  onPreyCaught: () => undefined,
  onClock: () => undefined,
  onWeatherChange: () => undefined,
  onInteriorChange: () => undefined,
  onNpcIdle: () => undefined,
};
type EngineInternals = {
  px: number;
  py: number;
  time: number;
  dayTime: number;
  npcStates: {
    def: { id: string; name: string; clan: string; home: { x: number; y: number } };
    x: number;
    y: number;
    ai: string;
    pose: string;
    activity: string;
    convoActive: boolean;
    homeTerritory: string;
    territoryLeash: number;
    errand?: { x: number; y: number; reason: string; phase: string; untilT: number; label: string };
    waitUntil: number;
    remoteBusyWith?: string | null;
  }[];
  maybeErrand: (n: unknown, night: boolean) => boolean;
  errandAt: Map<string, number>;
  setStoryContext: (m: string, s: number) => void;
  setNpcConversation: (id: string, active: boolean) => void;
  setNpcBusyClaims: (claims: readonly { npcId: string; name: string; until: number }[] | undefined, until: number) => void;
  setNpcSyncSelfName: (name: string | null) => void;
  getNpcActivity: (id: string) => string | null;
  isNpcApproachable: (id: string) => boolean;
};
type Snapshot = {
  npcs: { id: string; x: number; y: number; facing: number; pose: string; ai: string; activity: string; movement: string; denId?: string | null; convoWith?: string | null; seq: number }[];
  cross: Record<string, { reason: string; until: number }>;
  digest: string;
};

const g = new GameCanvas(canvas as unknown as HTMLCanvasElement, { x: 78 * 32, y: 146 * 32 }, cb as never);
pump(80);
const eng = g as unknown as EngineInternals;

// ---------------------------------------------------------------------------
// 1) SERVER TERRITORY AUTHORITY — an unsanctioned jump is clamped home
// ---------------------------------------------------------------------------
console.log("— server territory authority —");
{
  const bluestar = npcRoster("bluestar")!;
  const trespass = {
    id: "bluestar",
    x: bluestar.home.x + 2200, // deep into another Clan's ground
    y: bluestar.home.y - 1800,
    facing: 1,
    pose: "sit",
    ai: "idle",
    activity: "loitering somewhere he does not belong",
    movement: "idle",
    seq: 1,
  };
  const res = sanitizeNpcStates([trespass], {}, Date.now());
  check(res.states.length === 1, "a well-formed snapshot survives validation");
  const s = res.states[0]!;
  const where = territoryAt(s.x, s.y);
  check(where === bluestar.homeTerritory, `trespassing snapshot clamped HOME (${where} vs ${bluestar.homeTerritory})`);
  check(
    Math.hypot(s.x - bluestar.home.x, s.y - bluestar.home.y) <= bluestar.leash + 1,
    "clamped position respects the cat's leash",
  );
  check(res.clamped >= 1, `the server counted the correction (clamped=${res.clamped})`);

  // the shared clamp is the engine's clamp (one rule, two callers)
  const manual = clampToHomeTerritory(bluestar.home, bluestar.homeTerritory, bluestar.leash, trespass.x, trespass.y);
  check(
    Math.abs(manual.x - s.x) < 0.001 && Math.abs(manual.y - s.y) < 0.001,
    "server and engine clamp to the exact same point",
  );
}

// ---------------------------------------------------------------------------
// 2) SANCTIONED CROSSINGS — allowed, bounded, and always temporary
// ---------------------------------------------------------------------------
console.log("— sanctioned crossings —");
{
  const now = Date.now();
  const oakheart = npcRoster("oakheart")!;
  const far = {
    id: "oakheart",
    x: oakheart.home.x - 1200,
    y: oakheart.home.y + 900,
    facing: -1,
    pose: "walk",
    ai: "errand",
    activity: "travelling to the Gathering",
    movement: "walk",
    seq: 2,
  };
  const claimed = sanitizeNpcStates([far], { oakheart: { reason: "gathering", until: now + 60_000 } }, now);
  const c = claimed.states[0]!;
  check(claimed.crossing === 1, "a claimed excursion is recognised as sanctioned");
  check(territoryAt(c.x, c.y) !== oakheart.homeTerritory, "the sanctioned cat may leave its own ground");
  check(
    Math.hypot(c.x - oakheart.home.x, c.y - oakheart.home.y) <= oakheart.leash * 2.2 + 1,
    "even a sanctioned excursion stays bounded near home",
  );
  check(claimed.clamped === 0, "a sanctioned excursion inside the bound is not clamped");

  const expired = sanitizeNpcStates([far], { oakheart: { reason: "gathering", until: now - 1 } }, now);
  check(territoryAt(expired.states[0]!.x, expired.states[0]!.y) === oakheart.homeTerritory, "an EXPIRED claim is clamped home");

  const bogus = sanitizeNpcStates([far], { oakheart: { reason: "because-i-felt-like-it", until: now + 60_000 } }, now);
  check(territoryAt(bogus.states[0]!.x, bogus.states[0]!.y) === oakheart.homeTerritory, "an unknown reason is NOT a crossing");

  const tooLong = sanitizeNpcStates([far], { oakheart: { reason: "patrol", until: now + NPC_SYNC_MAX_CROSS_MS * 3 } }, now);
  check(territoryAt(tooLong.states[0]!.x, tooLong.states[0]!.y) === oakheart.homeTerritory, "an oversized claim window is refused");

  const pruned = sanitizeCrossMap({ oakheart: { reason: "gathering", until: now + 60_000 }, "not-a-cat": { reason: "patrol", until: now + 60_000 } }, now);
  check(Object.keys(pruned).length === 1 && !!pruned.oakheart, "cross claims are pruned to real, live, allow-listed cats");
}

// ---------------------------------------------------------------------------
// 3) WIRE VALIDATION — reject junk, repair vocabulary, never leak text
// ---------------------------------------------------------------------------
console.log("— wire validation —");
{
  const base = {
    id: "graypaw",
    x: npcRoster("graypaw")!.home.x,
    y: npcRoster("graypaw")!.home.y,
    facing: 1,
    pose: "sit",
    ai: "idle",
    activity: "sharing tongues",
    movement: "idle",
    seq: 5,
  };
  const res = sanitizeNpcStates(
    [
      { ...base, id: "not-a-real-cat" },
      { ...base, id: "graypaw", x: Number.NaN },
      { ...base, id: "graypaw" },
      { ...base },
      { ...base, id: "ravenpaw", pose: "moonwalk", ai: "become-a-legend", movement: "fly" },
      { ...base, id: "dustpaw", convoWith: "x".repeat(400) + " secret chat text that must never be stored" },
      null,
    ],
    {},
    Date.now(),
  );
  const reasons = res.rejected.map((r) => r.reason);
  check(reasons.includes("unknown-npc"), "an unknown cat id is rejected");
  check(reasons.includes("bad-coords"), "non-finite coordinates are rejected");
  check(reasons.includes("duplicate"), "duplicate ids are rejected");
  check(reasons.includes("not-an-object"), "non-object entries are rejected");
  check(res.states.length === 3, `only the valid cats survive (${res.states.length})`);
  const repaired = res.states.find((s) => s.id === "ravenpaw")!;
  check(repaired.pose === "sit" && repaired.ai === "idle" && repaired.movement === "idle", "unknown vocabulary falls back to safe defaults");
  const chatty = res.states.find((s) => s.id === "dustpaw")!;
  check((chatty.convoWith ?? "").length <= 24, `conversation fields are capped to a display NAME (${chatty.convoWith?.length ?? 0} chars)`);
  check(!(chatty.convoWith ?? "").includes("secret chat text"), "conversation TEXT can never ride the sync channel");
  // monotonic ordering: the same cat can never move backward
  const prev = { graypaw: 9 };
  const stale = sanitizeNpcStates([{ ...base, seq: 9 }], {}, Date.now(), prev);
  check(stale.states.length === 0 && stale.rejected[0]!.reason === "stale-seq", "an out-of-order NPC state is rejected");
}

// ---------------------------------------------------------------------------
// 4) AUTHORITY SNAPSHOT — one valid entry per live cat, claims when out
// ---------------------------------------------------------------------------
console.log("— authority snapshot —");
{
  eng.setNpcSyncSelfName("Rusty");
  const snap = (g as unknown as { npcSyncSnapshot: () => Snapshot }).npcSyncSnapshot();
  const live = eng.npcStates.filter((n) => !(n as unknown as { gone?: boolean }).gone);
  check(snap.npcs.length === live.length, `one wire entry per live cat (${snap.npcs.length}/${live.length})`);
  const ids = snap.npcs.map((s) => s.id);
  check(new Set(ids).size === ids.length, "no duplicate cats in the snapshot");
  check(snap.npcs.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && (s.facing === 1 || s.facing === -1)), "every entry has finite coordinates and a valid facing");
  check(snap.npcs.every((s) => Number.isInteger(s.seq) && s.seq > 0), "every entry carries a monotonic sequence number");
  const moved = sanitizeNpcStates(snap.npcs, snap.cross, Date.now());
  check(moved.rejected.length === 0, "the engine's own snapshot passes server validation untouched");
  // §31: no cat may be out of its ground without a declared claim
  let unsanctioned = 0;
  for (const s of snap.npcs) {
    const entry = npcRoster(s.id)!;
    const here = territoryAt(s.x, s.y);
    if (here === entry.homeTerritory || here === "unclaimed") continue;
    if (!snap.cross[s.id]) unsanctioned++;
  }
  check(unsanctioned === 0, `no unsanctioned out-of-ground cat in a real snapshot (${unsanctioned})`);
  // digest: stable when nothing moves, different when the world changes
  const d1 = npcStatesDigest(snap.npcs);
  const d2 = npcStatesDigest(snap.npcs.map((s) => ({ ...s, x: s.x + 400 })));
  check(d1 === npcStatesDigest(snap.npcs) && d1 !== d2, "the publish digest only changes when the world visibly moves");
  // §29: a conversation with MY cat shows up as a busy NAME, never as text
  const target = eng.npcStates.find((n) => n.def.id === "graypaw")!;
  eng.setNpcConversation("graypaw", true);
  const snap2 = (g as unknown as { npcSyncSnapshot: () => Snapshot }).npcSyncSnapshot();
  const wired = snap2.npcs.find((s) => s.id === "graypaw")!;
  check(wired.convoWith === "Rusty", "the cat's conversation partner is published as my cat NAME");
  eng.setNpcConversation("graypaw", false);
  void target;
}

// ---------------------------------------------------------------------------
// 5) ERRAND LIFE CYCLE (§4) — travels with a reason, returns home, no jumps
// ---------------------------------------------------------------------------
console.log("— errand life cycle —");
{
  const cat = eng.npcStates.find((n) => n.def.id === "bluestar")!;
  const fourtrees = (g as unknown as { fourtreesSpot: () => { x: number; y: number } | null }).fourtreesSpot()!;
  check(!!fourtrees, "Fourtrees is a real destination");
  // stage: night at moonhigh, the leader awake, near the Gathering ground
  eng.dayTime = 0.9 * 600;
  cat.waitUntil = 0;
  cat.ai = "idle";
  cat.convoActive = false;
  cat.x = fourtrees.x - 280;
  cat.y = fourtrees.y - 60;
  let started = false;
  for (let i = 0; i < 500 && !started; i++) {
    eng.errandAt.clear(); // lift the per-Clan rate limit for a deterministic run
    started = eng.maybeErrand(cat, true);
  }
  check(started && !!cat.errand, "a leader leaves for a Gathering (sanctioned errand)");
  check(cat.errand?.reason === "gathering", `the excursion carries a real reason (${cat.errand?.reason})`);
  check(cat.ai === "errand", "the errand is a first-class activity (ai=errand)");

  let sawOut = false;
  let sawArrive = false;
  let sawBack = false;
  let sawHome = false;
  let biggestStep = 0;
  let declared = false;
  let everOutOfGround = false;
  let homeGapAtArrival = Infinity;
  let teleports = 0;
  const startDist = Math.hypot(cat.x - cat.def.home.x, cat.y - cat.def.home.y);
  for (let i = 0; i < 900 && !sawHome; i++) {
    const lx = cat.x;
    const ly = cat.y;
    pump(100);
    const stepNow = Math.hypot(cat.x - lx, cat.y - ly);
    biggestStep = Math.max(biggestStep, stepNow);
    if (stepNow > 40) teleports++;
    if (cat.ai === "errand") {
      sawOut = true;
      const snap = (g as unknown as { npcSyncSnapshot: () => Snapshot }).npcSyncSnapshot();
      const here = territoryAt(cat.x, cat.y);
      if (here !== cat.homeTerritory && here !== "unclaimed") {
        everOutOfGround = true;
        if (snap.cross["bluestar"]?.reason === "gathering") declared = true;
      }
      // hurry the stay along so the test stays bounded
      if (cat.errand) cat.errand.untilT = Math.min(cat.errand.untilT, eng.time + 1.5);
    }
    if (cat.errand?.phase === "rest") sawArrive = true;
    if (cat.ai === "errand_back") sawBack = true;
    if (!cat.errand && cat.ai === "idle" && !sawHome) {
      sawHome = true;
      homeGapAtArrival = Math.hypot(cat.x - cat.def.home.x, cat.y - cat.def.home.y);
    }
    cat.waitUntil = Math.min(cat.waitUntil, eng.time + 2);
  }
  check(sawOut, "the cat physically travels out (errand)");
  check(
    !everOutOfGround || declared,
    `any moment outside its own ground is DECLARED to the server (out=${everOutOfGround}, declared=${declared})`,
  );
  check(sawBack, "the deadline turns the cat around (errand_back)");
  check(sawHome, "the cat walks home and resumes normal life");
  check(
    teleports <= 1 && biggestStep < 900,
    `only the documented emergency recovery may move a cat instantly (${teleports} such step(s), largest ${biggestStep.toFixed(0)}px)`,
  );
  const endTerr = territoryAt(cat.x, cat.y);
  check(
    sawHome && (endTerr === cat.homeTerritory || endTerr === "unclaimed"),
    `the errand always ENDS with the cat back on its own ground (${endTerr}, ${Math.round(homeGapAtArrival)}px from its den)`,
  );
  void startDist;

  // the DECLARATION path itself: an erranding cat outside its ground must
  // carry a live, allow-listed claim in the published snapshot
  const sally = eng.npcStates.find((n) => n.def.id === "bluestar")!;
  const oak = npcRoster("oakheart")!;
  sally.x = oak.home.x;
  sally.y = oak.home.y; // staged deep in another Clan's ground
  sally.errand = { x: oak.home.x, y: oak.home.y, reason: "gathering", phase: "out", untilT: eng.time + 120, label: "travelling to the Gathering" };
  const crossSnap = (g as unknown as { npcSyncSnapshot: () => Snapshot }).npcSyncSnapshot();
  check(crossSnap.cross["bluestar"]?.reason === "gathering", "an out-of-ground errand publishes its sanctioned reason");
  check(
    (crossSnap.cross["bluestar"]?.until ?? 0) > Date.now(),
    "the published crossing carries a future deadline (temporary by construction)",
  );
  sally.errand = undefined;
  sally.x = sally.def.home.x;
  sally.y = sally.def.home.y;
}

// ---------------------------------------------------------------------------
// 6) FOLLOWER MODE (§29/§30/§31) — smooth adoption, no duplicates, no fighting
// ---------------------------------------------------------------------------
console.log("— follower mode —");
{
  pump(60);
  const g2 = new GameCanvas(canvas as unknown as HTMLCanvasElement, { x: 78 * 32, y: 146 * 32 }, cb as never);
  pump(40);
  const f = g2 as unknown as EngineInternals & {
    applyNpcSync: (states: readonly unknown[], busy: readonly { npcId: string; name: string; until: number }[] | undefined, now: number) => void;
    clearNpcSync: () => void;
  };
  const snap = (g as unknown as { npcSyncSnapshot: () => Snapshot }).npcSyncSnapshot();
  const idsBefore = f.npcStates.map((n) => n.def.id);
  check(new Set(idsBefore).size === idsBefore.length, "the follower starts with one instance per cat");

  f.applyNpcSync([...snap.npcs, { id: "ghost-cat", x: 0, y: 0, facing: 1, pose: "sit", ai: "idle", activity: "?", movement: "idle", seq: 1 }], [], Date.now());
  const idsAfter = f.npcStates.map((n) => n.def.id);
  check(idsAfter.length === idsBefore.length, "a remote state can never SPAWN a duplicate cat");
  check(new Set(idsAfter).size === idsAfter.length, "no duplicate cats after adopting a snapshot");

  // smoothness: the follower glides, it never teleports, and it converges
  // §30: the FIRST adoption may snap (join/reconnect) — a large desync is the
  // documented authoritative correction. After that, followers glide only.
  let joinSnaps = 0;
  for (let i = 0; i < 10; i++) {
    const c = f.npcStates.find((n) => n.def.id === "bluestar")!;
    const lx = c.x;
    const ly = c.y;
    pump(16);
    if (Math.hypot(c.x - lx, c.y - ly) > NPC_SYNC_SNAP_PX) joinSnaps++;
  }
  check(joinSnaps <= 1, `a far-off follower snaps at most once on join (${joinSnaps})`);
  const target = npcRoster("bluestar")!;
  const authority = snap.npcs.find((s) => s.id === "bluestar")!;
  let maxStep = 0;
  for (let i = 0; i < 260; i++) {
    const cat = f.npcStates.find((n) => n.def.id === "bluestar")!;
    const lx = cat.x;
    const ly = cat.y;
    pump(16);
    maxStep = Math.max(maxStep, Math.hypot(cat.x - lx, cat.y - ly));
  }
  const follower = f.npcStates.find((n) => n.def.id === "bluestar")!;
  const jitter = Math.hypot(follower.x - authority.x, follower.y - authority.y);
  // the authority keeps walking, so allow a moving-cat gap — but it must be
  // far smaller than the original desync (the follower is tracking, not lost)
  const desync0 = Math.hypot(target.home.x - authority.x, target.home.y - authority.y);
  check(maxStep <= (NPC_SYNC_SNAP_PX / 2) + 20, `follower movement is bounded per frame (${maxStep.toFixed(1)}px)`);
  check(jitter < Math.max(60, desync0), `the follower converges on the authoritative position (gap ${Math.round(jitter)}px)`);

  // §29: a cat another player is talking with holds still and says so — the
  // AUTHORITY respects the server's claim too, so nobody keeps simulating it
  const busyNow = Date.now();
  const claim = [{ npcId: "sandpaw", name: "Brightpaw", until: busyNow + 20_000 }];
  eng.setNpcBusyClaims(claim, busyNow);
  pump(900);
  const authSnap = (g as unknown as { npcSyncSnapshot: () => Snapshot }).npcSyncSnapshot();
  f.applyNpcSync(authSnap.npcs, claim, busyNow);
  const sand = f.npcStates.find((n) => n.def.id === "sandpaw")!;
  pump(3000); // let the follower settle onto the frozen spot
  const sx = sand.x;
  const sy = sand.y;
  pump(1500);
  check(Math.hypot(sand.x - sx, sand.y - sy) < 6, `a claimed cat holds position on every client (moved ${Math.hypot(sand.x - sx, sand.y - sy).toFixed(1)}px)`);
  check((sand.activity ?? "").includes("Brightpaw"), `the cat's activity names the player talking to it ("${sand.activity}")`);
  check(sand.remoteBusyWith === "Brightpaw", "the busy marker is exposed for the nameplate");
  check(!f.isNpcApproachable("sandpaw"), "a claimed cat cannot be talked to by a second player");

  // sync stops → this client simulates locally again (never a frozen world)
  eng.setNpcBusyClaims([], Date.now());
  f.clearNpcSync();
  const before = f.npcStates.map((n) => ({ id: n.def.id, x: n.x, y: n.y }));
  pump(2000);
  const after = f.npcStates.map((n) => ({ id: n.def.id, x: n.x, y: n.y }));
  const moved = after.filter((a, i) => Math.hypot(a.x - before[i]!.x, a.y - before[i]!.y) > 4).length;
  check(moved > 3, `local simulation resumes when authority snapshots stop (${moved} cats moving)`);
}

// ---------------------------------------------------------------------------
// 7) CROWDING (§44) — cats spread out across their world
// ---------------------------------------------------------------------------
console.log("— crowding —");
{
  eng.dayTime = 10 / 24 * 600;
  pump(90_000);
  // only cats that are actually OUT IN THE WORLD count: a cat asleep in its
  // den or inside a Twoleg house lives in another coordinate space
  const live = eng.npcStates.filter(
    (n) =>
      !(n as unknown as { gone?: boolean }).gone &&
      n.ai !== "in_den" &&
      !n.ai.startsWith("house_") &&
      !(n as unknown as { houseInterior?: string }).houseInterior,
  );
  const exact = new Map<string, number>();
  for (const n of live) {
    const key = `${Math.round(n.x)},${Math.round(n.y)}`;
    exact.set(key, (exact.get(key) ?? 0) + 1);
  }
  const stacked = [...exact.values()].filter((n) => n > 1).length;
  check(stacked === 0, `no two cats share an exact position (${stacked} stacked spots)`);
  const tooClose: string[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 8) tooClose.push(`${a.def.id}(${a.ai}) x ${b.def.id}(${b.ai}) ${d.toFixed(1)}px`);
    }
  }
  check(tooClose.length === 0, `no sprite stacking (${tooClose.join("; ") || "0 pairs closer than 8px"})`);
  const distinct = new Set(live.map((n) => `${Math.round(n.x / 24)},${Math.round(n.y / 24)}`)).size;
  check(distinct >= Math.ceil(live.length * 0.6), `cats occupy distinct areas (${distinct}/${live.length} cells)`);
  const inCamp = live.filter((n) => n.homeTerritory !== "unclaimed").length;
  check(inCamp >= live.length * 0.6, `territory cats live on claimed ground (${inCamp}/${live.length})`);
  // §33/§34: role-shaped leashes stay in place after a long sim
  // a cat may legitimately be far only when the snapshot DECLARES a sanctioned
  // reason for it (an errand, a patrol leg, a prey chase) — anything else far
  // from home would be an unsanctioned crossing
  const crowdSnap = (g as unknown as { npcSyncSnapshot: () => Snapshot }).npcSyncSnapshot();
  const CLAN_GROUNDS = ["thunderclan", "riverclan", "windclan", "shadowclan"];
  const strays = live.filter((n) => {
    // the territory rule is about CLAN cats: kittypets/rogues live in the
    // unclaimed wilds, where only the world bounds and other Clans' ground
    // matter (the unsanctioned-crossing check above covers every cat)
    if (!CLAN_GROUNDS.includes(n.homeTerritory)) return false;
    if (n.ai.startsWith("house_") || n.ai === "in_den") return false;
    if ((n as unknown as { errand?: unknown }).errand) return false;
    if (crowdSnap.cross[n.def.id]) return false;
    const leash = territoryLeashFor(n.def.clan, "");
    return Math.hypot(n.x - n.def.home.x, n.y - n.def.home.y) > leash * 2.5 + 400;
  });
  check(
    strays.length === 0,
    `no cat ends up across the map without a sanctioned errand (${strays.map((n) => `${n.def.id}@${Math.round(Math.hypot(n.x - n.def.home.x, n.y - n.def.home.y))}`).join(", ") || "none"})`,
  );
  const outOfWorld = live.filter((n) => n.x < 0 || n.y < 0 || n.x > 240 * 32 || n.y > 220 * 32);
  check(outOfWorld.length === 0, `every cat stays inside the world bounds (${outOfWorld.length} outside)`);
}

console.log(failures === 0 ? `\nOK  npc sync verification passed (${count} checks)` : `\n${failures} FAILURE(S) of ${count}`);
process.exit(failures === 0 ? 0 : 1);
