// WarriorCatsRPG — the main game page. Hosts the canvas engine and overlays
// the HUD: area chip, minimap, dialogue box, codex panels, quest tracker.

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Compass,
  MapPin,
  PawPrint,
  RotateCcw,
  ScrollText,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { GameCanvas, type NearbyTarget } from "@/game/engine";
import { lore, npcs, areas } from "@/game/world";
import { quests } from "@/game/quests";
import { cn } from "@/lib/utils";

// Minimap land marks (world coords /32 -> minimap units)
const minimapSpots: { x: number; y: number; label: string; kind: "camp" | "land" }[] = [
  { x: 41, y: 46, label: "Camp", kind: "camp" },
  { x: 7, y: 40, label: "Sunningrocks", kind: "land" },
  { x: 19, y: 68, label: "Fourtrees", kind: "land" },
  { x: 31, y: 62, label: "Sandy Hollow", kind: "land" },
  { x: 56, y: 43, label: "Owl Tree", kind: "land" },
  { x: 66, y: 18, label: "Snakerocks", kind: "land" },
  { x: 20, y: 40, label: "Sycamore", kind: "land" },
];

const exploreAreas = ["sunningrocks", "fourtrees", "sandy", "snakerocks"];

function DialogueBox({
  name,
  role,
  text,
  onClose,
}: {
  name: string;
  role?: string;
  text: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="pointer-events-auto absolute inset-x-0 bottom-4 z-30 mx-auto w-[min(680px,calc(100%-2rem))]"
    >
      <div className="rounded-2xl border border-border/60 bg-card/95 p-5 shadow-2xl shadow-black/30 backdrop-blur-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-foreground">{name}</span>
              {role && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {role}
                </span>
              )}
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">{text}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="size-7 shrink-0 rounded-full">
            <X className="size-4" />
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="size-3" /> Press E or click Continue
          </span>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Continue
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function CodexPanel({
  open,
  onClose,
  questsDone,
  discovered,
}: {
  open: boolean;
  onClose: () => void;
  questsDone: string[];
  discovered: string[];
}) {
  const [tab, setTab] = useState<"quests" | "places" | "clan">("quests");
  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="pointer-events-auto absolute right-3 top-14 bottom-3 z-30 flex w-[min(360px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-2xl shadow-black/30 backdrop-blur-md"
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
            ["quests", "Objectives"],
            ["places", "Territory"],
            ["clan", "The Clan"],
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
        {tab === "quests" && (
          <>
            {quests.map((q) => {
              const done = questsDone.includes(q.id);
              return (
                <div
                  key={q.id}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    done ? "border-primary/30 bg-primary/5" : "border-border/60 bg-muted/30",
                  )}
                >
                  <div className="flex items-start gap-2">
                    {done ? (
                      <Star className="mt-0.5 size-4 shrink-0 text-primary" />
                    ) : (
                      <PawPrint className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    )}
                    <div>
                      <p className={cn("text-[13px] font-medium", done && "text-primary")}>{q.title}</p>
                      {!done && <p className="mt-0.5 text-xs text-muted-foreground">{q.hint}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
        {tab === "places" && (
          <>
            {areas.map((a) => {
              const seen = discovered.includes(a.id);
              return (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3",
                    seen ? "border-border/60 bg-muted/30" : "border-dashed border-border/40 opacity-60",
                  )}
                >
                  <MapPin className={cn("size-4 shrink-0", seen ? "text-primary" : "text-muted-foreground")} />
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
            {npcs.map((n) => (
              <div key={n.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
                <span
                  className="size-3.5 shrink-0 rounded-full ring-2 ring-background"
                  style={{ backgroundColor: n.fur }}
                />
                <div>
                  <p className="text-[13px] font-medium">{n.name}</p>
                  <p className="text-xs text-muted-foreground">{n.role}</p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </motion.div>
  );
}

function Minimap({
  px,
  py,
  discovered,
}: {
  px: number;
  py: number;
  discovered: string[];
}) {
  const MM = 120;
  const sx = MM / 96;
  const sy = MM / 84;
  return (
    <div className="rounded-xl border border-border/60 bg-card/90 p-1.5 shadow-lg backdrop-blur-sm">
      <svg width={MM} height={MM * (84 / 96)} viewBox="0 0 96 84" className="rounded-lg bg-[#3f7d43]">
        {/* thunderpath */}
        <rect x={0} y={2} width={96} height={4} fill="#3a3d42" />
        {/* river */}
        <rect x={0} y={28} width={4} height={56} fill="#3d6f9e" />
        {/* tallpines */}
        <rect x={6} y={66} width={42} height={18} fill="#35663c" />
        {/* camp */}
        <circle cx={41} cy={46} r={12.5} fill="#cbb27e" opacity={0.95} />
        {minimapSpots.map((s) =>
          s.kind === "land" ? (
            <circle key={s.label} cx={s.x} cy={s.y} r={1.6} fill="#2f4f2f" />
          ) : null,
        )}
        {minimapSpots.map((s) =>
          s.kind === "camp" ? (
            <circle key={s.label} cx={s.x} cy={s.y} r={2.4} fill="none" stroke="#5b4a2f" strokeWidth={1} />
          ) : null,
        )}
        {/* player */}
        <circle cx={px / 32} cy={py / 32} r={2.6} fill="#e05d2a" stroke="#fff" strokeWidth={1} />
      </svg>
      <div className="flex items-center gap-1 px-1 pt-1 text-[10px] font-medium text-muted-foreground">
        <Compass className="size-3" />
        {discovered.length} of {areas.length} places found
      </div>
    </div>
  );
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameCanvas | null>(null);
  const player = useQuery(api.players.getPlayer);
  const ensurePlayer = useMutation(api.players.ensurePlayer);
  const saveProgress = useMutation(api.players.saveProgress);
  const completeQuest = useMutation(api.players.completeQuest);
  const resetPlayer = useMutation(api.players.resetPlayer);

  const [areaName, setAreaName] = useState("ThunderClan Territory");
  const [nearby, setNearby] = useState<NearbyTarget | null>(null);
  const [dialogue, setDialogue] = useState<{ name: string; role?: string; text: string } | null>(null);
  const [codexOpen, setCodexOpen] = useState(false);
  const [discovered, setDiscovered] = useState<string[]>(["camp"]);
  const [questsDoneLocal, setQuestsDoneLocal] = useState<string[]>([]);
  const [pos, setPos] = useState({ x: 1312, y: 1904 });
  const [booted, setBooted] = useState(false);

  const nearbyRef = useRef<NearbyTarget | null>(null);
  nearbyRef.current = nearby;
  const dialogueOpenRef = useRef(false);
  dialogueOpenRef.current = dialogue !== null;

  // Ensure a save exists once auth is resolved.
  useEffect(() => {
    if (player === null) {
      ensurePlayer().catch(() => undefined);
    }
  }, [player, ensurePlayer]);

  // Boot the engine once we have a save (or gave up waiting).
  useEffect(() => {
    if (!canvasRef.current || gameRef.current || player === undefined) return;
    const spawn = player ? { x: player.x, y: player.y } : { x: 1312, y: 1904 };
    if (player) {
      setDiscovered((d) => Array.from(new Set([...d, ...(player.discovered ?? [])])));
      setQuestsDoneLocal(player.questsDone ?? []);
      setPos({ x: player.x, y: player.y });
    }

    const game = new GameCanvas(canvasRef.current, spawn, {
      onAreaChange: (name) => setAreaName(name),
      onNearby: (t) => setNearby(t),
      onMove: (x, y) => setPos({ x, y }),
      onInteract: (t) => handleInteractRef.current(t),
    });
    gameRef.current = game;
    setBooted(true);

    const saveInterval = window.setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      const p = posRef.current;
      const disc = discRef.current;
      saveProgress({ x: p.x, y: p.y, discovered: disc }).catch(() => undefined);
    }, 6000);

    return () => {
      window.clearInterval(saveInterval);
      game.destroy();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player === undefined, player?._id]);

  // Pause the sim while a panel is open.
  useEffect(() => {
    gameRef.current?.setPaused(dialogue !== null || codexOpen);
  }, [dialogue, codexOpen]);

  const posRef = useRef(pos);
  posRef.current = pos;
  const discRef = useRef(discovered);
  discRef.current = discovered;

  const completeQuestLocal = useCallback(
    (id: string) => {
      setQuestsDoneLocal((q) => {
        if (q.includes(id)) return q;
        const next = [...q, id];
        completeQuest({ questId: id }).catch(() => undefined);
        return next;
      });
    },
    [completeQuest],
  );

  const handleInteract = useCallback(
    (target: NearbyTarget) => {
      if (dialogueOpenRef.current) {
        setDialogue(null);
        return;
      }
      if (target.kind === "npc") {
        const npc = npcs.find((n) => n.id === target.npcId);
        if (!npc) return;
        const line = npc.lines[Math.floor(Math.random() * npc.lines.length)];
        setDialogue({ name: npc.name, role: npc.role, text: line });
        const questId = Object.entries({ "meet-bluestar": "npc:bluestar", "meet-spottedleaf": "npc:spottedleaf", "meet-graypaw": "npc:graypaw" }).find(
          ([, key]) => key === `npc:${npc.id}`,
        )?.[0];
        if (questId) completeQuestLocal(questId);
        return;
      }
      if (target.kind === "object" && target.interact) {
        const l = lore[target.interact];
        setDialogue({ name: l.title, text: l.text });
        const questId = Object.entries({ "enter-camp": "entrance", "visit-nursery": "nursery", "visit-elders": "elders-den", "fresh-kill": "fresh-kill" }).find(
          ([, key]) => key === target.interact,
        )?.[0];
        if (questId) completeQuestLocal(questId);
      }
    },
    [completeQuestLocal],
  );

  const handleInteractRef = useRef(handleInteract);
  handleInteractRef.current = handleInteract;

  // Area discovery + explore-territory quest.
  useEffect(() => {
    const area = areas.find((a) => a.name === areaName);
    if (area && !discovered.includes(area.id)) {
      setDiscovered((d) => [...d, area.id]);
    }
    if (exploreAreas.every((id) => discovered.includes(id) || id === area?.id)) {
      if (!questsDoneLocal.includes("explore-territory")) {
        completeQuestLocal("explore-territory");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaName]);

  const questsDone = useMemo(() => questsDoneLocal, [questsDoneLocal]);
  const progressPct = Math.round((questsDone.length / quests.length) * 100);

  const handleReset = async () => {
    await resetPlayer();
    gameRef.current?.teleport(1312, 1904);
    setQuestsDoneLocal([]);
    setDiscovered(["camp"]);
    setDialogue(null);
  };

  return (
    <main className="relative h-screen w-full overflow-hidden bg-background">
      {/* Game canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Top HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/90 py-1.5 pl-3 pr-4 shadow-lg backdrop-blur-sm">
            <PawPrint className="size-4 text-primary" />
            <span className="text-xs font-semibold tracking-tight">Firepaw</span>
            <span className="text-[10px] text-muted-foreground">ThunderClan Apprentice</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur-sm">
            <MapPin className="size-3.5 text-primary" />
            <AnimatePresence mode="wait">
              <motion.span
                key={areaName}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="text-xs font-medium"
              >
                {areaName}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-full border-border/60 bg-card/90 shadow-lg backdrop-blur-sm"
            onClick={() => setCodexOpen((o) => !o)}
          >
            <BookOpen className="size-3.5" />
            Codex
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-full border-border/60 bg-card/90 shadow-lg backdrop-blur-sm"
            onClick={handleReset}
          >
            <RotateCcw className="size-3.5" />
            New game
          </Button>
        </div>
      </div>

      {/* Left: quest tracker */}
      <div className="pointer-events-none absolute left-3 top-14 z-20 w-60 space-y-2">
        <div className="pointer-events-auto rounded-2xl border border-border/60 bg-card/90 p-3 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ScrollText className="size-3.5 text-primary" />
              <span className="text-xs font-semibold tracking-tight">Objectives</span>
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">
              {questsDone.length}/{quests.length}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-2.5 space-y-1.5">
            {quests.filter((q) => !questsDone.includes(q.id)).slice(0, 3).map((q) => (
              <div key={q.id} className="flex items-start gap-1.5">
                <PawPrint className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                <p className="text-[11px] leading-snug text-foreground/80">{q.title}</p>
              </div>
            ))}
            {quests.every((q) => questsDone.includes(q.id)) && (
              <p className="text-[11px] font-medium text-primary">
                You have walked the whole territory. Bluestar would be proud.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right: minimap */}
      <div className="pointer-events-none absolute right-3 top-14 z-20">
        <Minimap px={pos.x} py={pos.y} discovered={discovered} />
      </div>

      {/* Nearby prompt */}
      <AnimatePresence>
        {nearby && !dialogue && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="pointer-events-none absolute bottom-28 left-1/2 z-20 -translate-x-1/2"
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
          <DialogueBox name={dialogue.name} role={dialogue.role} text={dialogue.text} onClose={() => setDialogue(null)} />
        )}
      </AnimatePresence>

      {/* Codex */}
      <AnimatePresence>
        <CodexPanel
          open={codexOpen}
          onClose={() => setCodexOpen(false)}
          questsDone={questsDone}
          discovered={discovered}
        />
      </AnimatePresence>

      {/* Boot splash */}
      <AnimatePresence>
        {!booted && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-background"
          >
            <PawPrint className="size-8 animate-pulse text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Padding into the forest…</p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
