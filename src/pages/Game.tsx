// WarriorCatsRPG — main game page: canvas engine + full HUD (chat, world map,
// codex, story tracker, emotes, multiplayer presence, day/night + weather).

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Clock,
  CloudRain,
  CloudSun,
  Compass,
  MessageCircle,
  Moon,
  PawPrint,
  Snowflake,
  ScrollText,
  Send,
  Sun,
  Users,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { GameCanvas, type NearbyTarget, type RemotePlayer, type WeatherKind } from "@/game/engine";
import { interiors } from "@/game/engine";
import { areas, lore, npcs, areaAt, CLAN_SPAWNS } from "@/game/world";
import { storySteps } from "@/game/story";
import { quests } from "@/game/quests";
import MainMenu, { LoadingScreen, loadSettings, type GameMode, type Settings } from "./MainMenu";
import { CatClanMenu, type CatClanSave } from "./CatClanMenu";
import type { CatSkin } from "@/game/draw";

/** Fill any missing appearance fields with defaults (matches the save validator). */
function fullSkin(
  s?: Partial<{
    fur: string;
    furDark: string;
    eye: string;
    chest: string;
    pattern: CatSkin["pattern"];
    furLength: number;
    tail: CatSkin["tail"];
    ears: CatSkin["ears"];
    size: number;
    scar: boolean;
  }> | null,
) {
  const a = s ?? {};
  const fur = a.fur || "#d96b2f";
  return {
    fur,
    furDark: a.furDark || shade(fur, 0.62),
    eye: a.eye || "#4fae6e",
    chest: a.chest,
    pattern: a.pattern ?? ("solid" as const),
    furLength: a.furLength ?? 1,
    tail: a.tail ?? ("normal" as const),
    ears: a.ears ?? ("normal" as const),
    size: a.size ?? 1,
    scar: a.scar ?? false,
  };
}

/** Darken a hex color for the derived furDark shade. */
function shade(hex: string, f: number): string {
  const n = hex.replace("#", "");
  if (n.length !== 6) return "#5a3a20";
  const r = Math.round(parseInt(n.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(n.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(n.slice(4, 6), 16) * f);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const CLANS = [
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
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Minimap (right side)
// ---------------------------------------------------------------------------

function Minimap({ px, py }: { px: number; py: number }) {
  const w = 116;
  const sx = w / (192 * 32);
  const sy = (w * (176 * 32)) / (192 * 32) / (176 * 32);
  return (
    <svg
      width={w}
      height={w * (176 / 192)}
      viewBox="0 0 192 176"
      className="rounded-lg bg-[#3f7d43]"
    >
      <rect x={0} y={42} width={192} height={4} fill="#3a3d42" />
      <rect x={0} y={68} width={4} height={108} fill="#3d6f9e" />
      <rect x={144} y={48} width={8} height={128} fill="#3d6f9e" />
      <rect x={0} y={40} width={48} height={136} fill="#7fa854" />
      <rect x={46} y={0} width={100} height={40} fill="#2e5c38" />
      <rect x={152} y={40} width={40} height={136} fill="#5c7d4a" />
      <circle cx={89} cy={86} r={12.5} fill="#cbb27e" />
      <circle cx={20} cy={84} r={8} fill="#cbb27e" opacity={0.9} />
      <circle cx={170} cy={96} r={8} fill="#cbb27e" opacity={0.9} />
      <circle cx={96} cy={20} r={8} fill="#cbb27e" opacity={0.9} />
      <circle cx={px * sx * (192 / 116) / 6} cy={py * sy} r={3} fill="#e05d2a" stroke="#fff" strokeWidth={1} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Chat panel
// ---------------------------------------------------------------------------

type ChatChannel = "global" | "clan" | "local";

function ChatPanel({
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
// World map overlay
// ---------------------------------------------------------------------------

function WorldMap({
  onClose,
  discovered,
  px,
  py,
}: {
  onClose: () => void;
  discovered: string[];
  px: number;
  py: number;
}) {
  const spots = [
    { id: "camp", x: 89, y: 86, label: "ThunderClan Camp" },
    { id: "windclan-camp", x: 20, y: 84, label: "WindClan Camp" },
    { id: "riverclan-camp", x: 170, y: 96, label: "RiverClan Camp" },
    { id: "shadowclan-camp", x: 96, y: 20, label: "ShadowClan Camp" },
    { id: "fourtrees", x: 67, y: 129, label: "Fourtrees" },
    { id: "sunningrocks", x: 55, y: 78, label: "Sunningrocks" },
    { id: "sandy", x: 79, y: 118, label: "Sandy Hollow" },
    { id: "snakerocks", x: 114, y: 52, label: "Snakerocks" },
    { id: "highstones", x: 26, y: 43, label: "Highstones" },
    { id: "twolegplace", x: 75, y: 144, label: "Twolegplace" },
    { id: "farm", x: 124, y: 154, label: "The Farm" },
    { id: "moor", x: 10, y: 110, label: "The Moor" },
    { id: "marsh", x: 125, y: 20, label: "The Marshes" },
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-border/60 bg-card p-4 shadow-2xl">
        <div className="flex items-center justify-between pb-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Compass className="size-4 text-primary" /> Territory Map
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="size-7 rounded-full">
            <X className="size-4" />
          </Button>
        </div>
        <svg viewBox="0 0 192 176" className="w-full rounded-xl bg-[#334f2e]">
          <rect x={0} y={42} width={192} height={4} fill="#2a2d33" />
          <rect x={0} y={68} width={4} height={108} fill="#3d6f9e" />
          <rect x={144} y={48} width={8} height={128} fill="#3d6f9e" />
          <rect x={0} y={40} width={48} height={136} fill="#5c7d42" opacity={0.9} />
          <rect x={46} y={0} width={100} height={40} fill="#2e4a30" opacity={0.95} />
          <rect x={152} y={40} width={40} height={136} fill="#4d6b45" opacity={0.9} />
          <rect x={46} y={40} width={98} height={88} fill="#3c6d3f" opacity={0.9} />
          <rect x={46} y={128} width={98} height={48} fill="#33593a" opacity={0.95} />
          {[...spots].map((s) => {
            const found = discovered.includes(s.id);
            return (
              <g key={s.id}>
                <circle cx={s.x} cy={s.y} r={3.4} fill={found ? "#e8c04a" : "rgba(255,255,255,0.16)"} />
                {found && (
                  <text x={s.x + 6} y={s.y + 3} fontSize={5.5} fill="rgba(255,255,255,0.85)" fontWeight={600}>
                    {s.label}
                  </text>
                )}
              </g>
            );
          })}
          <circle cx={px / 32} cy={py / 32} r={3.6} fill="#e05d2a" stroke="#fff" strokeWidth={1.2} />
        </svg>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {discovered.length} of {spots.length} places discovered — walk to a marker to find it
        </p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Emote bar
// ---------------------------------------------------------------------------

const EMOTES: { label: string; icon: string; kind: "pose" | "emote" }[] = [
  { label: "Sit", icon: "🐱", kind: "pose" },
  { label: "Sleep", icon: "💤", kind: "pose" },
  { label: "Groom", icon: "🫧", kind: "pose" },
  { label: "Crouch", icon: "🐍", kind: "pose" },
  { label: "Meow", icon: "🗣️", kind: "emote" },
  { label: "Purr", icon: "💛", kind: "emote" },
  { label: "Hiss", icon: "😤", kind: "emote" },
  { label: "Happy tail", icon: "〰️", kind: "emote" },
];

function EmoteBar({ onEmote }: { onEmote: (e: (typeof EMOTES)[number]) => void }) {
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-2xl border border-border/60 bg-card/90 p-1.5 shadow-lg backdrop-blur-sm">
      {EMOTES.map((e) => (
        <button
          key={e.label}
          title={e.label}
          // Don't steal keyboard focus on click, so Space/Enter keep
          // driving the game instead of re-triggering the emote.
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => onEmote(e)}
          className="flex size-9 flex-col items-center justify-center rounded-xl text-base transition-colors hover:bg-muted"
        >
          <span>{e.icon}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weather + clock chips
// ---------------------------------------------------------------------------

function weatherIcon(w: WeatherKind) {
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

function formatHour(h: number): string {
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12} ${h < 12 ? "am" : "pm"}`;
}

// ---------------------------------------------------------------------------
// Main Game component
// ---------------------------------------------------------------------------

export default function Game() {
  // --- routing-level state: which step of entry are we on? ---
  const [phase, setPhase] = useState<"menu" | "loading" | "playing">("menu");
  const [mode, setMode] = useState<GameMode>("open");
  const [pendingMode, setPendingMode] = useState<GameMode | null>(null);
  /** explicit spawn when the session's Clan choice moves the cat to a camp */
  const [pendingSpawn, setPendingSpawn] = useState<{ x: number; y: number } | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [catClanOpen, setCatClanOpen] = useState(false);
  const [gameSettings, setGameSettings] = useState<Settings>(() => loadSettings());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameCanvas | null>(null);

  const player = useQuery(api.players.getPlayer);
  const ensurePlayer = useMutation(api.players.ensurePlayer);
  const savePosition = useMutation(api.players.savePosition);
  const completeQuest = useMutation(api.players.completeQuest);
  const setStoryStep = useMutation(api.players.setStoryStep);
  const addXp = useMutation(api.players.addXp);
  const updateCat = useMutation(api.players.updateCat);
  const heartbeat = useMutation(api.presence.heartbeat);
  const leavePresence = useMutation(api.presence.leave);
  const sendChat = useMutation(api.chat.send);

  const remotesRaw = useQuery(api.presence.listOnline, phase === "playing" && mode === "open" ? {} : "skip");

  // --- HUD state ---
  const [areaName, setAreaName] = useState("Warrior Territories");
  const [nearby, setNearby] = useState<NearbyTarget | null>(null);
  const [dialogue, setDialogue] = useState<{ name: string; role?: string; text: string } | null>(null);
  const [codexOpen, setCodexOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatChannel, setChatChannel] = useState<ChatChannel>("global");
  const [discovered, setDiscovered] = useState<string[]>(["camp"]);
  const [questsDone, setQuestsDone] = useState<string[]>([]);
  const [pos, setPos] = useState({ x: 2848, y: 3184 });
  const [clock, setClock] = useState(8);
  const [weather, setWeather] = useState<WeatherKind>("clear");
  const [interior, setInterior] = useState<string | null>(null);
  const [myCat, setMyCat] = useState<{ name: string; clan?: string; appearance: CatSkin } | null>(null);
  const [storyStep, setStoryStepLocal] = useState(0);
  const [chatFeed, setChatFeed] = useState<{ id: string; fromName: string; text: string; mine?: boolean; channel: string; x?: number; y?: number }[]>([]);

  const chatFeedRef = useRef(chatFeed);
  chatFeedRef.current = chatFeed;

  const chatQuery = useQuery(
    api.chat.list,
    phase === "playing" && mode === "open" && chatChannel !== "local" ? { channel: chatChannel, clan: myCat?.clan } : "skip",
  );

  useEffect(() => {
    if (chatQuery) setChatFeed(chatQuery as typeof chatFeed);
  }, [chatQuery]);

  // Load an existing save into the HUD.
  useEffect(() => {
    if (!player) return;
    setMyCat({
      name: player.catName,
      clan: player.clan,
      appearance: fullSkin(player.appearance),
    });
    setQuestsDone(player.questsDone ?? []);
    setStoryStepLocal(player.storyStep ?? 0);
    if (player.discovered?.length) setDiscovered(player.discovered);
  }, [player]);

  // --- enter a mode: the ONE persistent cat is used, never a new character.
  // Clan is confirmed every session (changeable, never locked). ---
  const startMode = useCallback((m: GameMode, clanId: string) => {
    setPendingMode(m);
    setPauseOpen(false);
    if (clanId) {
      setPendingSpawn(CLAN_SPAWNS[clanId] ?? null);
      if (player && clanId !== player.clan) {
        updateCat({ clan: clanId }).catch(() => undefined);
      }
    } else {
      setPendingSpawn(null);
    }
    setPhase("loading");
  }, [player, updateCat]);

  // Finish the hand-off once the save is confirmed (creates it on first play).
  useEffect(() => {
    if (phase !== "loading" || !player) return;
    const m = pendingMode ?? "open";
    setMode(m);
    ensurePlayer({
      mode: m === "open" ? "open" : "story",
      catName: player.catName,
      appearance: fullSkin(player.appearance),
    })
      .then(() => setPhase("playing"))
      .catch(() => setPhase("menu"));
  }, [phase, player, pendingMode, ensurePlayer]);

  // Boot the engine.
  useEffect(() => {
    if (phase !== "playing" || !player || !pendingMode || !canvasRef.current || gameRef.current) return;
    const spawn = pendingSpawn ?? { x: player.x, y: player.y };

    const game = new GameCanvas(canvasRef.current, spawn, {
      onAreaChange: (name, id) => {
        setAreaName(name);
        if (id) setDiscovered((d) => (d.includes(id) ? d : [...d, id]));
      },
      onNearby: (t) => setNearby(t),
      onMove: (x, y) => setPos({ x, y }),
      onInteract: (t) => handleInteractRef.current(t),
      onPreyCaught: () => {
        addXp({ amount: 4 }).catch(() => undefined);
      },
      onClock: (h) => setClock(h),
      onWeatherChange: (w) => setWeather(w),
      onInteriorChange: (id) => setInterior(id),
      onNpcIdle: (name, line) => {
        setDialogue({ name, text: line });
        window.setTimeout(() => setDialogue((d) => (d && d.name === name && d.text === line ? null : d)), 6000);
      },
    });
    gameRef.current = game;
    if (myCat?.appearance) game.mySkin = { ...myCat.appearance, furDark: myCat.appearance.furDark || "#5a3a20" };

    // presence heartbeat (open world only)
    let hb: number | undefined;
    if (mode === "open" && myCat) {
      hb = window.setInterval(() => {
        const g = gameRef.current;
        if (!g) return;
        heartbeat({
          x: posRef.current.x,
          y: posRef.current.y,
          facing: 1,
          moving: false,
          mode: "open",
          catName: myCat.name,
          clan: myCat.clan,
          rank: "apprentice",
          appearance: fullSkin(myCat.appearance),
        }).catch(() => undefined);
      }, 5000);
    }

    // autosave
    const saveInterval = window.setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      savePosition({ x: posRef.current.x, y: posRef.current.y, discovered: discRef.current }).catch(() => undefined);
    }, 6000);

    // chat bubble pump (local + clan + global appear above cats in open world)
    const bubbleInterval = window.setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      const feed = chatFeedRef.current;
      for (const m of feed.slice(-6)) {
        if (m.x === undefined || m.y === undefined) continue;
        const key = m.id;
        if (g.bubbles.some((b) => (b as unknown as ChatBubbleKeyed).key === key)) continue;
        g.addBubble(Object.assign(
          { name: m.fromName, text: m.text, x: m.x, y: m.y - 10, until: Date.now() + 8000 },
          { key },
        ));
      }
    }, 1500);

    const onUnload = () => leavePresence().catch(() => undefined);
    window.addEventListener("beforeunload", onUnload);

    return () => {
      window.clearInterval(hb);
      window.clearInterval(saveInterval);
      window.clearInterval(bubbleInterval);
      window.removeEventListener("beforeunload", onUnload);
      game.destroy();
      gameRef.current = null;
      leavePresence().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pendingSpawn]);

  // Sync remotes into the engine.
  useEffect(() => {
    const g = gameRef.current;
    if (!g || !remotesRaw) return;
    const map = g.remotes;
    const seen = new Set<string>();
    for (const r of remotesRaw as RemotePlayer[]) {
      seen.add(r.userId);
      map.set(r.userId, r);
    }
    for (const k of [...map.keys()]) if (!seen.has(k)) map.delete(k);
  }, [remotesRaw]);

  // Pause while panels are open.
  useEffect(() => {
    gameRef.current?.setPaused(dialogue !== null || codexOpen || mapOpen || chatOpen || pauseOpen || catClanOpen);
  }, [dialogue, codexOpen, mapOpen, chatOpen, pauseOpen, catClanOpen]);

  // Camera distance from Settings.
  useEffect(() => {
    gameRef.current?.setCameraScale(gameSettings.cameraDistance);
  }, [gameSettings, phase]);

  // Esc toggles the in-game pause menu (unless typing in chat).
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      setPauseOpen((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const posRef = useRef(pos);
  posRef.current = pos;
  const discRef = useRef(discovered);
  discRef.current = discovered;

  // --- interactions ---
  const handleInteract = useCallback(
    (target: NearbyTarget) => {
      if (dialogueRef.current) {
        setDialogue(null);
        return;
      }
      if (target.kind === "prey") {
        // pounce handled by proximity; give a small flourish
        setDialogue({ name: "Hunt", text: "You pounce! The prey never knew what hit it. (+4 XP)" });
        return;
      }
      if (target.kind === "npc") {
        const npc = npcs.find((n) => n.id === target.npcId);
        if (!npc) return;
        setDialogue({ name: npc.name, role: npc.role, text: npc.lines[Math.floor(Math.random() * npc.lines.length)] });
        // story completion via talk
        if (mode === "story") {
          const step = storySteps[storyStepRef.current];
          if (step && step.objective.kind === "talk" && step.objective.targetNpc === npc.id) {
            advanceStory();
          }
        }
        return;
      }
      if (target.kind === "object") {
        if (target.interior) {
          gameRef.current?.enterInterior(target.interior);
          const room = interiors[target.interior];
          if (room) setDialogue({ name: room.name, text: room.desc });
          return;
        }
        if ((target.interact as string) === "exit-interior") {
          gameRef.current?.exitInterior();
          return;
        }
        if (target.interact && lore[target.interact]) {
          const l = lore[target.interact];
          setDialogue({ name: l.title, text: l.text });
          if (mode === "story") {
            const step = storySteps[storyStepRef.current];
            if (step) {
              if (step.objective.kind === "visit" && step.objective.areaId === areaAtRef.current) advanceStory();
              if (step.objective.kind === "patrol" && step.objective.marker === "bm-tc-west" && target.interact === "border-marker") advanceStory();
              if (step.objective.kind === "enter" && target.interior === step.objective.interior) advanceStory();
            }
          }
          // side quests
          const qMap: Record<string, string> = {
            entrance: "enter-camp", nursery: "visit-nursery", "elders-den": "visit-elders", "fresh-kill": "fresh-kill",
          };
          const qid = qMap[target.interact];
          if (qid && !questsDoneRef.current.includes(qid)) {
            setQuestsDone((q) => [...q, qid]);
            completeQuest({ questId: qid }).catch(() => undefined);
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode],
  );

  const handleInteractRef = useRef(handleInteract);
  handleInteractRef.current = handleInteract;

  // engine callback rerouting
  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    (g as unknown as { cb: { onInteract: (t: NearbyTarget) => void } }).cb.onInteract = (t) => handleInteractRef.current(t);
  }, [handleInteract, phase]);

  // --- story helpers ---
  const storyStepRef = useRef(storyStep);
  storyStepRef.current = storyStep;
  const areaAtRef = useRef<string>("");
  areaAtRef.current = areaName;
  const questsDoneRef = useRef(questsDone);
  questsDoneRef.current = questsDone;
  const dialogueRef = useRef(dialogue);
  dialogueRef.current = dialogue;

  const advanceStory = useCallback(() => {
    const step = storySteps[storyStepRef.current];
    if (!step) return;
    if (step.onComplete?.length) {
      const line = step.onComplete[0];
      setDialogue({ name: line.speaker, text: line.text });
    }
    setStoryStepLocal((s) => {
      const next = s + 1;
      setStoryStep({ step: next }).catch(() => undefined);
      addXp({ amount: 20 }).catch(() => undefined);
      return next;
    });
  }, [setStoryStep, addXp]);

  // story: visit objectives trigger on area change
  useEffect(() => {
    if (mode !== "story" || phase !== "playing") return;
    const step = storySteps[storyStep];
    if (!step || step.objective.kind !== "visit") return;
    const ids: Record<string, string> = { tallpines: "Tallpines", sandy: "Sandy Hollow", fourtrees: "Fourtrees", sunningrocks: "Sunningrocks" };
    if (areaName === ids[step.objective.areaId]) {
      if (step.objective.areaId === "fourtrees" && clock < 20) return; // Gathering at night
      advanceStory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaName, storyStep, mode, phase]);

  // story: camp objective
  useEffect(() => {
    if (mode !== "story" || phase !== "playing") return;
    const step = storySteps[storyStep];
    if (!step || step.objective.kind !== "camp") return;
    const dx = pos.x - 89 * 32;
    const dy = pos.y - 86 * 32;
    if (Math.hypot(dx, dy) < step.objective.radius) advanceStory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, storyStep, mode, phase]);

  // --- chat send ---
  const handleSend = useCallback(
    (text: string) => {
      if (!myCat) return;
      const channel = chatChannel === "local" ? "global" : chatChannel;
      sendChat({ channel, clan: myCat.clan, x: posRef.current.x, y: posRef.current.y, text })
        .then(() => {
          if (chatChannel === "local") {
            setChatFeed((f) => [
              ...f,
              { id: `local-${Date.now()}`, fromName: myCat.name, text, mine: true, channel: "local", x: posRef.current.x, y: posRef.current.y },
            ]);
          }
        })
        .catch(() => undefined);
    },
    [chatChannel, myCat, sendChat],
  );

  const handleEmote = useCallback(
    (e: (typeof EMOTES)[number]) => {
      const g = gameRef.current;
      if (!g) return;
      if (e.kind === "pose") {
        g.setPose(e.label.toLowerCase() as "sit" | "sleep" | "groom" | "crouch", 5);
      } else {
        g.setEmote(e.icon);
      }
    },
    [],
  );

  const currentStep = storySteps[storyStep];
  const clanLabel = CLANS.find((c) => c.id === myCat?.clan)?.name;
  const rankXp = player?.xp ?? 0;
  const rankLabel = rankXp >= 300 ? "Warrior" : rankXp >= 100 ? "Apprentice" : (player?.rank ?? "apprentice") === "kittypet" ? "Kittypet" : "Kit";

  if (phase !== "playing") {
    return (
      <div className="relative h-screen w-full overflow-hidden">
        <MainMenu
          player={
            player
              ? {
                  name: player.catName,
                  clan: player.clan,
                  rank: player.rank ?? "kittypet",
                  xp: player.xp ?? 0,
                  skin: fullSkin(player.appearance),
                  inventory: player.inventory ?? [],
                  achievements: player.achievements ?? [],
                  storyStep: player.storyStep ?? 0,
                  skills: player.skills ?? { hunt: 1, fight: 1, herb: 0 },
                }
              : null
          }
          onPlay={startMode}
          onSaveName={(name) => updateCat({ catName: name }).catch(() => undefined)}
          onSaveSkin={(skin) => updateCat({ appearance: fullSkin(skin) }).catch(() => undefined)}
          onSaveClan={(clan) => updateCat({ clan }).catch(() => undefined)}
          onSaveSettings={(s) => setGameSettings(s)}
        />
        <AnimatePresence>{phase === "loading" && <LoadingScreen mode={pendingMode ?? "open"} />}</AnimatePresence>
      </div>
    );
  }

  return (
    <main className="relative h-screen w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Top HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/90 py-1.5 pl-3 pr-4 shadow-lg backdrop-blur-sm">
            <PawPrint className="size-4 text-primary" />
            <span className="text-xs font-semibold tracking-tight">{myCat?.name ?? "Cat"}</span>
            {clanLabel && <span className="text-[10px] text-muted-foreground">{clanLabel} · {rankLabel}</span>}
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur-sm">
            <Clock className="size-3.5 text-primary" />
            <span className="text-xs font-medium">{formatHour(clock)}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur-sm">
            {weatherIcon(weather)}
            <span className="text-xs font-medium capitalize">{weather.replace("-", " ")}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur-sm">
            <span className="text-xs font-medium">{areaName}</span>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full border-border/60 bg-card/90 shadow-lg backdrop-blur-sm" onClick={() => setChatOpen((o) => !o)}>
            <MessageCircle className="size-3.5" /> Chat
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full border-border/60 bg-card/90 shadow-lg backdrop-blur-sm" onClick={() => setMapOpen(true)}>
            Map
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full border-border/60 bg-card/90 shadow-lg backdrop-blur-sm" onClick={() => setCodexOpen((o) => !o)}>
            <BookOpen className="size-3.5" /> Codex
          </Button>
        </div>
      </div>

      {/* Story tracker (story mode) */}
      {mode === "story" && currentStep && (
        <div className="pointer-events-none absolute left-3 top-14 z-20 w-64">
          <div className="pointer-events-auto rounded-2xl border border-border/60 bg-card/90 p-3 shadow-lg backdrop-blur-sm">
            <div className="flex items-center gap-1.5">
              <ScrollText className="size-3.5 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {currentStep.chapter}
              </span>
            </div>
            <p className="mt-1 text-[13px] font-semibold tracking-tight">{currentStep.title}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{currentStep.objectiveLabel}</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(storyStep / storySteps.length) * 100}%` }} />
            </div>
            <p className="mt-1 text-right text-[10px] text-muted-foreground">{storyStep}/{storySteps.length}</p>
          </div>
        </div>
      )}

      {/* Minimap */}
      <div className="pointer-events-none absolute right-3 top-14 z-20">
        <div className="rounded-xl border border-border/60 bg-card/90 p-1.5 shadow-lg backdrop-blur-sm">
          <Minimap px={pos.x} py={pos.y} />
        </div>
      </div>

      {/* Online players chip */}
      {mode === "open" && (remotesRaw?.length ?? 0) > 0 && (
        <div className="pointer-events-none absolute right-3 top-[11.5rem] z-20">
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur-sm">
            <Users className="size-3.5 text-primary" />
            <span className="text-xs font-medium">{remotesRaw!.length} cat{remotesRaw!.length === 1 ? "" : "s"} online</span>
          </div>
        </div>
      )}

      {/* Nearby prompt */}
      <AnimatePresence>
        {nearby && !dialogue && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="pointer-events-none absolute bottom-20 left-1/2 z-20 -translate-x-1/2"
          >
            <div className="rounded-full border border-border/60 bg-card/95 px-4 py-2 shadow-xl backdrop-blur-sm">
              <p className="text-xs text-foreground/90">
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold">E</kbd>{" "}
                {nearby.kind === "npc" ? `Speak with ${nearby.label}` : nearby.label}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialogue */}
      <AnimatePresence>
        {dialogue && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="pointer-events-auto absolute inset-x-0 bottom-16 z-30 mx-auto w-[min(620px,calc(100%-2rem))]"
          >
            <div className="rounded-2xl border border-border/60 bg-card/95 p-4 shadow-2xl shadow-black/30 backdrop-blur-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tracking-tight">{dialogue.name}</span>
                    {dialogue.role && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {dialogue.role}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">{dialogue.text}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setDialogue(null)} className="size-7 shrink-0 rounded-full">
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emote bar */}
      <EmoteBar onEmote={handleEmote} />

      {/* Chat */}
      <AnimatePresence>
        {chatOpen && (
          <ChatPanel
            onClose={() => setChatOpen(false)}
            channel={chatChannel}
            setChannel={setChatChannel}
            myClan={myCat?.clan}
            onSend={handleSend}
            messages={chatFeed}
          />
        )}
      </AnimatePresence>

      {/* Codex */}
      <AnimatePresence>
        {codexOpen && (
          <CodexPanel
            open
            onClose={() => setCodexOpen(false)}
            questsDone={questsDone}
            discovered={discovered}
            storyStep={storyStep}
            mode={mode}
          />
        )}
      </AnimatePresence>

      {/* World map */}
      <AnimatePresence>
        {mapOpen && (
          <WorldMap onClose={() => setMapOpen(false)} discovered={discovered} px={pos.x} py={pos.y} />
        )}
      </AnimatePresence>

      {/* Cat & Clan settings */}
      <AnimatePresence>
        {catClanOpen && myCat && (
          <CatClanMenu
            open
            player={{
              name: myCat.name,
              clan: myCat.clan,
              rank: rankLabel.toLowerCase(),
              xp: player?.xp ?? 0,
              skin: myCat.appearance,
            }}
            onClose={() => setCatClanOpen(false)}
            onSave={(v: CatClanSave) => {
              if (v.name && v.name !== myCat.name) {
                updateCat({ catName: v.name }).catch(() => undefined);
              }
              if (v.skin) {
                updateCat({ appearance: fullSkin(v.skin) }).catch(() => undefined);
              }
              if (v.clan && v.clan !== myCat.clan) {
                const newClan = v.clan;
                updateCat({ clan: newClan })
                  .then(() => {
                    const g = gameRef.current;
                    const spawn = CLAN_SPAWNS[newClan];
                    if (g && spawn) g.teleport(spawn.x, spawn.y);
                  })
                  .catch(() => undefined);
              }
              setCatClanOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Pause menu (Esc) */}
      <AnimatePresence>
        {pauseOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.94, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 10 }}
              className="w-full max-w-xs rounded-2xl border border-border/60 bg-card/95 p-5 text-center shadow-2xl"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">Paused</p>
              <p className="mt-1 text-lg font-extrabold tracking-tight">{myCat?.name ?? "Cat"}</p>
              {clanLabel && <p className="text-xs text-muted-foreground">{clanLabel} · {rankLabel}</p>}
              <div className="mt-4 space-y-2">
                <Button className="w-full rounded-xl" onClick={() => setPauseOpen(false)}>
                  Resume
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => setMapOpen(true)}
                >
                  Territory map
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => setCatClanOpen(true)}
                >
                  Cat & Clan
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => {
                    setPauseOpen(false);
                    setPhase("menu");
                  }}
                >
                  Main menu
                </Button>
              </div>
              <p className="mt-3 text-[10px] text-muted-foreground">Progress saves automatically.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

function CodexPanel({
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

interface ChatBubbleKeyed {
  key: string;
}
