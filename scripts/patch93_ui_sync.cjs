// patch93: Game.tsx + gameUi.tsx + presence.ts — UI + sync for real emotes.
const fs = require("fs");

// ---------- Game.tsx ----------
{
  const P = "src/pages/Game.tsx";
  const src = fs.readFileSync(P, "utf8");
  const reps = [];
  const rep = (oldS, newS, tag) => {
    const i = src.split(oldS).length - 1;
    if (i !== 1) {
      console.error(`ABORT(Game): anchor ${tag} matched ${i} times (expected 1)`);
      process.exit(1);
    }
    reps.push([oldS, newS]);
  };

  // 1. onEmoteFx callback: no more emoji icons for remote one-shots
  rep(
`      onEmoteFx: (icon) => {
        gameRef.current?.setEmote(icon); // vocal/action one-shots from remote cats
      },`,
`      onEmoteFx: () => {
        // legacy icon hook: intentionally unused — remote cats now replay
        // REAL animations via onRemoteAnim (no emojis above cats)
      },
      onRemoteAnim: (uid, emoteId) => {
        gameRef.current?.playRemoteAnim(uid, emoteId); // real cat animation
      },`,
    "onemotefx");

  // 2. remote payload watch: also catch animation one-shots
  rep(
`      const curPayload = \`\${r.vocal ?? ""}|\${r.action ?? ""}\`;
      if (curPayload !== prevPayload) {
        lastRemoteActionRef.current.set(r.userId, curPayload);
        if (r.vocal) (gameRef.current as unknown as { queueRemoteAction?: (k: "vocal", p: string) => void } | null)?.queueRemoteAction?.("vocal", r.vocal);
        if (r.action) (gameRef.current as unknown as { queueRemoteAction?: (k: "action", p: string) => void } | null)?.queueRemoteAction?.("action", r.action);
      }`,
`      const curPayload = \`\${r.vocal ?? ""}|\${r.action ?? ""}|\${r.animOneShot ?? ""}\`;
      if (curPayload !== prevPayload) {
        lastRemoteActionRef.current.set(r.userId, curPayload);
        if (r.vocal) (gameRef.current as unknown as { queueRemoteAction?: (k: "vocal", p: string) => void } | null)?.queueRemoteAction?.("vocal", r.vocal);
        if (r.action) (gameRef.current as unknown as { queueRemoteAction?: (k: "action", p: string) => void } | null)?.queueRemoteAction?.("action", r.action);
        if (r.animOneShot) (gameRef.current as unknown as { queueRemoteAction?: (k: "action", p: string, u?: string) => void } | null)?.queueRemoteAction?.("action", \`anim:\${r.animOneShot}\`, r.userId);
      }`,
    "remote-watch");

  // 3. handleEmote: every action is a real animation (no emoji paths)
  rep(
`      if (e.kind === "pose") {
        g.setPose(e.pose, 5);
        if (e.pose === "sleep") {
          g.rest(55);
          audio().playSfx("ui_confirm", { volume: 0.4, throttleMs: 500 });
          setDialogue({ name: "Rest", text: "You curl up and drift off. You wake feeling rested. (+energy)" });
          window.setTimeout(() => setDialogue((d) => (d && d.name === "Rest" ? null : d)), 4000);
        }
      } else if (e.kind === "vocal") {
        // real audio: sampled mews/purr or synthesized hiss/growl/chirp/trill;
        // engine cooldown prevents sound spam — setEmote only when it fired
        const fired = g.doVocal(e.vocal);
        if (fired) {
          if (e.vocal === "meow") audio().playMew("talk");
          else if (e.vocal === "purr") audio().playSfx("cat_purr", { volume: 0.5, throttleMs: 900 });
          else audio().playVocal(e.vocal);
        }
      } else if (e.kind === "action") {
        // named social/emote action: icon + body fx + remote one-shot sync
        g.doAction(e.action);
        if (e.action === "yawn") audio().playSfx("cat_mew3", { volume: 0.35, rate: 0.7, throttleMs: 800 });
        else if (e.action === "greet") audio().playMew("talk");
        else audio().playSfx("ui_confirm", { volume: 0.25, throttleMs: 500 });
      } else {
        g.setEmote(e.emote);
      }`,
`      if (e.kind === "pose") {
        // real pose held for a while (movement cancels cleanly in-engine)
        g.setPose(e.pose, 5);
        g.startEmote(e.pose);
        if (e.pose === "sleep") {
          g.rest(55);
          audio().playSfx("ui_confirm", { volume: 0.4, throttleMs: 500 });
          setDialogue({ name: "Rest", text: "You curl up and drift off. You wake feeling rested. (+energy)" });
          window.setTimeout(() => setDialogue((d) => (d && d.name === "Rest" ? null : d)), 4000);
        }
      } else if (e.kind === "vocal") {
        // real audio: sampled mews/purr or synthesized hiss/growl/chirp/trill
        const fired = g.doVocal(e.vocal);
        if (fired) {
          if (e.vocal === "meow") audio().playMew("talk");
          else if (e.vocal === "purr") audio().playSfx("cat_purr", { volume: 0.5, throttleMs: 900 });
          else audio().playVocal(e.vocal);
        }
      } else if (e.kind === "emote") {
        // THE CAT PERFORMS THE EMOTE — no emoji is shown (spec §10)
        g.startEmote(e.emote);
        if (e.emote === "yawn") audio().playSfx("cat_mew3", { volume: 0.35, rate: 0.7, throttleMs: 800 });
        else if (e.emote === "greet") audio().playMew("talk");
        else audio().playSfx("ui_confirm", { volume: 0.25, throttleMs: 500 });
      } else {
        g.doAction(e.action);
      }`,
    "handleemote");

  // 4. heartbeat: send the emote one-shot
  rep(
`          movementState: s.movementState,
          animationState: s.animationState,
          ...(sentAction ? { action: sentAction } : {}),
          ...(sentVocal ? { vocal: sentVocal } : {}),`,
`          movementState: s.movementState,
          animationState: s.animationState,
          ...(sentAction ? { action: sentAction } : {}),
          ...(sentVocal ? { vocal: sentVocal } : {}),
          ...(s.emote ? { emote: \`anim:\${s.emote}\` } : {}),`,
    "heartbeat");

  // 5. emote change tracking in the meaningful-change gate
  rep(
`        if (last && stationary && !last.wasMoving && Math.hypot(s.x - last.x, s.y - last.y) < 2 && last.ms === s.movementState && last.an === s.animationState && !hasPendingOneShot) return;
        lastSyncRef.current = { x: s.x, y: s.y, ms: s.movementState, an: s.animationState, wasMoving: !stationary };`,
`        if (last && stationary && !last.wasMoving && Math.hypot(s.x - last.x, s.y - last.y) < 2 && last.ms === s.movementState && last.an === s.animationState && last.em === s.emote && !hasPendingOneShot) return;
        lastSyncRef.current = { x: s.x, y: s.y, ms: s.movementState, an: s.animationState, wasMoving: !stationary, em: s.emote };`,
    "sync-gate");

  let out = src;
  for (const [o, n] of reps) out = out.replace(o, n);
  fs.writeFileSync(P, out);
  console.log(`patch93: Game.tsx ${reps.length} replacements`);
}

// ---------- gameUi.tsx ----------
{
  const P = "src/pages/gameUi.tsx";
  const src = fs.readFileSync(P, "utf8");
  const reps = [];
  const rep = (oldS, newS, tag) => {
    const i = src.split(oldS).length - 1;
    if (i !== 1) {
      console.error(`ABORT(gameUi): anchor ${tag} matched ${i} times (expected 1)`);
      process.exit(1);
    }
    reps.push([oldS, newS]);
  };

  // 6. AnimAction: emote ids instead of emoji strings
  rep(
`export type AnimAction =
  | { kind: "pose"; label: string; icon: string; pose: "sit" | "sleep" | "groom" | "stretch" | "crouch" }
  | { kind: "emote"; label: string; icon: string; emote: string }
  | { kind: "action"; label: string; icon: string; action: string }
  | { kind: "vocal"; label: string; icon: string; vocal: "meow" | "hiss" | "growl" | "chirp" | "trill" | "purr" };`,
`export type AnimAction =
  | { kind: "pose"; label: string; pose: "sit" | "sleep" | "groom" | "stretch" | "crouch" }
  | { kind: "emote"; label: string; emote: string }
  | { kind: "action"; label: string; action: string }
  | { kind: "vocal"; label: string; vocal: "meow" | "hiss" | "growl" | "chirp" | "trill" | "purr" };`,
    "animaction");

  // 7. ANIM_TABS: action NAMES on the buttons — no emoji icons (spec §21)
  rep(
`/** Every action here is real: poses drive the sprite, emotes render over the
 *  cat, named actions drive body-level fx (yawn/alert/tail) and sync to other
 *  players, vocalizations play actual audio (mew asset, purr asset, or
 *  WebAudio synthesis). No decorative buttons. */
export const ANIM_TABS: { tab: string; icon: string; actions: AnimAction[] }[] = [
  {
    tab: "Social",
    icon: "🐾",
    actions: [
      { kind: "action", label: "Nod", icon: "👍", action: "nod" },
      { kind: "action", label: "Shake head", icon: "🙅", action: "shake-head" },
      { kind: "action", label: "Bow", icon: "🙇", action: "bow" },
      { kind: "action", label: "Greet", icon: "🐾", action: "greet" },
      { kind: "action", label: "Invite", icon: "➡️", action: "invite" },
      { kind: "action", label: "Comfort", icon: "🤝", action: "comfort" },
      { kind: "action", label: "Celebrate", icon: "🎉", action: "celebrate" },
      { kind: "action", label: "Warn", icon: "⚠️", action: "warn" },
    ],
  },
  {
    tab: "Emotes",
    icon: "😊",
    actions: [
      { kind: "emote", label: "Happy", icon: "😀", emote: "😊" },
      { kind: "emote", label: "Excited", icon: "✨", emote: "✨" },
      { kind: "emote", label: "Confused", icon: "❓", emote: "❓" },
      { kind: "emote", label: "Surprised", icon: "❗", emote: "❗" },
      { kind: "emote", label: "Sad", icon: "💧", emote: "💧" },
      { kind: "emote", label: "Angry", icon: "💢", emote: "💢" },
      { kind: "emote", label: "Scared", icon: "🙀", emote: "🙀" },
      { kind: "emote", label: "Proud", icon: "👑", emote: "👑" },
      { kind: "emote", label: "Tired", icon: "😴", emote: "😴" },
    ],
  },
  {
    tab: "Actions",
    icon: "⚡",
    actions: [
      { kind: "pose", label: "Sit", icon: "🐱", pose: "sit" },
      { kind: "pose", label: "Lie down", icon: "💤", pose: "sleep" },
      { kind: "pose", label: "Groom", icon: "🫧", pose: "groom" },
      { kind: "pose", label: "Stretch", icon: "〰️", pose: "stretch" },
      { kind: "pose", label: "Crouch", icon: "🐍", pose: "crouch" },
      { kind: "action", label: "Scratch", icon: "🪵", action: "scratch" },
      { kind: "action", label: "Look around", icon: "👀", action: "look" },
      { kind: "action", label: "Sniff", icon: "👃", action: "sniff" },
      { kind: "action", label: "Yawn", icon: "🥱", action: "yawn" },
      { kind: "action", label: "Alert", icon: "⚠️", action: "alert" },
      { kind: "action", label: "Wag tail", icon: "〰️", action: "wag" },
      { kind: "emote", label: "Shake fur", icon: "💨", emote: "💨" },
    ],
  },
  {
    tab: "Voice",
    icon: "🗣️",
    actions: [
      { kind: "vocal", label: "Meow", icon: "🗣️", vocal: "meow" },
      { kind: "vocal", label: "Purr", icon: "💗", vocal: "purr" },
      { kind: "vocal", label: "Hiss", icon: "😤", vocal: "hiss" },
      { kind: "vocal", label: "Growl", icon: "😾", vocal: "growl" },
      { kind: "vocal", label: "Chirp", icon: "🐦", vocal: "chirp" },
      { kind: "vocal", label: "Trill", icon: "🎵", vocal: "trill" },
    ],
  },
];`,
`/** Every action is a REAL cat animation: the sprite performs it, movement
 *  cancels cleanly, and other players see the same animation (state sync).
 *  Buttons show ACTION NAMES — no emoji icons anywhere (spec §21). */
export const ANIM_TABS: { tab: string; actions: AnimAction[] }[] = [
  {
    tab: "Body",
    actions: [
      { kind: "pose", label: "Sit", pose: "sit" },
      { kind: "emote", label: "Lie down", emote: "lie" },
      { kind: "emote", label: "Sleep", emote: "sleep" },
      { kind: "pose", label: "Groom", pose: "groom" },
      { kind: "pose", label: "Stretch", pose: "stretch" },
      { kind: "pose", label: "Crouch", pose: "crouch" },
      { kind: "emote", label: "Yawn", emote: "yawn" },
      { kind: "emote", label: "Scratch", emote: "scratch" },
      { kind: "emote", label: "Shake", emote: "shake" },
      { kind: "emote", label: "Sniff", emote: "sniff" },
      { kind: "emote", label: "Alert", emote: "alert" },
      { kind: "emote", label: "Tail flick", emote: "tail-flick" },
    ],
  },
  {
    tab: "Hunter",
    actions: [
      { kind: "emote", label: "Stalk", emote: "stalk" },
      { kind: "emote", label: "Pounce", emote: "pounce" },
      { kind: "emote", label: "Leap", emote: "leap" },
      { kind: "emote", label: "Play", emote: "play" },
      { kind: "emote", label: "Bow", emote: "bow" },
      { kind: "emote", label: "Challenge", emote: "challenge" },
    ],
  },
  {
    tab: "Social",
    actions: [
      { kind: "emote", label: "Greet", emote: "greet" },
      { kind: "emote", label: "Nod", emote: "nod" },
      { kind: "emote", label: "Shake head", emote: "shake-head" },
      { kind: "emote", label: "Look around", emote: "look" },
    ],
  },
  {
    tab: "Dance",
    actions: [
      { kind: "emote", label: "Bounce", emote: "dance1" },
      { kind: "emote", label: "Wiggle", emote: "dance2" },
      { kind: "emote", label: "Spin step", emote: "dance3" },
      { kind: "emote", label: "Paw wave", emote: "dance4" },
    ],
  },
  {
    tab: "Voice",
    actions: [
      { kind: "vocal", label: "Meow", vocal: "meow" },
      { kind: "vocal", label: "Purr", vocal: "purr" },
      { kind: "vocal", label: "Hiss", vocal: "hiss" },
      { kind: "vocal", label: "Growl", vocal: "growl" },
      { kind: "vocal", label: "Chirp", vocal: "chirp" },
      { kind: "vocal", label: "Trill", vocal: "trill" },
    ],
  },
];`,
    "animtabs");

  // 8. tab strip: no emoji icons
  rep(
`        {ANIM_TABS.map((t, i) => (
          <button
            key={t.tab}
            onClick={() => setTab(i)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors",
              i === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="mr-1">{t.icon}</span>
            {t.tab}
          </button>
        ))}`,
`        {ANIM_TABS.map((t, i) => (
          <button
            key={t.tab}
            onClick={() => setTab(i)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors",
              i === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t.tab}
          </button>
        ))}`,
    "tabstrip");

  // 9. action buttons: readable action-name pills
  rep(
`      <div className="flex gap-1 border-t border-border/60 pt-1">
        {current.actions.map((e) => (
          <button
            key={e.label}
            title={e.label}
            // Don't steal keyboard focus on click, so Space/Enter keep
            // driving the game instead of re-triggering the animation.
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => onAction(e)}
            className="flex size-9 flex-col items-center justify-center rounded-xl text-base transition-colors hover:bg-muted active:scale-90"
          >
            <span>{e.icon}</span>
            <span className="sr-only">{e.label}</span>
          </button>
        ))}
      </div>`,
`      <div className="flex max-w-[min(92vw,560px)] flex-wrap gap-1 border-t border-border/60 pt-1">
        {current.actions.map((e) => (
          <button
            key={e.label}
            title={e.label}
            // Don't steal keyboard focus on click, so Space/Enter keep
            // driving the game instead of re-triggering the animation.
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => onAction(e)}
            className="rounded-xl border border-border/40 bg-background/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/80 transition-colors hover:bg-muted active:scale-95"
          >
            {e.label}
          </button>
        ))}
      </div>`,
    "buttons");

  // 10. reopen pill: paw glyph is a UI glyph, not an on-cat emoji
  rep(
`          <span>🐾</span> Animations
          <ChevronUp className="size-3.5" />`,
`          Animations
          <ChevronUp className="size-3.5" />`,
    "pill");

  let out = src;
  for (const [o, n] of reps) out = out.replace(o, n);
  fs.writeFileSync(P, out);
  console.log(`patch93: gameUi.tsx ${reps.length} replacements`);
}

// ---------- presence.ts ----------
{
  const P = "src/convex/presence.ts";
  const src = fs.readFileSync(P, "utf8");
  const reps = [];
  const rep = (oldS, newS, tag) => {
    const i = src.split(oldS).length - 1;
    if (i !== 1) {
      console.error(`ABORT(presence): anchor ${tag} matched ${i} times (expected 1)`);
      process.exit(1);
    }
    reps.push([oldS, newS]);
  };

  // 11. heartbeat accepts the animation one-shot
  rep(
`    emote: v.optional(v.string()),
    vocal: v.optional(v.string()),
    action: v.optional(v.string()),`,
`    emote: v.optional(v.string()),
    vocal: v.optional(v.string()),
    action: v.optional(v.string()),
    animOneShot: v.optional(v.string()),`,
    "args");

  // 12. store it
  rep(
`      await ctx.db.patch(existing._id, {
        x,
        y,
        facing,
        moving,
        emote: args.emote,
        vocal,
        action,`,
`      await ctx.db.patch(existing._id, {
        x,
        y,
        facing,
        moving,
        emote: args.emote,
        vocal,
        action,
        animOneShot: jsonOrNull(args.animOneShot),`,
    "patch");

  rep(
`    const id = await ctx.db.insert("presence", {
      userId,
      x,
      y,
      facing,
      moving,
      emote: args.emote,
      vocal,
      action,`,
`    const id = await ctx.db.insert("presence", {
      userId,
      x,
      y,
      facing,
      moving,
      emote: args.emote,
      vocal,
      action,
      animOneShot: jsonOrNull(args.animOneShot),`,
    "insert");

  // 13. broadcast it
  rep(
`        emote: r.emote,
        vocal: r.vocal,
        action: r.action,
        movementState: r.movementState,`,
`        emote: r.emote,
        vocal: r.vocal,
        action: r.action,
        animOneShot: r.animOneShot,
        movementState: r.movementState,`,
    "list");

  let out = src;
  for (const [o, n] of reps) out = out.replace(o, n);
  fs.writeFileSync(P, out);
  console.log(`patch93: presence.ts ${reps.length} replacements`);
}
