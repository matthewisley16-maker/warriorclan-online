// patch92: engine.ts — wire the emote system into draw sites, NPCs, idles.
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

// a. player drawCat: add the prey-carry fx --------------------------------------------
rep(
`      {
        yawn: this.playerFx().yawn,
        alert: this.playerFx().alert,
        tailFlick: this.playerFx().tailFlick,
        head: this.playerFx().head ?? undefined,
        talking: false,
        hop: this.hopT >= 0 ? Math.min(1, this.hopT / HOP_DURATION) : undefined,
      },`,
`      {
        yawn: this.playerFx().yawn,
        alert: this.playerFx().alert,
        tailFlick: this.playerFx().tailFlick,
        head: this.playerFx().head ?? undefined,
        carry: this.playerFx().carry,
        talking: false,
        hop: this.hopT >= 0 ? Math.min(1, this.hopT / HOP_DURATION) : undefined,
      },`,
"player-fx");

// b. remote drawCat: emote override + acting fx (spec §12) ----------------------------
rep(
`          drawCat(
            ctx,
            { ...r.appearance },
            rp.x,
            rp.y - (this.waterAt(rp.x, rp.y) ? 4 + Math.sin(this.time * SWIM_BOB_HZ * Math.PI * 2 + (r.userId.charCodeAt(0) % 10)) * 2 : 0),
            (rp.facing >= 0 ? 1 : -1) as 1 | -1,
            rp.pose,
            rp.animMs / 1000,
            (r.userId.charCodeAt(0) % 10),
          );`,
`          // synchronized REAL animation from the remote cat (replayed locally
          // from animation state — never frames)
          const rem = this.remoteEmotePose(r.userId);
          const rPose = rem ? (rem.pose as CatPose) : rp.pose;
          const remFx = rem
            ? {
                yawn: Boolean(rem.fx.yawn),
                alert: Boolean(rem.fx.alert),
                tailFlick: Boolean(rem.fx.tailFlick),
                head: rem.fx.head,
              }
            : undefined;
          drawCat(
            ctx,
            { ...r.appearance },
            rp.x,
            rp.y - (this.waterAt(rp.x, rp.y) ? 4 + Math.sin(this.time * SWIM_BOB_HZ * Math.PI * 2 + (r.userId.charCodeAt(0) % 10)) * 2 : 0),
            (rp.facing >= 0 ? 1 : -1) as 1 | -1,
            rPose,
            rp.animMs / 1000,
            (r.userId.charCodeAt(0) % 10),
            remFx,
          );`,
"remote-draw");

// c. NPC emote helper + conversation greeting (spec §13) ------------------------------
rep(
`  /** The player joined this NPC's patrol: the cat leads the way outside. */`,
`  /**
   * NPC emote helper: the named cat performs a REAL animation (same registry
   * as the player). Used by conversations and ambient behavior.
   */
  npcEmote(npcId: string, emoteId: string): boolean {
    const def = EMOTE_DEFS[emoteId];
    const n = this.npcStates.find((s) => s.def.id === npcId);
    if (!def || !n || n.gone || n.convoActive) return false;
    const now = this.time;
    if (def.pose) n.pose = def.pose;
    if (def.yawn) n.yawnFxUntil = now + def.dur;
    if (def.alert) n.alertFxUntil = now + def.dur;
    if (def.tailFlick) n.tailFxUntil = now + def.dur;
    if (def.pose && def.dur > 0) {
      n.poseUntil = now + def.dur;
    }
    return true;
  }

  /** The player joined this NPC's patrol: the cat leads the way outside. */`,
"npc-emote");

// d. conversation start: the NPC greets with a real animation -------------------------
rep(
`      n.pose = "sit";
      n.activity = "talking with you";`,
`      n.pose = "sit";
      n.activity = "talking with you";
      // greet the player with a real animation before the talk begins
      n.tailFxUntil = this.time + 2;`,
"convo-greet");

// e. player idle pool: real lie-down/sniff variety (spec §9) ---------------------------
rep(
`      if (!this.swimming && this.pPose === "sit" && Math.random() < 0.0016) {
        const roll = Math.random();
        if (roll < 0.45) {
          this.pTailUntil = this.time + 1.6; // tail flick
        } else if (roll < 0.75) {
          this.pAlertUntil = this.time + 1.4; // ears prick (heard something)
        } else {
          this.pPose = "groom";
          this.poseUntil = this.time + 2.4; // quick groom, then back to sit
        }
      }`,
`      if (!this.swimming && this.pPose === "sit" && Math.random() < 0.0016) {
        const roll = Math.random();
        if (roll < 0.3) {
          this.pTailUntil = this.time + 1.6; // tail flick
        } else if (roll < 0.55) {
          this.pAlertUntil = this.time + 1.4; // ears prick (heard something)
        } else if (roll < 0.75) {
          this.pPose = "groom";
          this.poseUntil = this.time + 2.4; // quick groom, then back to sit
        } else if (roll < 0.9) {
          this.pPose = "sniff";
          this.pHeadKind = "sniff";
          this.pHeadUntil = this.time + 2.2;
          this.poseUntil = this.time + 2.2; // sniff the ground, then sit up
        } else {
          this.pPose = "lie";
          this.poseUntil = this.time + 4; // flop down for a moment
        }
      }`,
"player-idle");

// f. NPC idle pools: richer life (lie/sniff/yawn/stalk) -------------------------------
rep(
`    n.pose = ([\"stretch\", \"groom\", \"sit\", \"sit\"] as CatPose[])[Math.floor(Math.random() * 4)];`,
`    n.pose = ([\"stretch\", \"groom\", \"sit\", \"sit\", \"lie\", \"sniff\"] as CatPose[])[Math.floor(Math.random() * 6)];`,
"npc-idle-1");

rep(
`          n.pose = nightNow && Math.hypot(n.x - n.def.home.x, n.y - n.def.home.y) < 60 ? \"sleep\" : ([\"sit\", \"groom\", \"stretch\"] as CatPose[])[Math.floor(Math.random() * 3)];`,
`          n.pose = nightNow && Math.hypot(n.x - n.def.home.x, n.y - n.def.home.y) < 60 ? \"sleep\" : ([\"sit\", \"groom\", \"stretch\", \"lie\", \"sniff\"] as CatPose[])[Math.floor(Math.random() * 5)];`,
"npc-idle-2");

rep(
`          n.pose = ([\"sit\", \"groom\"] as CatPose[])[Math.floor(Math.random() * 2)];`,
`          n.pose = ([\"sit\", \"groom\", \"lie\", \"yawn\"] as CatPose[])[Math.floor(Math.random() * 4)];`,
"npc-idle-3");

// g. expiry: return head acting cleanly ----------------------------------------------
rep(
`    if (this.emoteUntil && this.time > this.emoteUntil) {
      this.pEmoteId = null;
      this.emoteUntil = 0;
      this.pHeadKind = null;
      this.pHeadUntil = 0;
      this.pCarryUntil = 0;
    }`,
`    if (this.emoteUntil && this.time > this.emoteUntil) {
      this.pEmoteId = null;
      this.emoteUntil = 0;
      this.pHeadKind = null;
      this.pHeadUntil = 0;
      this.pCarryUntil = 0;
    }
    if (this.pHeadUntil && this.time > this.pHeadUntil) {
      this.pHeadKind = null;
      this.pHeadUntil = 0;
    }
    if (this.pCarryUntil && this.time > this.pCarryUntil) {
      this.pCarryUntil = 0;
    }`,
"expiry-head");

let out = src;
for (const [o, n] of reps) out = out.replace(o, n);
fs.writeFileSync(P, out);
console.log(`patch92: applied ${reps.length} replacements to ${P}`);
