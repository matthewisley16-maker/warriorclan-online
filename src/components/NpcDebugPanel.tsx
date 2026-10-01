import { useEffect, useRef, useState } from "react";
import type { GameCanvas } from "@/game/engine";

type DebugInfo = {
  id: string;
  name: string;
  ai: string;
  pose: string;
  activity: string;
  trait: string;
  role: string | null;
  target: { x: number; y: number } | null;
  den: string | null;
  denSeat: number;
  denOnCooldown: boolean;
  patrolIdx: number | null;
  stuck: number;
  sidestepActive: boolean;
  lastPathFailure: string | null;
  homeTerritory: string;
  currentTerritory: string;
  houseInterior: string | null;
  convoActive: boolean;
  gone: boolean;
  position: { x: number; y: number };
  distanceToPlayer: number;
};

/**
 * Developer-only NPC diagnostics (spec §37): state, activity, targets, den
 * assignment, stall timers and path failures for every live NPC. Hidden by
 * default — toggled with Ctrl+Shift+N so normal players never see it.
 */
export function NpcDebugPanel({ game }: { game: React.RefObject<GameCanvas | null> }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "N" || e.key === "n")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => forceTick((t) => t + 1), 500);
    tickRef.current = id;
    return () => window.clearInterval(id);
  }, [open]);

  if (!open) return null;
  const gc = game.current;
  const ids = gc?.npcIdList ?? [];
  const info: DebugInfo | null = selected ? gc?.getNpcDebugInfo(selected) ?? null : null;

  return (
    <div className="pointer-events-auto fixed right-3 top-3 z-[999] max-h-[82vh] w-[340px] overflow-y-auto rounded-xl border border-emerald-500/30 bg-slate-950/92 p-3 font-mono text-[11px] leading-relaxed text-emerald-100 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold text-emerald-300">NPC DIAGNOSTICS (dev)</span>
        <button
          className="rounded border border-emerald-500/30 px-1.5 text-emerald-300 hover:bg-emerald-500/10"
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
      </div>
      <div className="mb-1 text-emerald-400/70">Ctrl+Shift+N toggles · pick a cat:</div>
      <div className="mb-2 flex flex-wrap gap-1">
        {ids.map((id) => (
          <button
            key={id}
            onClick={() => setSelected(id)}
            className={`rounded px-1.5 py-0.5 ${selected === id ? "bg-emerald-500/30 text-emerald-50" : "bg-emerald-500/5 text-emerald-200/80 hover:bg-emerald-500/15"}`}
          >
            {id}
          </button>
        ))}
      </div>
      {info ? (
        <div className="space-y-0.5">
          <div><span className="text-emerald-400">ID</span> {info.id} <span className="text-emerald-400">NAME</span> {info.name}</div>
          <div><span className="text-emerald-400">STATE</span> {info.ai} <span className="text-emerald-400">POSE</span> {info.pose}</div>
          <div><span className="text-emerald-400">ACTIVITY</span> {info.activity}</div>
          <div><span className="text-emerald-400">TRAIT</span> {info.trait} <span className="text-emerald-400">ROLE</span> {info.role ?? "—"}</div>
          <div><span className="text-emerald-400">TARGET</span> {info.target ? `${Math.round(info.target.x)},${Math.round(info.target.y)}` : "—"}</div>
          <div><span className="text-emerald-400">DEN</span> {info.den ?? "—"}{info.denSeat >= 0 ? ` (seat ${info.denSeat})` : ""}{info.denOnCooldown ? " ⏳cooldown" : ""}</div>
          <div><span className="text-emerald-400">STUCK</span> {info.stuck > 0 ? `${info.stuck.toFixed(1)}s${info.sidestepActive ? " (sidestepping)" : ""}` : "0"}</div>
          <div><span className="text-emerald-400">LAST PATH FAILURE</span> {info.lastPathFailure ?? "none"}</div>
          <div><span className="text-emerald-400">TERRITORY</span> {info.currentTerritory} (home {info.homeTerritory})</div>
          <div><span className="text-emerald-400">HOUSE</span> {info.houseInterior ?? "—"}</div>
          <div><span className="text-emerald-400">POS</span> {Math.round(info.position.x)},{Math.round(info.position.y)} <span className="text-emerald-400">ΔP</span> {Math.round(info.distanceToPlayer)}</div>
          <div><span className="text-emerald-400">CONVO</span> {info.convoActive ? "with player" : "—"} <span className="text-emerald-400">GONE</span> {info.gone ? "yes" : "no"}</div>
        </div>
      ) : (
        <div className="text-emerald-400/60">No cat selected — {ids.length} live.</div>
      )}
    </div>
  );
}
