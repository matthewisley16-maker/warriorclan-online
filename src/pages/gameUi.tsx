// WarriorCatsRPG — shared in-game UI pieces (chat panel, emote bar, weather
// chips, codex) split out of Game.tsx to keep files small and build-safe.

import { motion } from "framer-motion";
import {
  BookOpen,
  Cat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUp,
  ChevronUp,
  CloudRain,
  CloudSun,
  PawPrint,
  Send,
  Snowflake,
  Sun,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GameCanvas, WeatherKind } from "@/game/engine";
import { areas } from "@/game/world";
import { storySteps } from "@/game/story";
import { quests } from "@/game/quests";
import type { GameMode } from "./MainMenu";
import { cn } from "@/lib/utils";

/** Fill any missing appearance fields with defaults (matches the save validator). */
export function fullSkin(
  s?: Partial<{
    fur: string;
    furDark: string;
    eye: string;
    chest: string;
    pattern: string;
    furLength: number;
    furStyle: string;
    tail: string;
    ears: string;
    size: number;
    scar: boolean;
    eye2: string;
    nose: string;
    face: string;
    patternIntensity: number;
    markings: string[];
    scars: string[];
    acc: Partial<Record<string, string>>;
    accColor: string;
    accColors: Partial<Record<string, string>>;
    morph: string;
    presetId: string;
  }> | null,
) {
  const a = s ?? {};
  const fur = a.fur || "#d96b2f";
  return {
    fur,
    furDark: a.furDark || shade(fur, 0.62),
    eye: a.eye || "#4fae6e",
    chest: a.chest,
    pattern: a.pattern ?? "solid",
    furLength: a.furLength ?? 1,
    furStyle: a.furStyle || undefined,
    tail: a.tail ?? "normal",
    ears: a.ears ?? "normal",
    size: a.size ?? 1,
    scar: a.scar ?? false,
    // extended customization (optional; absent on old saves)
    ...(a.eye2 ? { eye2: a.eye2 } : {}),
    ...(a.nose ? { nose: a.nose } : {}),
    ...(a.face ? { face: a.face } : {}),
    ...(a.patternIntensity !== undefined ? { patternIntensity: a.patternIntensity } : {}),
    ...(a.markings?.length ? { markings: a.markings } : {}),
    ...(a.scars?.length ? { scars: a.scars } : {}),
    ...(a.acc && Object.keys(a.acc).length
      ? { acc: Object.fromEntries(Object.entries(a.acc).filter(([, v]) => typeof v === "string")) as Record<string, string> }
      : {}),
    ...(a.accColor ? { accColor: a.accColor } : {}),
    // §18: per-slot accessory tints (kept verbatim; empty object omitted)
    ...(a.accColors && Object.keys(a.accColors).length
      ? { accColors: Object.fromEntries(Object.entries(a.accColors).filter(([, v]) => typeof v === "string")) as Record<string, string> }
      : {}),
  };
}

/** Darken a hex color for the derived furDark shade. */
export function shade(hex: string, f: number): string {
  const n = hex.replace("#", "");
  if (n.length !== 6) return "#5a3a20";
  const r = Math.round(parseInt(n.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(n.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(n.slice(4, 6), 16) * f);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export const CLANS = [
  {
    id: "thunderclan",
    name: "ThunderClan",
    desc: "Brave and loyal. Warriors of the deep forest.",
    territory: "Oak and beech forest, Tallrock camp, Sandy Hollow",
    color: "#4a8a4c",
  },
  {
    id: "riverclan",
    name: "RiverClan",
    desc: "Sleek and strong swimmers. Fishers of the river.",
    territory: "Riverbanks, reed beds, gravel camp",
    color: "#3d6f9e",
  },
  {
    id: "windclan",
    name: "WindClan",
    desc: "Swift runners of the open moor.",
    territory: "Open moorland, gorse camp, rabbit warrens",
    color: "#88b15c",
  },
  {
    id: "shadowclan",
    name: "ShadowClan",
    desc: "Proud night hunters. The pines are theirs.",
    territory: "Cold pine forest and marshes",
    color: "#356840",
  },
];

// ---------------------------------------------------------------------------
// Chat panel
// ---------------------------------------------------------------------------

export type ChatChannel = "global" | "clan" | "local";

export function ChatPanel({
  onClose,
  channel,
  setChannel,
  myClan,
  onSend,
  messages,
}: {
  onClose: () => void;
  channel: ChatChannel;
  setChannel: (c: ChatChannel) => void;
  myClan?: string;
  onSend: (text: string) => void;
  messages: { id: string; fromName: string; text: string; mine?: boolean; channel: string }[];
}) {
  const [draft, setDraft] = useState("");
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="pointer-events-auto absolute bottom-3 left-3 z-30 flex h-80 w-[min(340px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-2xl shadow-black/30 backdrop-blur-md"
    >
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="flex gap-1">
          {(["global", "clan", "local"] as ChatChannel[]).map((c) => (
            <button
              key={c}
              onClick={() => setChannel(c)}
              disabled={c === "clan" && !myClan}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors disabled:opacity-40",
                channel === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="size-6 rounded-full">
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
        {messages.length === 0 && (
          <p className="pt-6 text-center text-xs text-muted-foreground">
            No messages yet. Say hello to the forest.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="text-[12px] leading-snug">
            <span className={cn("font-semibold", m.mine ? "text-primary" : "text-foreground/80")}>
              {m.fromName}
            </span>
            <span className="text-muted-foreground/60"> {m.channel === "clan" ? "(clan) " : ""}</span>
            <span className="text-foreground/85"> {m.text}</span>
          </div>
        ))}
      </div>
      <form
        className="flex gap-1.5 border-t border-border/60 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) {
            onSend(draft.trim());
            setDraft("");
          }
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Speak as a cat…"
          className="h-8 flex-1 rounded-full bg-muted/50 text-xs"
          maxLength={240}
        />
        <Button type="submit" size="icon" className="size-8 shrink-0 rounded-full">
          <Send className="size-3.5" />
        </Button>
      </form>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Emote bar
// ---------------------------------------------------------------------------

export type AnimAction =
  | { kind: "pose"; label: string; pose: "sit" | "sleep" | "groom" | "stretch" | "crouch" }
  | { kind: "emote"; label: string; emote: string }
  | { kind: "action"; label: string; action: string }
  | { kind: "vocal"; label: string; vocal: "meow" | "hiss" | "growl" | "chirp" | "trill" | "purr" };

/** Every action is a REAL cat animation: the sprite performs it, movement
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
];

export function EmoteBar({
  onAction,
}: {
  onAction: (a: AnimAction) => void;
}) {
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Esc closes the menu; clicking/tapping outside collapses it too. While
  // closed nothing but the reopen pill is mounted — zero input blocking.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  if (!open) {
    return (
      <div className="pointer-events-auto absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
        <button
          onClick={() => setOpen(true)}
          title="Open animations"
          className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/95 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-muted"
        >
          Animations
          <ChevronUp className="size-3.5" />
        </button>
      </div>
    );
  }

  const current = ANIM_TABS[tab];
  return (
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-auto absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-2xl border border-border/60 bg-card/95 p-1.5 shadow-lg backdrop-blur-md"
    >
      <div className="flex items-center gap-1 px-1 pb-1">
        {ANIM_TABS.map((t, i) => (
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
        ))}
        <span className="w-2" />
        <button
          onClick={() => setOpen(false)}
          title="Close (Esc) — click outside works too"
          className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>
      <div className="flex max-w-[min(92vw,560px)] flex-wrap gap-1 border-t border-border/60 pt-1">
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
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Weather + clock chips
// ---------------------------------------------------------------------------

export function weatherIcon(w: WeatherKind) {
  switch (w) {
    case "clear": return <Sun className="size-3.5" />;
    case "cloudy": return <CloudSun className="size-3.5" />;
    case "rain": case "heavy-rain": return <CloudRain className="size-3.5" />;
    case "storm": return <Zap className="size-3.5" />;
    case "fog": return <CloudSun className="size-3.5" />;
    case "wind": return <Wind className="size-3.5" />;
    case "snow": return <Snowflake className="size-3.5" />;
    default: return <Sun className="size-3.5" />;
  }
}

export function formatHour(h: number): string {
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12} ${h < 12 ? "am" : "pm"}`;
}

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

export function CodexPanel({
  open,
  onClose,
  questsDone,
  discovered,
  storyStep,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  questsDone: string[];
  discovered: string[];
  storyStep: number;
  mode: GameMode;
}) {
  const [tab, setTab] = useState<"story" | "places" | "clan">("story");
  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className="pointer-events-auto absolute right-3 top-14 bottom-3 z-30 flex w-[min(360px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-2xl shadow-black/30 backdrop-blur-md"
    >
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Warrior Codex</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="size-7 rounded-full">
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex gap-1 border-b border-border/60 px-2 py-2">
        {(
          [
            ["story", mode === "story" ? "Story" : "Objectives"],
            ["places", "Territory"],
            ["clan", "The Clans"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {tab === "story" && (
          <>
            {mode === "story" ? (
              storySteps.map((s, i) => (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-xl border p-3",
                    i < storyStep ? "border-primary/30 bg-primary/5" : i === storyStep ? "border-primary/60 bg-primary/10" : "border-border/60 bg-muted/30 opacity-70",
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{s.chapter}</p>
                  <p className={cn("mt-0.5 text-[13px] font-semibold", i === storyStep && "text-primary")}>{s.title}</p>
                  {i === storyStep && <p className="mt-1 text-xs text-muted-foreground">{s.objectiveLabel}</p>}
                </div>
              ))
            ) : (
              <>
                {quests.map((q) => (
                  <div
                    key={q.id}
                    className={cn("rounded-xl border p-3", questsDone.includes(q.id) ? "border-primary/30 bg-primary/5" : "border-border/60 bg-muted/30")}
                  >
                    <p className={cn("text-[13px] font-medium", questsDone.includes(q.id) && "text-primary")}>{q.title}</p>
                    {!questsDone.includes(q.id) && <p className="mt-0.5 text-xs text-muted-foreground">{q.hint}</p>}
                  </div>
                ))}
              </>
            )}
          </>
        )}
        {tab === "places" && (
          <>
            {areas.map((a) => {
              const seen = discovered.includes(a.id);
              return (
                <div
                  key={a.id}
                  className={cn("flex items-center gap-3 rounded-xl border p-3", seen ? "border-border/60 bg-muted/30" : "border-dashed border-border/40 opacity-60")}
                >
                  <span className={cn("size-2.5 rounded-full", seen ? "bg-primary" : "bg-muted-foreground/30")} />
                  <div>
                    <p className="text-[13px] font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{seen ? "Discovered" : "Undiscovered"}</p>
                  </div>
                </div>
              );
            })}
          </>
        )}
        {tab === "clan" && (
          <>
            {CLANS.map((c) => (
              <div key={c.id} className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ backgroundColor: c.color }} />
                  <p className="text-[13px] font-semibold">{c.name}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/70">{c.territory}</p>
              </div>
            ))}
          </>
        )}
      </div>
    </motion.div>
  );
}

export interface ChatBubbleKeyed {
  key: string;
}

// --- touch controls (mobile / tablet) ---------------------------------------
// NOT a second movement system: buttons feed the engine's existing input
// pipeline (setTouchDir / setTouchCrouch / touchJump), which drives the exact
// same movement code and animations the keyboard uses. Roblox-style = clean,
// rounded, tap-friendly; the game stays 2D with its original camera/art.

export function TouchControls({
  gameRef,
  activeUI,
}: {
  gameRef: React.RefObject<GameCanvas | null>;
  activeUI: string;
}) {
  const [dirs, setDirs] = useState({ up: false, down: false, left: false, right: false });
  const [crouching, setCrouching] = useState(false);
  const [hopping, setHopping] = useState(false);
  /** mirror for instant reads — avoids stale closures on two-finger presses */
  const dirsRef = useRef(dirs);

  /** one D-pad button => direction booleans => one setTouchDir call */
  const push = (d: Partial<typeof dirs>) => {
    const next = { ...dirsRef.current, ...d };
    dirsRef.current = next;
    setDirs(next);
    gameRef.current?.setTouchDir(
      ((next.right ? 1 : 0) - (next.left ? 1 : 0)) as -1 | 0 | 1,
      ((next.down ? 1 : 0) - (next.up ? 1 : 0)) as -1 | 0 | 1,
    );
  };

  // release all inputs if a menu opens on top of the game
  useEffect(() => {
    if (activeUI !== "gameplay") {
      dirsRef.current = { up: false, down: false, left: false, right: false };
      setDirs(dirsRef.current);
      setCrouching(false);
      setHopping(false);
      gameRef.current?.setTouchDir(0, 0);
      gameRef.current?.setTouchCrouch(false);
    }
  }, [activeUI, gameRef]);
  // (keyboard ESC/menu paths also clear engine keys via setPaused, so inputs
  // never stick when a menu opens)

  const hopTimer = useRef<number | null>(null);
  useEffect(() => () => { if (hopTimer.current) window.clearTimeout(hopTimer.current); }, []);

  const onHop = () => {
    gameRef.current?.touchJump();
    setHopping(true);
    if (hopTimer.current) window.clearTimeout(hopTimer.current);
    hopTimer.current = window.setTimeout(() => setHopping(false), 250);
  };

  const onCrouch = () => {
    const next = !crouching;
    setCrouching(next);
    gameRef.current?.setTouchCrouch(next); // same sneak pipeline as holding C
  };

  /** finger slides off the button => treat as released (no stuck inputs) */
  const dirBtn = (key: "up" | "down" | "left" | "right", icon: ReactNode, cls: string) => {
    const held = dirs[key];
    const set = (v: boolean) => (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (held === v) return;
      push({ [key]: v } as Partial<typeof dirs>);
      if (v) e.currentTarget.setPointerCapture(e.pointerId);
    }
    return (
      <button
        type="button"
        aria-label={key}
        className={cn(
          "pointer-events-auto flex touch-none items-center justify-center rounded-2xl border border-white/20 bg-black/35 text-white/90 shadow-lg backdrop-blur-sm transition-[transform,background-color] active:scale-95 active:bg-black/55",
          held && "bg-black/55 scale-95",
          cls,
        )}
        onPointerDown={set(true)}
        onPointerUp={set(false)}
        onPointerCancel={set(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {icon}
      </button>
    );
  };
  /** action button (CROUCH / JUMP): tap-friendly, lights up while active */
  const actionBtn = (label: string, held: boolean, onDown: () => void, icon: ReactNode) => (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "pointer-events-auto flex touch-none items-center justify-center rounded-2xl border border-white/20 bg-black/35 text-white/90 shadow-lg backdrop-blur-sm transition-transform active:scale-95",
        held && "scale-95 border-amber-300/60 bg-black/55 text-amber-300",
        size,
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        onDown();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {icon}
    </button>
  );
  const size = "h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]"; // phone, then tablet-sized
  const sz = "size-7 sm:size-8";

  return (
    <>
      {/* D-pad — lower-left, middle of the screen stays clear */}
      <div className="pointer-events-none absolute bottom-24 left-4 z-30 grid grid-cols-3 gap-1.5 select-none">
        <div />
        {dirBtn("up", <ChevronUp className={sz} />, size)}
        <div />
        {dirBtn("left", <ChevronLeft className={sz} />, size)}
        <div className="flex items-center justify-center">
          <PawPrint className="size-4 text-white/25" />
        </div>
        {dirBtn("right", <ChevronRight className={sz} />, size)}
        <div />
        {dirBtn("down", <ChevronDown className={sz} />, size)}
        <div />
      </div>

      {/* CROUCH + JUMP — lower-right, stacked like the reference layout */}
      <div className="pointer-events-none absolute bottom-24 right-4 z-30 flex flex-col items-end gap-2.5 select-none">
        {actionBtn(
          "Crouch",
          crouching,
          onCrouch,
          <Cat className={sz} />,
        )}
        {actionBtn(
          "Jump",
          hopping,
          onHop,
          <ChevronsUp className={sz} />,
        )}
      </div>
    </>
  );
}
