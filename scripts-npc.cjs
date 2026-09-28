// NPC life upgrade + SFX reliability + shake sync (corrected anchors).
const fs = require("fs");
const R = String.raw;

// ================= audio.ts (the AudioEngine lives here) =================
let a = fs.readFileSync("src/game/audio.ts", "utf8");
const audioEdits = [
  [
    R`  playSfx(name: SfxName, opts: { volume?: number; rate?: number; throttleMs?: number } = {}) {
    if (!this.started || this.settings.muteSfx || this.settings.sfx <= 0.001 || this.settings.master <= 0.001) return;`,
    R`  playSfx(name: SfxName, opts: { volume?: number; rate?: number; throttleMs?: number } = {}) {
    if (!this.started || this.settings.muteSfx || this.settings.sfx <= 0.001 || this.settings.master <= 0.001) return;
    // a suspended context would silently eat every one-shot; nudge it awake
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();`,
  ],
  [
    R`    const buf = this.getBuffer(name);
    if (!buf) return;
    if (this.ctx && this.sfxGain) {
      if (buf === "loading" || buf === "failed") return;`,
    R`    const buf = this.getBuffer(name);
    if (buf === "failed") return;
    if (this.ctx && this.sfxGain) {
      if (buf === "loading" || buf === null) return;`,
  ],
  [
    R`  private getBuffer(name: SfxName): AudioBuffer | "loading" | "failed" | null {
    const url = BASE + SFX_FILES[name];
    if (!this.ctx) return null;
    const cached = this.buffers.get(url);
    if (cached) return cached;
    this.loadBufferUrl(url);
    return "loading";
  }`,
    R`  private getBuffer(name: SfxName): AudioBuffer | "loading" | "failed" | null {
    const url = BASE + SFX_FILES[name];
    const cached = this.buffers.get(url);
    if (cached) return cached;
    // kick off the fetch even without a ctx: the AudioContext can appear
    // later (first user gesture) and the buffer will already be warm
    this.loadBufferUrl(url);
    return "loading";
  }`,
  ],
  [
    R`    if (cached === "failed") { onReady?.(null); return; }
    if (!this.ctx) { onReady?.(null); return; }`,
    R`    if (cached === "failed") { onReady?.(null); return; }
    if (this.ctx === null) { this.buffers.set(url, "failed"); onReady?.(null); return; }`,
  ],
];
let afail = 0;
for (const [o, n] of audioEdits) {
  const c = a.split(o).length - 1;
  if (c !== 1) { console.error("AUDIO MISS(" + c + "): " + JSON.stringify(o.slice(0, 60))); afail++; }
}
if (afail) process.exit(1);
for (const [o, n] of audioEdits) a = a.split(o).join(n);
fs.writeFileSync("src/game/audio.ts", a);
console.log("audio reliability OK");

// ================= engine.ts =================
let s = fs.readFileSync("src/game/engine.ts", "utf8");

const engineEdits = [
  // personality-bearing NPC state
  [
    R`interface NPCState {
  def: NPCDef;
  x: number;
  y: number;
  tx: number;
  ty: number;
  facing: 1 | -1;
  pose: CatPose;
  waitUntil: number;
  phase: number;
  lastScheduleHour: number;
}`,
    R`type NpcAiMode =
  | "idle" | "wander" | "patrol" | "hunt_stalk" | "hunt_chase"
  | "carry_home" | "deliver" | "return_home";

interface NPCState {
  def: NPCDef;
  x: number;
  y: number;
  tx: number;
  ty: number;
  facing: 1 | -1;
  pose: CatPose;
  waitUntil: number;
  phase: number;
  lastScheduleHour: number;
  // --- lightweight personality + life sim (behavior modifiers, not a new AI) ---
  trait: "brave" | "cautious" | "curious" | "social" | "quiet" | "playful" | "lazy";
  activity: string; // human-readable current activity
  ai: NpcAiMode;
  preyId: string | null; // hunted prey being carried home
  patrolPoints: { x: number; y: number }[];
  patrolIdx: number;
  aiThinkAt: number; // engine-time of the next decision tick
  mewAt: number; // last ambient vocalization (performance.now ms)
}`,
  ],

  // constructor gains personality fields (anchor WITHOUT tx/ty)
  [
    R`    this.npcStates = npcs.map((n) => ({
      def: n,
      x: n.home.x,
      y: n.home.y,
      facing: Math.random() > 0.5 ? 1 : -1,
      pose: "sit" as CatPose,
      waitUntil: Math.random() * 4,
      phase: Math.random() * Math.PI * 2,
      lastScheduleHour: -1,
    }));`,
    R`    const TRAITS: NPCState["trait"][] = ["brave", "cautious", "curious", "social", "quiet", "playful", "lazy"];
    this.npcStates = npcs.map((n) => ({
      def: n,
      x: n.home.x,
      y: n.home.y,
      tx: n.home.x,
      ty: n.home.y,
      facing: Math.random() > 0.5 ? 1 : -1,
      pose: "sit" as CatPose,
      waitUntil: Math.random() * 4,
      phase: Math.random() * Math.PI * 2,
      lastScheduleHour: -1,
      // deterministic personality from the cat's id
      trait: TRAITS[(n.id.charCodeAt(0) + n.id.length) % TRAITS.length],
      activity: "settling in",
      ai: "idle" as NpcAiMode,
      preyId: null,
      patrolPoints: [],
      patrolIdx: 0,
      aiThinkAt: Math.random() * 4,
      mewAt: 0,
    }));`,
  ],

  // the core: replace the schedule-only loop with the AI brain
  [
    R`    // --- NPC schedules + movement ---
    for (const n of this.npcStates) {
      const target = scheduleTarget(n.def, hr);
      if (target && hr !== n.lastScheduleHour) {
        n.tx = target.x;
        n.ty = target.y;
        n.lastScheduleHour = hr;
      }
      const dist = Math.hypot(n.tx - n.x, n.ty - n.y);
      if (n.pose !== "walk" && this.time > n.waitUntil) n.pose = "walk";
      if (n.pose === "walk" && dist > 8) {
        const sp = 46 * dt;
        const ux = (n.tx - n.x) / (dist || 1);
        const uy = (n.ty - n.y) / (dist || 1);
        if (!isSolidPoint(n.x + ux * sp + Math.sign(ux) * 8, n.y)) n.x += ux * sp;
        if (!isSolidPoint(n.x, n.y + uy * sp + Math.sign(uy) * 8)) n.y += uy * sp;
        if (Math.abs(ux) > 0.2) n.facing = ux > 0 ? 1 : -1;
      } else if (n.pose === "walk" && dist <= 8) {
        // arrive: idle
        n.pose = Math.random() < 0.5 ? "sit" : "groom";
        n.waitUntil = this.time + 3 + Math.random() * 5;
      } else if (n.pose !== "walk" && n.def.wander && this.time > n.waitUntil) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 40 + Math.random() * 80;
        const nx = n.def.home.x + Math.cos(ang) * rad;
        const ny = n.def.home.y + Math.sin(ang) * rad;
        if (!isSolidPoint(nx, ny)) {
          n.tx = nx;
          n.ty = ny;
          n.pose = "walk";
        }
      }
      // ambient chatter: an idling cat nearby occasionally speaks
      if (
        this.cb.onNpcIdle &&
        n.pose !== "walk" &&
        !this.paused &&
        Math.random() < 0.0012 &&
        Math.hypot(n.x - this.px, n.y - this.py) < 200
      ) {
        this.cb.onNpcIdle(n.def.name, n.def.lines[Math.floor(Math.random() * n.def.lines.length)]);
      }
    }`,
    R`    // --- NPC life: schedules, personalities, patrols, hunting (throttled
    // decisions; movement integrates every frame along the world map) ---
    for (const n of this.npcStates) {
      // scheduled destinations still apply (dens/night spots) when idle
      const target = scheduleTarget(n.def, hr);
      if (target && hr !== n.lastScheduleHour && n.ai === "idle" && n.def.wander) {
        n.tx = target.x;
        n.ty = target.y;
        n.lastScheduleHour = hr;
        n.ai = "wander";
        n.activity = "heading to a spot";
      }
      // decision tick: distant cats think every ~4s, nearby every ~1.2s
      const dPlayer = Math.hypot(n.x - this.px, n.y - this.py);
      const cadence = dPlayer < 700 ? 1.2 : 4;
      if (!this.paused && !this.dead && this.time >= n.aiThinkAt) {
        n.aiThinkAt = this.time + cadence * (0.8 + Math.random() * 0.5);
        this.npcThink(n, hr, night);
      }
      this.npcAct(n, dt);
      // ambient chatter + rare vocalization for nearby idlers
      if (
        this.cb.onNpcIdle &&
        n.pose !== "walk" &&
        !this.paused &&
        Math.random() < 0.0012 &&
        dPlayer < 200
      ) {
        this.cb.onNpcIdle(n.def.name, n.def.lines[Math.floor(Math.random() * n.def.lines.length)]);
      }
      if (!this.paused && dPlayer < 420 && n.pose !== "sleep" && performance.now() - n.mewAt > 14000 && Math.random() < 0.004) {
        n.mewAt = performance.now();
        this.engineSfx("mew", { volume: dPlayer < 200 ? 0.5 : 0.3, throttleMs: 900 });
      }
    }`,
  ],

  // fields for the AI (fresh-kill bonus cache)
  [
    R`  /** ambient NPC mew throttle */
  private lastNpcMewAt = 0;`,
    R`  /** ambient NPC mew throttle */
  private lastNpcMewAt = 0;
  /** NPC decision accumulator (AI is ticked in batches, not per-frame) */
  private npcThinkAccum = 0;
  /** cached fresh-kill pile spot (resolved lazily) */
  private campFreshKill: { x: number; y: number } | null = null;
  /** prey deposited by NPC hunters this session (pile grows visually) */
  private campPreyBonus = new Map<string, number>();`,
  ],
];

let fail = 0;
for (const [o, n] of engineEdits) {
  const c = s.split(o).length - 1;
  if (c !== 1) { console.error("ENGINE MISS(" + c + "): " + JSON.stringify(o.slice(0, 70))); fail++; }
}
if (fail) process.exit(1);
for (const [o, n] of engineEdits) s = s.split(o).join(n);

// npcThink + npcAct methods, inserted before stepRemoteRender
const anchor = "  private stepRemoteRender(cur: RemoteRenderState, dt: number, wallMs: number) {";
if (s.split(anchor).length !== 2) { console.error("stepRemoteRender anchor MISS"); process.exit(1); }

const methods = R`
  // =================== NPC life-simulation AI ===================
  // Lightweight: personality modifies probabilities inside ONE state machine.
  // Decisions are throttled (nearby ~1.2s, far ~4s); movement integrates
  // every frame with collision, so no cat ever teleports.

  private freshKillSpot(): { x: number; y: number } | null {
    if (this.campFreshKill) return this.campFreshKill;
    const pile = allObjects.find((o) => o.interact === "fresh-kill");
    if (!pile) return null;
    this.campFreshKill = { x: pile.x, y: pile.y };
    return this.campFreshKill;
  }

  private campEntranceFor(_n: NPCState): { x: number; y: number } {
    // the camp-wall gap is south of camp center; an entrance object marks it
    const entrance = allObjects.find((o) => o.id === "entrance");
    if (entrance) return { x: entrance.x, y: entrance.y + 30 };
    return { x: CAMP_CENTER.x, y: CAMP_CENTER.y + CAMP_RADIUS };
  }

  private npcThink(n: NPCState, _hr: number, night: boolean) {
    if (n.ai !== "idle") return; // mid-activity cats finish first
    if (this.time < n.waitUntil) return;
    const t = n.trait;
    const lazy = t === "lazy" ? 0.5 : 1;
    const outdoor = /warrior|deputy|leader|apprentice|hunter|guard/i.test(n.def.role) || n.def.wander;
    const roll = Math.random();
    // night: sleep much more often
    if (night && roll < 0.55 * lazy) {
      n.ai = "wander";
      n.activity = "curling up to sleep";
      n.tx = n.def.home.x + (Math.random() - 0.5) * 40;
      n.ty = n.def.home.y + (Math.random() - 0.5) * 40;
      return;
    }
    // hunger: seek the fresh-kill pile
    if (roll < 0.16) {
      const pile = this.freshKillSpot();
      if (pile) {
        n.ai = "wander";
        n.activity = "going to eat";
        n.tx = pile.x;
        n.ty = pile.y + 14;
        return;
      }
    }
    // hunt: warriors/apprentices stalk the forest (not in storms)
    if (outdoor && roll < 0.42 && (this.weather === "clear" || this.weather === "cloudy" || this.weather === "wind")) {
      n.ai = "hunt_stalk";
      n.activity = "hunting";
      const ang = Math.random() * Math.PI * 2;
      const rad = 200 + Math.random() * 500;
      n.tx = n.def.home.x + Math.cos(ang) * rad;
      n.ty = n.def.home.y + Math.sin(ang) * rad;
      return;
    }
    // patrol: organize at the entrance, walk territory points
    if (outdoor && roll < 0.58) {
      const e = this.campEntranceFor(n);
      n.ai = "patrol";
      n.activity = "patrolling";
      n.patrolPoints = [
        e,
        { x: n.def.home.x + 260, y: n.def.home.y - 60 },
        { x: n.def.home.x + 420, y: n.def.home.y + 120 },
        { x: n.def.home.x + 200, y: n.def.home.y + 260 },
      ];
      n.patrolIdx = 0;
      n.tx = e.x;
      n.ty = e.y;
      return;
    }
    // camp socializing / idle variety
    const pile = this.freshKillSpot();
    if (t === "social" && pile && roll < 0.8) {
      n.ai = "wander";
      n.activity = "chatting near the pile";
      n.tx = pile.x + (Math.random() - 0.5) * 90;
      n.ty = pile.y + 20 + Math.random() * 30;
      return;
    }
    if (t === "curious" && roll < 0.75) {
      n.ai = "wander";
      n.activity = "exploring camp";
      n.tx = n.def.home.x + (Math.random() - 0.5) * 220;
      n.ty = n.def.home.y + (Math.random() - 0.5) * 160;
      return;
    }
    // default idle flourish (stretch / groom / sit / sniff-look)
    n.pose = (["stretch", "groom", "sit", "sit"] as CatPose[])[Math.floor(Math.random() * 4)];
    n.waitUntil = this.time + 2.5 + Math.random() * 4;
  }

  private npcAct(n: NPCState, dt: number) {
    const arrive = 10;
    const walkSpeed = 46;
    const runSpeed = 120;

    const stepTo = (tx: number, ty: number, sp: number): number => {
      const dist = Math.hypot(tx - n.x, ty - n.y);
      if (dist > 0.5) {
        const ux = (tx - n.x) / dist;
        const uy = (ty - n.y) / dist;
        const step = Math.min(sp * dt, dist);
        if (!isSolidPoint(n.x + ux * step + Math.sign(ux) * 8, n.y)) n.x += ux * step;
        if (!isSolidPoint(n.x, n.y + uy * step + Math.sign(uy) * 8)) n.y += uy * step;
        if (Math.abs(ux) > 0.2) n.facing = ux > 0 ? 1 : -1;
        if (n.pose !== "walk" && n.pose !== "shake" && n.pose !== "crouch") n.pose = "walk";
      }
      return dist;
    };

    switch (n.ai) {
      case "wander": {
        const d = stepTo(n.tx, n.ty, walkSpeed);
        if (d <= arrive) {
          // arrived: sleep at night spots, else idle flourish
          const nightNow = this.nightAlpha() > 0.6;
          n.pose = nightNow && Math.hypot(n.x - n.def.home.x, n.y - n.def.home.y) < 60 ? "sleep" : (["sit", "groom", "stretch"] as CatPose[])[Math.floor(Math.random() * 3)];
          n.ai = "idle";
          n.waitUntil = this.time + 4 + Math.random() * 6;
        }
        break;
      }
      case "patrol": {
        const pt = n.patrolPoints[n.patrolIdx];
        if (!pt) { n.ai = "return_home"; break; }
        const d = stepTo(pt.x, pt.y, walkSpeed);
        if (d <= arrive) {
          n.patrolIdx++;
          if (n.patrolIdx >= n.patrolPoints.length) {
            n.ai = "return_home";
          } else {
            // pause at each point: sniff around, then move on
            n.pose = "sit";
            n.waitUntil = this.time + 1.4 + Math.random() * 1.6;
          }
        }
        break;
      }
      case "hunt_stalk": {
        // approach the haunt crouched; scan for live prey nearby
        if (n.pose !== "crouch" && n.pose !== "walk") n.pose = "crouch";
        const d = stepTo(n.tx, n.ty, 34);
        let prey: (typeof this.prey)[number] | null = null;
        let best = 190;
        for (const p of this.prey) {
          if (p.phase !== "alive") continue;
          const dd = Math.hypot(p.x - n.x, p.y - n.y);
          if (dd < best) { best = dd; prey = p; }
        }
        if (prey) {
          n.ai = "hunt_chase";
          n.preyId = prey.id;
          break;
        }
        if (d <= arrive) {
          // nothing here: prowl a new spot, or head home empty-pawed
          if (Math.random() < 0.35) {
            n.ai = "return_home";
          } else {
            const ang = Math.random() * Math.PI * 2;
            const rad = 120 + Math.random() * 320;
            n.tx = n.def.home.x + Math.cos(ang) * rad;
            n.ty = n.def.home.y + Math.sin(ang) * rad;
          }
        }
        break;
      }
      case "hunt_chase": {
        const prey = this.prey.find((p) => p.id === n.preyId && p.phase === "alive");
        if (!prey) {
          // prey gone (another cat / despawn): react, then re-stalk
          n.ai = "hunt_stalk";
          n.preyId = null;
          n.waitUntil = this.time + 1 + Math.random() * 2;
          break;
        }
        const d = stepTo(prey.x, prey.y, runSpeed);
        if (d < 22) {
          // CAUGHT: existing prey death pipeline (dying -> despawn), no reward
          prey.phase = "dying";
          prey.deadUntil = this.time + 0.55;
          n.ai = "carry_home";
          this.engineSfx("mew", { volume: 0.35, throttleMs: 1200 });
        }
        break;
      }
      case "carry_home": {
        const pile = this.freshKillSpot();
        if (!pile) { n.ai = "return_home"; break; }
        const d = stepTo(pile.x, pile.y, runSpeed * 0.8);
        if (d <= 26) {
          n.ai = "deliver";
          n.preyId = null;
          n.pose = "sit";
          this.deliverFreshKill();
          n.waitUntil = this.time + 2;
        }
        break;
      }
      case "deliver": {
        if (this.time > n.waitUntil) {
          n.pose = "groom";
          n.ai = "idle";
          n.waitUntil = this.time + 3 + Math.random() * 4;
        }
        break;
      }
      case "return_home": {
        const d = stepTo(n.def.home.x, n.def.home.y, walkSpeed);
        if (d <= 20) {
          n.pose = (["sit", "groom"] as CatPose[])[Math.floor(Math.random() * 2)];
          n.ai = "idle";
          n.waitUntil = this.time + 3 + Math.random() * 5;
        }
        break;
      }
      default:
        // idle: nothing to integrate
        break;
    }
  }

  /** A hunter deposits prey: the nearest pile visibly grows (session-scoped). */
  private deliverFreshKill() {
    const pile = allObjects.find((o) => o.interact === "fresh-kill");
    if (!pile) return;
    const cur = this.campPreyBonus.get(pile.id) ?? 0;
    this.campPreyBonus.set(pile.id, Math.min(6, cur + 1));
  }

`;
s = s.replace(anchor, methods + anchor);
fs.writeFileSync("src/game/engine.ts", s);
console.log("engine AI OK");

// ================= draw.ts: pile growth =================
let d = fs.readFileSync("src/game/draw.ts", "utf8");
const dEdits = [
  [
    R`export function drawFreshKillPile(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const mice: [number, number, string][] = [
    [-6, 0, "#8f8f96"],
    [5, 3, "#a5764a"],
    [0, -5, "#7a7a80"],
    [-3, -8, "#9c8a6a"],
  ];`,
    R`export function drawFreshKillPile(ctx: CanvasRenderingContext2D, x: number, y: number, extra = 0) {
  const mice: [number, number, string][] = [
    [-6, 0, "#8f8f96"],
    [5, 3, "#a5764a"],
    [0, -5, "#7a7a80"],
    [-3, -8, "#9c8a6a"],
  ];
  // NPC hunters deposit prey here: the pile visibly grows (up to +6)
  for (let i = 0; i < extra; i++) {
    mice.push([(i % 2 ? 10 : -11) + (i > 2 ? 3 : 0), 6 + Math.floor(i / 2) * 4, i % 2 ? "#b08a5a" : "#98a06a"]);
  }`,
  ],
];
let dfail = 0;
for (const [o, n] of dEdits) {
  const c = d.split(o).length - 1;
  if (c !== 1) { console.error("DRAW MISS(" + c + ")"); dfail++; }
}
if (dfail) process.exit(1);
for (const [o, n] of dEdits) d = d.split(o).join(n);
fs.writeFileSync("src/game/draw.ts", d);
console.log("draw.ts OK");

// ================= presence.ts: shake in the vocabulary =================
let pr = fs.readFileSync("src/convex/presence.ts", "utf8");
const prO = R`const ANIM_STATES = new Set(["walk", "sit", "sleep", "crouch", "groom", "stretch", "swim"]);`;
const prN = R`const ANIM_STATES = new Set(["walk", "sit", "sleep", "crouch", "groom", "stretch", "swim", "shake"]);`;
if (pr.split(prO).length !== 2) { console.error("presence MISS"); process.exit(1); }
pr = pr.split(prO).join(prN);
fs.writeFileSync("src/convex/presence.ts", pr);
console.log("presence OK");
