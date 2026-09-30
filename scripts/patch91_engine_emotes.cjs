// patch91: engine.ts — real-animation emote system (spec §10/§11/§12).
// - New animation-state API: startEmote(id) with 14 real poses + 4 dances.
// - Emoji icon layer REMOVED (no emojis above the cat).
// - Remotes replay synced emotes via animOneShot (animation state, not frames).
// - Idle NPC fx and tail-flick fx preserved; NPC chat reuses emote helpers.
const fs = require("fs");
const P = "src/game/engine.ts";
const src = fs.readFileSync(P, "utf8");
const reps = [];
function rep(oldS, newS, tag) {
  const i = src.split(oldS).length - 1;
  if (i !== 1) {
    console.error(`ABORT: anchor ${tag} matched ${i} times (expected 1)`);
    process.exit(1);
  }
  reps.push([oldS, newS]);
}

// 1. EMOTE defs table + animation-fx state interfaces --------------------------------
rep(
`/** Icon shown over a cat for a named action (social/emote feedback). */
export function emoteIconFor(action: string): string | null {
  switch (action) {
    case "nod": return "👍";
    case "shake-head": return "🙅";
    case "bow": return "🙇";
    case "greet": return "🐾";
    case "invite": return "➡️";
    case "look": return "👀";
    case "challenge": return "⚔️";
    case "agree": return "👍";
    case "disagree": return "🙅";
    case "comfort": return "🤝";
    case "celebrate": return "🎉";
    case "warn": return "⚠️";
    case "signal": return "🙏";
    case "groom-other": return "🫧";
    case "play": return "🧶";
    case "scratch": return "🪕";
    case "dig": return "🕳️";
    case "yawn": return "🤱";
    case "alert": return "⚠️";
    case "look": return "👀";
    case "signal": return "〰️";
    case "wag": return "〰️";
    default: return null;
  }
}`,
`/** One player/NPC animation: a real cat pose (or head-acting overlay). */
export interface EmoteDef {
  /** CatPose the sprite performs — never an icon. */
  pose?: CatPose;
  /** Head-only acting (nod / shake / look / sniff) on top of the base pose. */
  head?: "nod" | "shake" | "look" | "sniff";
  /** Body-level fx on top of the base pose. */
  tailFlick?: boolean;
  yawn?: boolean;
  alert?: boolean;
  /** Hold time in engine-seconds (then a clean return to idle). */
  dur: number;
}

/** Real-animation emote registry (spec: THE CAT performs every emote). */
export const EMOTE_DEFS: Record<string, EmoteDef> = {
  "sit":       { pose: "sit",       dur: 6 },
  "lie":       { pose: "lie",       dur: 6 },
  "sleep":     { pose: "sleep",     dur: 7 },
  "groom":     { pose: "groom",     dur: 3.2 },
  "stretch":   { pose: "stretch",   dur: 3 },
  "yawn":      { pose: "sit",       yawn: true, dur: 2.4 },
  "scratch":   { pose: "sit",       head: "shake", dur: 2.6 },
  "shake":     { pose: "shake",     dur: 0.55 },
  "sniff":     { pose: "crouch",    head: "sniff", dur: 2.4 },
  "alert":     { pose: "sit",       alert: true, dur: 2.4 },
  "tail-flick":{ pose: "sit",       tailFlick: true, dur: 1.8 },
  "crouch":    { pose: "crouch",    dur: 6 },
  "stalk":     { pose: "stalk",     dur: 5 },
  "pounce":    { pose: "pounce",    dur: 1.5 },
  "leap":      { pose: "leap",      dur: 1.4 },
  "play":      { pose: "play",      dur: 3.2 },
  "greet":     { pose: "sit",       head: "nod", dur: 2.2 },
  "bow":       { pose: "bow",       dur: 2.8 },
  "nod":       { pose: "sit",       head: "nod", dur: 1.8 },
  "shake-head":{ pose: "sit",       head: "shake", dur: 1.8 },
  "look":      { pose: "sit",       head: "look", dur: 3 },
  "challenge": { pose: "challenge", dur: 3 },
  "carry":     { pose: "walk",      dur: 5 },
  "dance1":    { pose: "dance1",    dur: 4.5 },
  "dance2":    { pose: "dance2",    dur: 4.5 },
  "dance3":    { pose: "dance3",    dur: 4.5 },
  "dance4":    { pose: "dance4",    dur: 4.5 },
};

/** Legacy icon layer — intentionally returns null (emojis above the cat are gone). */
export function emoteIconFor(_action: string): string | null {
  return null;
}`,
"emote-defs");

// 2. RemotePlayer: animation one-shots ------------------------------------------------
rep(
`  /** one-shot vocal payload (play the sound locally on receive) */
  vocal?: string;
  /** one-shot social/emote action payload (show the icon on receive) */
  action?: string;`,
`  /** one-shot vocal payload (play the sound locally on receive) */
  vocal?: string;
  /** legacy one-shot social action id (kept for protocol compatibility) */
  action?: string;
  /** synchronized animation EMOTE (real cat animation, replayed locally) */
  animOneShot?: string;`,
"remote-player");

// 3. Engine fields: animation state replaces the icon field ----------------------------
rep(
`  private pPose: CatPose = "walk";
  private poseUntil = 0;
  private pEmote: string | null = null;`,
`  private pPose: CatPose = "walk";
  private poseUntil = 0;
  /** current player EMOTE id (real animation state — synced to remotes) */
  private pEmoteId: string | null = null;`,
"fields");

// 4. timed fx fields ---------------------------------------------------------------------
rep(
`  private pYawnUntil = 0;
  private pAlertUntil = 0;
  private pTailUntil = 0;`,
`  private pYawnUntil = 0;
  private pAlertUntil = 0;
  private pTailUntil = 0;
  /** head-acting overlay (nod/shake/look/sniff) until this engine time */
  private pHeadUntil = 0;
  private pHeadKind: "nod" | "shake" | "look" | "sniff" | null = null;
  /** prey-carry overlay until this engine time */
  private pCarryUntil = 0;`,
"fx-fields");

// 5. pending one-shot queue + remote emote playback map ------------------------------------
rep(
`  private emoteUntil = 0;`,
`  private emoteUntil = 0;
  /** queued remote ANIMATION one-shots: (userId, emoteId, at) replayed each frame */
  private remoteEmotes: { uid: string; emote: string; at: number }[] = [];`,
"emote-until");

// 6. EngineCallbacks: onRemoteAnim replaces onEmoteFx ---------------------------------------
rep(
`  /** Small floating icon over the player (emote/vocal/social feedback). */
  onEmoteFx?: (icon: string) => void;`,
`  /** (legacy icon hook — unused since the emoji layer was removed) */
  onEmoteFx?: (icon: string) => void;
  /** A remote cat started a REAL animation emote: replay it locally. */
  onRemoteAnim?: (uid: string, emote: string) => void;`,
"callbacks");

// 7. doVocal: no more emoji; a subtle vocal head-turn instead --------------------------------
rep(
`    this.pVocal = vocal; // rides the next movement packet (remote one-shot)
    this.setEmote(vocal === "meow" ? "🗣" : vocal === "hiss" ? "😤" : vocal === "growl" ? "😾" : vocal === "chirp" ? "🐦" : vocal === "trill" ? "🎵" : vocal === "purr" ? "💗" : "🗣");
    return true;`,
`    this.pVocal = vocal; // rides the next movement packet (remote one-shot)
    // vocals are REAL audio — no emoji is shown over the cat. A tiny alert
    // ear-prick keeps the moment visible without any floating icon.
    this.pAlertUntil = this.time + 1.1;
    return true;`,
"dovocal");

// 8. drainActions: play remote ANIMATIONS, never icons -----------------------------------------
rep(
`      } else {
        const icon = emoteIconFor(a.payload);
        if (icon) this.cb.onEmoteFx?.(icon);
      }`,
`      } else if (a.payload.startsWith("anim:")) {
        // synchronized REAL animation from another player: replay locally
        const emote = a.payload.slice(5);
        const uid = (a as unknown as { uid?: string }).uid ?? "";
        if (EMOTE_DEFS[emote]) this.startRemoteEmote(uid, emote);
      }`,
"drain");

// 9. doAction → real animation state (legacy id mapping) ----------------------------------------
rep(
`  doAction(action: string) {
    this.pAction = action; // rides the next movement packet (remote one-shot)
    this.setEmote(emoteIconFor(action) ?? "✨");
    const now = this.time;
    if (action === "yawn") this.pYawnUntil = now + 2.2;
    else if (action === "alert" || action === "warn" || action === "challenge") this.pAlertUntil = now + 2.4;
    else if (action === "signal" || action === "invite" || action === "wag") this.pTailUntil = now + 2.6;
  }`,
`  doAction(action: string) {
    this.pAction = action; // rides the next movement packet (remote one-shot)
    // named social actions map onto the REAL animation system (no icons)
    const mapped: Record<string, string> = {
      "nod": "nod", "shake-head": "shake-head", "bow": "bow", "greet": "greet",
      "invite": "nod", "look": "look", "challenge": "challenge", "agree": "nod",
      "disagree": "shake-head", "comfort": "greet", "celebrate": "dance1",
      "warn": "alert", "signal": "tail-flick", "groom-other": "groom",
      "play": "play", "scratch": "scratch", "dig": "scratch", "yawn": "yawn",
      "alert": "alert", "wag": "tail-flick",
    };
    this.startEmote(mapped[action] ?? "nod");
  }

  /**
   * Start a REAL animation emote on the player cat (start → play → clean
   * return to idle; movement cancels cleanly). Synced to other players as an
   * animation state (emote id), never as frames.
   */
  startEmote(id: string): boolean {
    const def = EMOTE_DEFS[id];
    if (!def) return false;
    const now = this.time;
    if (this.swimming && def.pose && def.pose !== "shake") return false; // no land emotes mid-swim
    this.pEmoteId = id;
    this.emoteUntil = now + def.dur;
    if (def.pose) {
      this.pPose = def.pose;
      this.poseUntil = now + def.dur;
    }
    if (def.yawn) this.pYawnUntil = now + def.dur;
    if (def.alert) this.pAlertUntil = now + def.dur;
    if (def.tailFlick) this.pTailUntil = now + def.dur;
    if (def.head) {
      this.pHeadKind = def.head;
      this.pHeadUntil = now + def.dur;
    }
    if (id === "carry") this.pCarryUntil = now + def.dur;
    return true;
  }

  /** Cancel the current emote cleanly (movement, conversations, death). */
  private cancelEmote() {
    if (this.pEmoteId) {
      this.pEmoteId = null;
      this.emoteUntil = 0;
      this.pHeadKind = null;
      this.pHeadUntil = 0;
    }
  }

  /** Remote cat performs a real animation: store + replay locally. */
  private startRemoteEmote(uid: string, emote: string) {
    if (!EMOTE_DEFS[emote]) return;
    this.remoteEmotes.push({ uid, emote, at: this.time });
    if (this.remoteEmotes.length > 12) this.remoteEmotes.shift();
  }

  /** Active remote emote for uid (or null): drives remote pose rendering. */
  remoteEmotePose(uid: string): { pose: CatPose; fx: Partial<EmoteDef> } | null {
    const now = this.time;
    for (let i = this.remoteEmotes.length - 1; i >= 0; i--) {
      const r = this.remoteEmotes[i];
      if (r.uid !== uid) continue;
      const def = EMOTE_DEFS[r.emote];
      if (!def || now > r.at + def.dur) {
        this.remoteEmotes.splice(i, 1);
        continue;
      }
      return { pose: (def.pose ?? "sit") as CatPose, fx: def };
    }
    return null;
  }`,
"doaction");

// 10. setEmote: keep API for stray callers but neutralize icons ----------------------------
rep(
`  setEmote(emote: string | null) {
    this.pEmote = emote;
    this.emoteUntil = this.time + 3;
  }`,
`  /** Legacy icon API — now a no-op: emojis above the cat are gone (spec §10). */
  setEmote(_emote: string | null) {
    // intentionally empty: the icon layer was replaced by real animations
  }`,
"setemote");

// 11. keydown: "m" starts carrying (frozen prey) -------------------------------------------
rep(
`    if (k === " " && !this.paused) this.startHop(); // PC jump: same hop as the touch JUMP button
    this.keys.add(k);`,
`    if (k === " " && !this.paused) this.startHop(); // PC jump: same hop as the touch JUMP button
    if (k === "m" && !this.paused) {
      if (this.carriedPrey.length > 0) {
        this.dropCarried();
        this.engineSfx("ui_confirm", { volume: 0.3 });
      } else {
        const f = this.frozen.find((p) => Math.hypot(p.x - this.px, p.y - this.py) < 42);
        if (f) {
          this.pickUpPrey(f.id);
          this.startEmote("carry");
          this.engineSfx("collect", { volume: 0.5 });
        }
      }
      return;
    }
    this.keys.add(k);`,
"keydown");

// 12. expiring the emote + prune remote emotes + remote one-shot drain ----------------------
rep(
`    if (this.emoteUntil && this.time > this.emoteUntil) {
      this.pEmote = null;
      this.emoteUntil = 0;
    }`,
`    if (this.emoteUntil && this.time > this.emoteUntil) {
      this.pEmoteId = null;
      this.emoteUntil = 0;
      this.pHeadKind = null;
      this.pHeadUntil = 0;
      this.pCarryUntil = 0;
    }
    // drop queued remote emotes for players that left
    if (this.remoteEmotes.length > 0) {
      this.remoteEmotes = this.remoteEmotes.filter((r) => this.remotes.has(r.uid));
    }`,
"expire");

// 13. engineState: expose emote + send "anim:<id>" one-shot when it changes ------------------
rep(
`  engineState(): {
    x: number; y: number; facing: 1 | -1; moving: boolean;
    movementState: MovementState; animationState: CatPose;
    action?: string; vocal?: string;
  } {`,
`  engineState(): {
    x: number; y: number; facing: 1 | -1; moving: boolean;
    movementState: MovementState; animationState: CatPose;
    action?: string; vocal?: string; emote?: string;
  } {`,
"estate-sig");

rep(
`        : this.pPose !== "walk" && this.pPose !== "sit" && (this.time < this.poseUntil || this.pPose === "shake") ? this.pPose
        : "sit";
    return {
      x: this.px,
      y: this.py,
      facing: this.pxFacing,
      moving,
      movementState,
      animationState,
      // one-shot action/vocal payloads ride the next movement packet so the
      // presence server can re-broadcast them (see Game.tsx heartbeat)
      action: this.pAction,
      vocal: this.pVocal,
    };
  }`,
`        : this.pPose !== "walk" && this.pPose !== "sit" && (this.time < this.poseUntil || this.pPose === "shake") ? this.pPose
        : "sit";
    // emote one-shot: ride the next packet exactly once per emote start
    let emoteOut: string | undefined;
    if (this.pEmoteId && this.pEmoteId !== this.pEmoteSent) {
      emoteOut = this.pEmoteId;
      this.pEmoteSent = this.pEmoteId;
    }
    return {
      x: this.px,
      y: this.py,
      facing: this.pxFacing,
      moving,
      movementState,
      animationState,
      // one-shot action/vocal payloads ride the next movement packet so the
      // presence server can re-broadcast them (see Game.tsx heartbeat)
      action: this.pAction,
      vocal: this.pVocal,
      emote: emoteOut,
    };
  }`,
"estate-body");

// 14. movement cancels the emote cleanly ------------------------------------------------------
rep(
`    const movingNow = dx !== 0 || dy !== 0;
    // Any movement input immediately breaks out of an emote pose so the
    // player can never get stuck sitting/sleeping/grooming.
    if (movingNow && this.pPose !== "walk") {
      this.pPose = "walk";
      this.poseUntil = 0;
    }`,
`    const movingNow = dx !== 0 || dy !== 0;
    // Any movement input immediately breaks out of an emote pose so the
    // player can never get stuck sitting/sleeping/grooming/dancing.
    if (movingNow && this.pPose !== "walk") {
      this.pPose = "walk";
      this.poseUntil = 0;
      this.cancelEmote();
    }`,
"move-cancel");

// 15. emote field + serialize helper ------------------------------------------------------------
rep(
`  pAction: string | undefined;
  pVocal: string | undefined;`,
`  pAction: string | undefined;
  pVocal: string | undefined;
  /** last emote id already broadcast (each start rides exactly one packet) */
  private pEmoteSent: string | undefined;
  /** last emote id queued from a remote packet (dedupe) */
  private remoteEmoteSent: string | undefined;
  /** Serialize the player's CURRENT animation state (pose + acting fx). */
  private playerFx(): { yawn: boolean; alert: boolean; tailFlick: boolean; head: "nod" | "shake" | "look" | "sniff" | null; carry: boolean } {
    return {
      yawn: this.pYawnUntil > this.time,
      alert: this.pAlertUntil > this.time,
      tailFlick: this.pTailUntil > this.time,
      head: this.pHeadUntil > this.time ? this.pHeadKind : null,
      carry: this.pCarryUntil > this.time,
    };
  }`,
"paction");

// 16. queueRemoteAction: accept emote ids + carry uid ----------------------------------------------
rep(
`  queueRemoteAction(kind: "vocal" | "action", payload: string) {
    const key = kind + ":" + payload;
    const now = Date.now();
    if ((this.seenActions.get(key) ?? 0) > now - 2500) return; // de-dupe re-broadcasts
    this.seenActions.set(key, now);`,
`  queueRemoteAction(kind: "vocal" | "action", payload: string, uid = "") {
    const key = kind + ":" + payload;
    const now = Date.now();
    if ((this.seenActions.get(key) ?? 0) > now - 2500) return; // de-dupe re-broadcasts
    this.seenActions.set(key, now);
    (a0 as unknown as Record<string, unknown>);`,
"queue-sig");

// (fix the stray line from 16 by anchoring the push call)
rep(
`    this.pendingActions.push({ kind, payload });`,
`    this.pendingActions.push({ kind, payload, uid } as never);`,
"queue-push");

rep(
`interface RemoteRenderState {`,
`/** one-shot social action queued from the presence stream */
interface PendingAction {
  kind: "vocal" | "action";
  payload: string;
  /** which remote cat produced it (for replaying their animation locally) */
  uid?: string;
}

interface RemoteRenderState {`,
"pending-iface");

// loop below applies everything; sentinel removed
let out = src;
for (const [o, n] of reps) out = out.replace(o, n);
fs.writeFileSync(P, out);
console.log(`patch91: applied ${reps.length} replacements to ${P}`);
