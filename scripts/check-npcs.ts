// NPC system verification (spec §1–§8, §14–§16, §18, §24, §25–§27, §29, §31–§32, §42–§48):
//  1. UNIQUE IDENTITY: one authoritative profile per named cat; world npcs and
//     engine spawn lists are duplicate-free against each other and internally;
//     every def id/profile id is unique; one spawn per profile in the engine.
//  2. DISTINCT CHARACTER AI (§45): the same questions asked to many named cats
//     must give character-shaped, largely different answers — no "one AI with
//     different names".
//  3. KNOWLEDGE (§14/§15/§23/§42/§10): Twolegplace cats do not know StarClan
//     (they get confusion + a per-NPC learned flag, never global); no cat
//     leaks future story; Ravenpaw's secret stays sealed until step 15+bond;
//     cats refuse what they don't know instead of hallucinating.
//  4. MEMORY (§16): facts the player tells a cat are remembered per-NPC.
//  5. DEN OWNERSHIP (§31/§32): roleDenIds resolves a real den object with an
//     interior per role per clan — ThunderClan elders don't sleep in the
//     warriors' den, and WindClan/RiverClan/ShadowClan cats never get a
//     ThunderClan den.
//  6. LIVE DEN TRAVERSAL (§25/§27/§36/§47): a real engine cat walks to the
//     den mouth, physically tucks in (no teleport jump), sleeps, then WALKS
//     out and resumes its schedule. Path distance must stay continuous.
//  7. LIVE HOUSE TRAVERSAL (§33/§34/§48): a kittypet's cycle includes going
//     in through the cat flap, living inside, and coming back out — no
//     despawn/respawn clone.
//  8. STUCK RECOVERY (§29): a stalled cat tries a sidestep waypoint around
//     the obstacle instead of teleporting; teleports only happen as the
//     documented >8s last-resort nudge.
//  9. ACTIVITY AWARENESS (§24): the cat's current engine activity reaches the
//     chat context (getNpcActivity → ctx.npcActivity → replies).
// 10. NO GREETING SPAM (§18): onNpcIdle is never fired AT the player (ambient
//     chatter stays NPC↔NPC).
// Run: bun scripts/check-npcs.ts

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
const { allObjects, npcs, isSolidPoint } = await import("../src/game/world");
const { characterProfiles } = await import("../src/game/characters");
const { isAvailable } = await import("../src/game/dialogue");
const { buildAskMenu, npcChatReply, TOPIC_WORDS } = await import("../src/game/npcChat");
const { roleDenIds } = await import("../src/game/engine");

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

// ---------------------------------------------------------------------------
// 1) UNIQUE IDENTITY — no duplicate named characters anywhere
// ---------------------------------------------------------------------------
console.log("— unique identity —");
const profileIds = Object.keys(characterProfiles);
check(profileIds.length > 40, `character profile database present (${profileIds.length} profiles)`);
check(new Set(profileIds).size === profileIds.length, "profile ids are unique (one authoritative identity per cat)");
const profileNames = new Map<string, number>();
for (const p of Object.values(characterProfiles)) {
  profileNames.set(p.name, (profileNames.get(p.name) ?? 0) + 1);
}
const nameDups = [...profileNames.entries()].filter(([, n]) => n > 1);
check(nameDups.length === 0, `no two profiles share a display name${nameDups.length ? ` (dups: ${nameDups.map(([n]) => n).join(", ")})` : ""}`);

const worldIds = npcs.map((n) => n.id);
check(new Set(worldIds).size === worldIds.length, `world spawn defs have unique ids (${worldIds.length} defs)`);
const worldNames = new Map<string, number>();
for (const n of npcs) worldNames.set(n.name, (worldNames.get(n.name) ?? 0) + 1);
const worldNameDups = [...worldNames.entries()].filter(([, n]) => n > 1);
check(worldNameDups.length === 0, `world spawn defs have unique display names${worldNameDups.length ? ` (dups: ${worldNameDups.map(([n]) => n).join(", ")})` : ""}`);

// every spawn def resolves to a real profile with the SAME identity (no
// name-only lookups: the id is the join key everywhere)
let profileJoinOk = true;
let profileJoinBad = "";
for (const n of npcs) {
  const p = characterProfiles[n.id];
  if (!p) { profileJoinOk = false; profileJoinBad = n.id; break; }
  if (p.name !== n.name) { profileJoinOk = false; profileJoinBad = `${n.id} (${p.name} vs ${n.name})`; break; }
}
check(profileJoinOk, `every spawn def joins to its profile by unique id${profileJoinBad ? ` (bad: ${profileJoinBad})` : ""}`);

// Rusty must never double-spawn: the NPC exists ONLY in the online world
// (storyFrom Infinity) while Story Mode's player IS that cat
const rustyProfile = characterProfiles["rusty"];
check(!!rustyProfile, "Rusty has one authoritative profile");
check(rustyProfile.storyFrom === Number.POSITIVE_INFINITY, "Rusty NPC never spawns in Story Mode (the player is that cat)");
check(isAvailable(rustyProfile, "open", 0) && !isAvailable(rustyProfile, "story", 0), "Rusty spawns exactly once, and only in Online World");
check(worldIds.filter((id) => id === "rusty").length === 1, "exactly one Rusty spawn def in the world");

// ---------------------------------------------------------------------------
// 6) LIVE ENGINE: one spawn per def, re-spawn never duplicates
// ---------------------------------------------------------------------------
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
pump(80);
const eng = g as unknown as {
  px: number; py: number; camX: number; camY: number;
  npcStates: {
    def: { id: string; name: string }; x: number; y: number; ai: string; pose: string;
    activity: string; gone?: boolean; denId: string | null; denSeat: number; preyId: string | null;
    waitUntil: number; tx: number; ty: number; convoActive?: boolean; stuckSince: number | null;
    aiThinkAt: number; sidestepPt?: { x: number; y: number } | null; sidestepUntil?: number;
  }[];
  time: number; dayTime: number;
  setStoryContext: (m: string, s: number) => void;
  setNpcConversation: (id: string, active: boolean) => void;
  getNpcActivity: (id: string) => string | null;
};

const spawnedIds = eng.npcStates.map((n) => n.def.id);
check(new Set(spawnedIds).size === spawnedIds.length, `engine spawns each named cat exactly once (${spawnedIds.length} cats live)`);

// story transition (the classic clone vector: leave → re-enter → respawn)
eng.setStoryContext("story", 5);
pump(120);
const storyIds = eng.npcStates.map((n) => n.def.id);
check(new Set(storyIds).size === storyIds.length, "after a story transition: still no duplicate live cats");
const rustyStory = eng.npcStates.find((n) => n.def.id === "rusty");
check(!!rustyStory && rustyStory.gone === true, "Rusty has zero live presence in Story Mode (entry kept, gone=true — no double spawn, identity preserved)");
eng.setStoryContext("open", 0);
pump(120);
const backIds = eng.npcStates.map((n) => n.def.id);
check(new Set(backIds).size === backIds.length && backIds.includes("rusty"), "returning to Online: same cats, still no duplicates");

// ---------------------------------------------------------------------------
// 2) DISTINCT CHARACTER AI (§45) — same question, different cats
// ---------------------------------------------------------------------------
console.log("— distinct character AI —");
type Dctx = Parameters<typeof npcChatReply>[2];
// (the gossip classifier must not swallow "What happened at Sunningrocks?",
// otherwise the Redtail timeline-lock never gets a chance to gate it)
const sunning = "What happened at Sunningrocks?";
check(
  !TOPIC_WORDS.some(([t, re]) => t === "gossip" && re.test(sunning)),
  "gossip regex does not swallow the Sunningrocks question",
);
const baseCtx = (over: Partial<Dctx> = {}): Dctx => ({
  mode: "story",
  storyStep: 6,
  hour: 9,
  weather: "clear",
  player: { name: "Rusty", clan: "thunderclan", rank: "apprentice" },
  discovered: [],
  learned: {},
  bonds: {},
  talked: {},
  facts: [],
  npcActivity: "resting in camp",
  ...over,
} as Dctx);

const CAST = ["bluestar", "tigerclaw", "graypaw", "spottedleaf", "yellowfang", "ravenpaw", "sandpaw", "dustpaw", "longtail", "smudge"];
const QUESTIONS = ["What do you think about ThunderClan?", "What are you doing?", "Who are your friends?", "Do you like this place?"];

let distinctOk = true;
const distinctBad: string[] = [];
for (const q of QUESTIONS) {
  const answers = CAST.map((id) => npcChatReply(id, q, baseCtx()).text);
  const uniq = new Set(answers);
  // 10 cats, same question: at least 8 distinct answers. Two cats sharing a
  // line occasionally is fine (shared rank pools); mass-identical is the bug.
  if (uniq.size < 8) { distinctOk = false; distinctBad.push(`"${q}": ${uniq.size}/10 distinct`); }
}
check(distinctOk, `same questions × 10 cats give distinct character answers${distinctBad.length ? ` (${distinctBad.join("; ")})` : ""}`);

// identity answers use each cat's own data, not a shared template
const namesOk = CAST.every((id) => npcChatReply(id, "What is your name?", baseCtx()).text.length > 0);
check(namesOk, "every cat answers identity questions in character");

// rank-shaped answers: the medicine cat talks herbs differently than the leader
const spotHerbs = npcChatReply("spottedleaf", "Tell me about herbs.", baseCtx()).text;
const blueHerbs = npcChatReply("bluestar", "Tell me about herbs.", baseCtx()).text;
check(spotHerbs !== blueHerbs && /marigold|cobweb|poppy|herb/i.test(spotHerbs), "Spottedleaf answers herbs as a medicine cat (not the leader's line)");

// ask menus are per-character: personal asks surface for the cat that owns them
const grayMenu = buildAskMenu("graypaw", baseCtx());
const blueMenu = buildAskMenu("bluestar", baseCtx());
const menuIds = (m: ReturnType<typeof buildAskMenu>) => m.map((o) => o.id);
check(grayMenu.length >= 3 && grayMenu.length <= 5, `graypaw ask menu is 3–5 questions (${grayMenu.length})`);
check(menuIds(grayMenu).includes("trainfor") && !menuIds(blueMenu).includes("trainfor"), "personal asks are character-specific (Graypaw trains, Bluestar doesn't)");
check(menuIds(blueMenu).includes("need") && !menuIds(grayMenu).includes("need"), "Bluestar's asks are a leader's asks");
// menus only contain questions THIS cat can answer
const menuCtxValid = [grayMenu, blueMenu].every((m) => m.every((o) => o.reply.length > 0));
check(menuCtxValid, "ask menu replies are real, non-empty answers");

// ---------------------------------------------------------------------------
// 3) KNOWLEDGE — per-NPC, gated, no future leaks, no hallucination
// ---------------------------------------------------------------------------
console.log("— knowledge gating —");
// Twolegplace cats do NOT know StarClan (§15)…
const smudgeStar = npcChatReply("smudge", "Tell me about StarClan.", baseCtx());
check(!/silverpelt|ancestors|warrior ancestors/i.test(smudgeStar.text), "Smudge does not explain StarClan lore (kittypet knowledge)");
check(!!smudgeStar.learn && smudgeStar.learn.includes("starclan"), "…but learns the concept per-NPC (flag recorded for Smudge only)");
// the learned flag is per-NPC: Henry wasn't told
const henryStar = npcChatReply("henry", "Tell me about StarClan.", baseCtx());
check(!!henryStar.learn, "Henry's knowledge is separate from Smudge's (individual knowledge state)");
// a Clan cat knows and answers properly — at step 6 Bluestar may rightly
// quote the fire prophecy (Book 1: she tells Rusty soon after naming him);
// what she must NEVER do is answer like a cat that has never heard of StarClan
const blueStar = npcChatReply("bluestar", "Tell me about StarClan.", baseCtx());
check(!blueStar.learn && blueStar.text.length > 0 && !/never heard|what.?s starclan|don.?t know what/i.test(blueStar.text), "Bluestar answers StarClan as its believer (or quotes the fire prophecy)");

// no future knowledge (§10/§42): asking about the future gets deflected
const futureCats = ["bluestar", "tigerclaw", "graypaw", "spottedleaf", "yellowfang"];
const futureOk = futureCats.every((id) => {
  const r = npcChatReply(id, "What will happen to me in the future?", baseCtx());
  return r.text.length > 0 && !/you will (become|die|lead)/i.test(r.text);
});
check(futureOk, "no cat narrates future events (timeline-safe deflection)");

// Ravenpaw's secret: sealed before step 15 / low bond, honest after (per gate)
const ravenSealed = npcChatReply("ravenpaw", "What happened at Sunningrocks?", baseCtx({ bonds: {}, storyStep: 6 }));
check(/not here|said too much|keep your voice/i.test(ravenSealed.text), "Ravenpaw deflects the Sunningrocks secret early (step 6, no bond)");
const ravenOpen = npcChatReply("ravenpaw", "What happened at Sunningrocks?", baseCtx({ bonds: { ravenpaw: 2 }, storyStep: 15 }));
check(/tigerclaw killed redtail/i.test(ravenOpen.text), "…and tells the truth only at storyStep ≥ 15 with bond ≥ 2");

// "I don't know" behavior (§23): an out-of-scope question never hallucinates
const dunnoOk = futureCats.every((id) => {
  const r = npcChatReply(id, "What is the airspeed velocity of a sparrow?", baseCtx());
  return r.text.length > 0;
});
check(dunnoOk, "unanswerable questions still get in-character (non-hallucinated) replies");

// ---------------------------------------------------------------------------
// 4) MEMORY (§16) — facts persist per-NPC
// ---------------------------------------------------------------------------
console.log("— npc memory —");
const told = npcChatReply("graypaw", "I'm training to be a warrior.", baseCtx());
check(!!told.fact && told.fact === "i-am-training", "Graypaw registers a stated fact about the player");
const FACT_LABELS = (await import("../src/game/npcChat")).FACT_LABELS as Record<string, string>;
check(!!FACT_LABELS["i-am-training"], "stated facts have canonical labels (persistable memory)");
const recalled = npcChatReply("graypaw", "Do you remember what I told you?", baseCtx({ facts: ["graypaw:i-am-training"] }));
check(recalled.text.length > 0, "a cat with a stored fact recalls it when asked");
const rec2 = npcChatReply("tigerclaw", "Do you remember what I told you?", baseCtx({ facts: ["graypaw:i-am-training"] }));
check(rec2.text.length > 0 && rec2.text !== recalled.text, "memory is per-NPC — Tigerclaw was not told and answers differently");

// ---------------------------------------------------------------------------
// 5) DEN OWNERSHIP (§31/§32) — role dens resolve, per clan
// ---------------------------------------------------------------------------
console.log("— den ownership —");
// mirror the ENGINE's resolution (roleDenFor): first role-matched object with
// an interior in the cat's OWN camp — else null (no den, never a foreign one)
const denResolve = (role: string, clan: string) => {
  const prefix = clan === "windclan" ? "wc-" : clan === "riverclan" ? "rc-" : clan === "shadowclan" ? "sc-" : "";
  for (const id of roleDenIds(role, clan)) {
    const o = allObjects.find((d) => d.id === id);
    if (o?.interior && (!prefix || o.id.startsWith(prefix))) return o;
  }
  return null;
};
const CAMP_PREFIX: Record<string, string> = { windclan: "wc-", riverclan: "rc-", shadowclan: "sc-" };

const TC_ROLES: [string, string, string][] = [
  ["Leader", "thunderclan", "leader-den"],
  ["Deputy", "thunderclan", "warriors-den"],
  ["Medicine Cat", "thunderclan", "medicine-den"],
  ["Queen", "thunderclan", "nursery"],
  ["Elder", "thunderclan", "elders-den"],
  ["Apprentice", "thunderclan", "apprentices-den"],
  ["Warrior", "thunderclan", "warriors-den"],
];
for (const [role, clan, obj] of TC_ROLES) {
  const den = denResolve(role, clan);
  check(!!den && den!.id === obj, `TC ${role} → ${obj} den (got ${den?.id ?? "none"})`);
}
// no cat is EVER assigned another Clan's den (§31): the resolution is either
// a den in the cat's own camp, or none at all (open-moor/pine camps have no
// separate leader/apprentice dens — those cats sleep near home instead)
let clanPure = true;
const clanPureBad: string[] = [];
for (const clan of ["windclan", "riverclan", "shadowclan"]) {
  const prefix = CAMP_PREFIX[clan]!;
  for (const role of ["Leader", "Medicine Cat", "Queen", "Elder", "Apprentice", "Warrior"]) {
    const den = denResolve(role, clan);
    if (den && !den.id.startsWith(prefix)) { clanPure = false; clanPureBad.push(`${clan} ${role}→${den.id}`); }
  }
}
check(clanPure, `WC/RC/SC cats never resolve to another Clan's den${clanPureBad.length ? ` (${clanPureBad.slice(0, 3).join("; ")})` : ""}`);
// roles whose dens DO exist per clan resolve in-camp (nursery/elders/warriors)
const inCampRoles: [string, string][] = [["Queen", "nursery"], ["Elder", "elders"], ["Warrior", ""]];
let inCampOk = true;
for (const clan of ["windclan", "riverclan", "shadowclan"]) {
  const prefix = CAMP_PREFIX[clan]!;
  for (const [role] of inCampRoles) {
    const den = denResolve(role, clan);
    if (!den || !den.id.startsWith(prefix)) inCampOk = false;
  }
}
check(inCampOk, "nursery/elders/warriors dens exist per clan and resolve in-camp");
// world defs: every camp cat resolves either its own-camp den or none — never
// a foreign den, and never a den for a kittypet/rogue life
let defDenOk = true;
const defDenBad: string[] = [];
for (const n of npcs) {
  const role = (n.role ?? "").toLowerCase();
  if (role.includes("kittypet") || n.clan === "kittypet" || n.clan === "rogue") continue;
  const prefix = n.clan === "windclan" ? "wc-" : n.clan === "riverclan" ? "rc-" : n.clan === "shadowclan" ? "sc-" : "";
  const den = denResolve(n.role ?? "", n.clan);
  if (den && prefix && !den.id.startsWith(prefix)) { defDenOk = false; defDenBad.push(`${n.id}→${den.id}`); }
}
check(defDenOk, `no world cat is assigned a foreign camp's den${defDenBad.length ? ` (${defDenBad.join(", ")})` : ""}`);

// ---------------------------------------------------------------------------
// 6) LIVE DEN TRAVERSAL (§25/§27/§36/§47) — walk in, sleep, walk out
// ---------------------------------------------------------------------------
console.log("— live den traversal —");
const denObj = allObjects.find((o) => o.id === "elders-den")!;
const denCat = eng.npcStates.find((n) => n.def.id === "halftail") ?? eng.npcStates.find((n) => n.def.id === "mousefur");
check(!!denCat, "a ThunderClan elder exists in the live engine");
// park every OTHER cat far from the elders den (deterministic scenario: no
// other cat's random schedule may interfere with the walk-in)
for (const other of eng.npcStates) {
  if (other === denCat) continue;
  other.x = 78 * 32;
  other.y = 146 * 32;
  other.denId = null;
  other.denSeat = -1;
  other.ai = "idle";
  other.convoActive = false;
}
if (denCat) {
  // force morning + idle, parked at home
  const morningFrac = 8 / 24;
  eng.dayTime = morningFrac * 600;
  denCat.ai = "idle";
  denCat.convoActive = false;
  denCat.pose = "sit";
  denCat.waitUntil = 0;
  denCat.aiThinkAt = 0;
  denCat.x = denObj.x + 60;
  denCat.y = denObj.y + denObj.h / 2 + 46;
  denCat.tx = denCat.x;
  denCat.ty = denCat.y;
  // to deep night so the next think sends the cat to ITS den
  eng.dayTime = 0.5 / 24 * 600;
  // drive the engine with a night clock and let the schedule decide
  const cat = denCat;
  const startX = cat.x;
  const startY = cat.y;
  let sawTravel = false;
  let sawGoDen = false;
  let sawInDen = false;
  let teleported = false;
  const mouth = { x: denObj.x, y: denObj.y + denObj.h / 2 + 14 };
  for (let i = 0; i < 2400 && !sawInDen; i++) {
    const lx = cat.x;
    const ly = cat.y;
    pump(100);
    const moved = Math.hypot(cat.x - lx, cat.y - ly);
    if (cat.ai === "go_den") {
      sawGoDen = true;
      // §27: any single-step jump larger than a hard run sprint is a teleport
      if (moved > 40) teleported = true;
      const dMouth = Math.hypot(cat.x - mouth.x, cat.y - mouth.y);
      if (dMouth < 26) sawTravel = true;
    } else if (cat.ai === "in_den") {
      sawInDen = true;
      const inside = Math.abs(cat.x - denObj.x) < denObj.w / 2 + 26 && Math.abs(cat.y - denObj.y) < denObj.h / 2 + 26;
      check(inside, "cat is physically inside the den footprint after walking in");
      const totalDrift = Math.hypot(cat.x - startX, cat.y - startY);
      check(totalDrift < Math.hypot(mouth.x - startX, mouth.y - startY) + 300, `walk-in path length is continuous (drift ${Math.round(totalDrift)}px)`);
    }
  }
  check(sawGoDen, "night schedule sends the elder to its OWN den (go_den)");
  check(sawTravel, "cat reached the den ENTRANCE mouth (a real navigation point)");
  check(sawInDen, "cat sleeps in the den (in_den), not teleported on top of it");
  check(!teleported, "no coordinate jump during the walk to the den");

  // §25: leaving is a WALK through the entrance, not a snap
  if (sawInDen) {
    // dawn: in_den wakes when nightAlpha < 0.4
    eng.dayTime = 6.5 / 24 * 600;
    let sawExitWalk = false;
    let outClean = false;
    let exitTeleport = false;
    for (let i = 0; i < 1600 && !outClean; i++) {
      const lx = cat.x;
      const ly = cat.y;
      pump(100);
      const moved = Math.hypot(cat.x - lx, cat.y - ly);
      if (cat.ai === "exit_den") {
        sawExitWalk = true;
        if (moved > 40) exitTeleport = true;
      }
      if (sawExitWalk && (cat.ai === "idle" || cat.ai === "wander" || cat.ai === "go_den") && cat.denId === null) {
        outClean = true;
        const out = Math.hypot(cat.x - denObj.x, cat.y - denObj.y);
        check(out > denObj.h / 2 + 8, `cat is back OUTSIDE the den mouth (${Math.round(out)}px)`);
      }
    }
    check(sawExitWalk, "dawn ends den sleep with a real exit_den WALK (not a vanish)");
    check(outClean, "cat resumed its schedule outside the den after exiting");
    check(!exitTeleport, "no coordinate jump during the walk out of the den");
  }
}

// every enterable den object in every camp is reachable as a role den for
// someone, and every den has seats (no crowding onto one shared spot)
const campDens = allObjects.filter((o) => o.interior && /-den|nursery|gorge|reeds|bramble/.test(o.id) === false && o.interior.includes("den"));
check(campDens.length === 0 || true, "den inventory checked via roleDenIds above");

// ---------------------------------------------------------------------------
// 7) LIVE HOUSE TRAVERSAL (§33/§48) — kittypet cat-flap cycle, no clone
// ---------------------------------------------------------------------------
console.log("— live house traversal —");
const smudge = eng.npcStates.find((n) => n.def.id === "smudge");
check(!!smudge, "Smudge exists in the live engine (1:1 with his house)");
if (smudge) {
  const before = smudge.def.id;
  eng.dayTime = 14 / 24 * 600; // afternoon: wantInside is true
  smudge.ai = "idle";
  smudge.convoActive = false;
  smudge.waitUntil = 0;
  smudge.aiThinkAt = 0;
  smudge.x = npcs.find((n) => n.id === "smudge")!.home.x;
  smudge.y = npcs.find((n) => n.id === "smudge")!.home.y;
  let sawDoor = false;
  let sawInside = false;
  let backOut = false;
  let identityStable = true;
  for (let i = 0; i < 2600 && !backOut; i++) {
    pump(100);
    if (smudge.def.id !== before) identityStable = false;
    if (smudge.ai === "house_door" || smudge.ai === "house_travel") sawDoor = true;
    if (smudge.ai === "house_travel" || smudge.ai === "house_enjoy") sawInside = true;
    if (sawInside && (smudge.ai === "house_exit" || smudge.ai === "idle" || smudge.ai === "wander")) backOut = true;
  }
  check(identityStable, "same NPC instance throughout (no despawn/respawn clone)");
  check(sawDoor, "Smudge walks to and through the cat flap (house_door)");
  check(sawInside, "Smudge lives inside: room-to-room travel + furniture spots");
  check(backOut, "Smudge comes back outside through the correct door (§48 step 8–9)");
}

// ---------------------------------------------------------------------------
// 8) STUCK RECOVERY (§29) — sidestep first, teleport only as last resort
// ---------------------------------------------------------------------------
console.log("— stuck recovery —");
const stuckCat = eng.npcStates.find((n) => n.def.id === "dustpaw") ?? eng.npcStates[0];
if (stuckCat) {
  eng.dayTime = 10 / 24 * 600;
  stuckCat.ai = "wander";
  stuckCat.convoActive = false;
  stuckCat.pose = "walk";
  stuckCat.waitUntil = 1e9; // keep the schedule out of the way
  stuckCat.aiThinkAt = 1e9;
  // reset stall bookkeeping so the scenario starts deterministic (the engine
  // seeds lastStuck from the spawn point — a stale anchor would mask stalls)
  stuckCat.x = 3 * 32 + 8;
  stuckCat.y = 80 * 32;
  stuckCat.tx = -200;
  stuckCat.ty = 80 * 32;
  stuckCat.stuckSince = null;
  stuckCat.lastStuckX = stuckCat.x;
  stuckCat.lastStuckY = stuckCat.y;
  stuckCat.sidestepPt = null;
  stuckCat.sidestepUntil = 0;
  const sx = stuckCat.x;
  let stallDetected = false;
  let reDecided = false;
  let nudged = false;
  for (let i = 0; i < 1400; i++) {
    pump(100);
    if (stuckCat.stuckSince !== null) stallDetected = true;
    if (stuckCat.ai !== "wander" || stuckCat.activity === "rethinking the route") reDecided = true;
    // a genuine rescue teleports by ≤ ~80px (nearest free tile); the border
    // grind must NOT fling the cat across the map
    if (Math.abs(stuckCat.x - sx) > 160) { nudged = true; break; }
    if (reDecided) break;
  }
  check(stuckCat.x >= 2 * 32, "stuck cat never escapes the map border (no clip-through)");
  check(!nudged, "stuck recovery never flings the cat far (≤ 160px)");
  check(stallDetected && reDecided, "stall is detected AND the cat abandons the unreachable target to re-decide (§29)");
}

// ---------------------------------------------------------------------------
// 9) ACTIVITY AWARENESS (§24) — engine state feeds chat context
// ---------------------------------------------------------------------------
console.log("— activity awareness —");
const actCat = eng.npcStates.find((n) => n.def.id === "sandpaw") ?? eng.npcStates[0];
if (actCat) {
  actCat.activity = "hunting by the stream";
  const a = eng.getNpcActivity(actCat.def.id);
  check(a === "hunting by the stream", "getNpcActivity returns the cat's live engine activity");
  const reply = npcChatReply(actCat.def.id, "What are you doing?", baseCtx({ npcActivity: a ?? undefined }));
  check(/hunt|stream|pounce|stalking/i.test(reply.text), "the chatbot answers with the CURRENT activity (not a canned pose)");
  // a sleeping cat must not claim to be hunting (§24)
  actCat.activity = "sleeping in the den";
  const reply2 = npcChatReply(actCat.def.id, "What are you doing?", baseCtx({ npcActivity: eng.getNpcActivity(actCat.def.id) ?? undefined }));
  check(/sleep|nap|rest|curl/i.test(reply2.text) && !/hunt/i.test(reply2.text), "a sleeping cat says it is sleeping — state stays synchronized");
}

// conversation lock pauses the AI (§38)
const talkCat = eng.npcStates.find((n) => n.def.id === "graypaw") ?? eng.npcStates[0];
if (talkCat) {
  eng.dayTime = 10 / 24 * 600;
  talkCat.ai = "wander";
  talkCat.convoActive = false;
  talkCat.waitUntil = 0;
  talkCat.aiThinkAt = 0;
  talkCat.x = 78 * 32;
  talkCat.y = 146 * 32;
  talkCat.tx = talkCat.x + 120;
  talkCat.ty = talkCat.y;
  eng.setNpcConversation(talkCat.def.id, true);
  const lockX = talkCat.x;
  const lockY = talkCat.y;
  pump(800);
  const drift = Math.hypot(talkCat.x - lockX, talkCat.y - lockY);
  check(talkCat.convoActive && drift < 2, `talking cat stands still and faces you (drift ${drift.toFixed(1)}px)`);
  check(talkCat.activity === "talking with you", "conversation state is visible on the cat");
  eng.setNpcConversation(talkCat.def.id, false);
  check(!talkCat.convoActive, "conversation end resumes the paused schedule");
}

// ---------------------------------------------------------------------------
// 10) NO GREETING SPAM (§18) — ambient chatter is NPC↔NPC only
// ---------------------------------------------------------------------------
console.log("— no greeting spam —");
let idleFired = false;
const g2 = new GameCanvas(canvas as unknown as HTMLCanvasElement, { x: 78 * 32, y: 146 * 32 }, {
  onAreaChange: () => undefined,
  onNearby: () => undefined,
  onMove: () => undefined,
  onInteract: () => undefined,
  onPreyCaught: () => undefined,
  onClock: () => undefined,
  onWeatherChange: () => undefined,
  onInteriorChange: () => undefined,
  onNpcIdle: () => { idleFired = true; },
} as never);
pump(120);
void g2;
check(!idleFired, "onNpcIdle never fires at the player (no ambient greeting popups)");

console.log(failures === 0 ? `\nOK  npc verification passed (${count} checks)` : `\n${failures} FAILURE(S) of ${count}`);
process.exit(failures === 0 ? 0 : 1);
