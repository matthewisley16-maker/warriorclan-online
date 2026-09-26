// WarriorCatsRPG — shared map rendering for the minimap and the full world
// map overlay. All positions are tile coordinates straight from world.ts,
// so the map can never drift out of sync with the playable world.

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SpotKind = "camp" | "landmark" | "twoleg" | "neutral";

export interface MapSpot {
  id: string;
  x: number; // tiles
  y: number; // tiles
  label: string;
  kind: SpotKind;
  info: string;
}

/** Every marked location actually exists in the playable world. */
export const MAP_SPOTS: MapSpot[] = [
  // Clan camps
  { id: "camp", x: 89, y: 86, label: "ThunderClan Camp", kind: "camp", info: "Home of the brave. Highrock, the gorse tunnel, and the fresh-kill pile." },
  { id: "windclan-camp", x: 20, y: 84, label: "WindClan Camp", kind: "camp", info: "A shallow scoop in the open moor, ringed with gorse." },
  { id: "riverclan-camp", x: 170, y: 96, label: "RiverClan Camp", kind: "camp", info: "A gravel hollow behind the reed beds, rich with fish." },
  { id: "shadowclan-camp", x: 96, y: 20, label: "ShadowClan Camp", kind: "camp", info: "A gloomy hollow among the cold pines." },
  // ThunderClan landmarks
  { id: "sunningrocks", x: 55, y: 78, label: "Sunningrocks", kind: "landmark", info: "Warm granite slabs by the river — claimed by RiverClan." },
  { id: "sandy", x: 79, y: 118, label: "Sandy Hollow", kind: "landmark", info: "Where apprentices train to fight." },
  { id: "fourtrees", x: 67, y: 129, label: "Fourtrees", kind: "neutral", info: "Four great oaks where all Clans meet in truce on the full moon." },
  { id: "owltree", x: 104, y: 83, label: "The Owl Tree", kind: "landmark", info: "A hollow oak where a wild owl nests." },
  { id: "snakerocks", x: 114, y: 52, label: "Snakerocks", kind: "landmark", info: "Prey-rich boulders — and adders." },
  { id: "sycamore", x: 68, y: 80, label: "Great Sycamore", kind: "landmark", info: "A towering sycamore overlooking the river." },
  { id: "tallpines", x: 75, y: 112, label: "Tallpines", kind: "landmark", info: "Bare pine forest beside Twolegplace." },
  { id: "thunderpath", x: 90, y: 44, label: "The Thunderpath", kind: "neutral", info: "The black road of monsters, bordering ShadowClan." },
  { id: "highstones", x: 26, y: 43, label: "Highstones", kind: "neutral", info: "Bare stone hills. Mothermouth holds the Moonstone." },
  { id: "marsh", x: 125, y: 20, label: "The Marshes", kind: "landmark", info: "Frog-rich wetlands in ShadowClan territory." },
  { id: "moor", x: 10, y: 110, label: "The Moor", kind: "landmark", info: "Wide open grassland — WindClan hunting ground." },
  // Twoleg areas
  { id: "twolegplace", x: 75, y: 146, label: "Twolegplace", kind: "twoleg", info: "The kittypet neighborhood where Rusty and Smudge live." },
  { id: "farm", x: 124, y: 154, label: "The Farm", kind: "twoleg", info: "A red barn full of hay — and plentiful barn mice." },
];

/** Territory shading + border lines in world tiles (x, y, w, h / polylines). */
export const TERRITORIES: { id: string; name: string; color: string; rect: [number, number, number, number] }[] = [
  { id: "windclan", name: "WindClan", color: "#88b15c", rect: [0, 40, 48, 136] },
  { id: "shadowclan", name: "ShadowClan", color: "#356840", rect: [46, 0, 100, 40] },
  { id: "riverclan", name: "RiverClan", color: "#3d6f9e", rect: [152, 40, 40, 136] },
  { id: "thunderclan", name: "ThunderClan", color: "#4a8a4c", rect: [48, 40, 104, 88] },
];

const KIND_COLORS: Record<SpotKind, string> = {
  camp: "#f0b429",
  landmark: "#e8dfc0",
  neutral: "#c0b8e0",
  twoleg: "#d98a5a",
};

const KIND_LEGEND: { kind: SpotKind; label: string }[] = [
  { kind: "camp", label: "Clan Camp" },
  { kind: "landmark", label: "Landmark" },
  { kind: "neutral", label: "Neutral Ground" },
  { kind: "twoleg", label: "Twoleg Place" },
];

export interface MapPlayer {
  x: number;
  y: number;
  facing: 1 | -1;
  clan?: string;
}

export function WorldMapCanvas({
  px,
  py,
  facing,
  playerClan,
  discovered,
  waypoint,
  onPickSpot,
  remotePlayers,
  size = 116,
  className,
}: {
  px: number;
  py: number;
  facing: 1 | -1;
  playerClan?: string;
  discovered?: string[];
  waypoint?: string | null;
  onPickSpot?: (spot: MapSpot | null) => void;
  remotePlayers?: { x: number; y: number }[];
  size?: number;
  className?: string;
}) {
  // All coordinates are tiles of the real 192x176 world.
  const tx = (v: number) => (v / 192) * size;
  const ty = (v: number) => (v / 176) * size;
  const aspect = 176 / 192;

  const myTerritory = TERRITORIES.find((t) => {
    const [x, y, w, h] = t.rect;
    return px / 32 >= x && px / 32 < x + w && py / 32 >= y && py / 32 < y + h;
  });

  return (
    <div className={cn("relative select-none", className)} style={{ width: size, height: size * aspect }}>
      <svg
        viewBox="0 0 192 176"
        className="h-full w-full rounded-lg bg-[#33532e]"
        onClick={() => onPickSpot?.(null)}
      >
        {/* terrain base */}
        <defs>
          <linearGradient id="riverGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3d6f9e" />
            <stop offset="100%" stopColor="#2d5a84" />
          </linearGradient>
        </defs>
        {/* territory shading */}
        {TERRITORIES.map((t) => (
          <rect
            key={t.id}
            x={t.rect[0]}
            y={t.rect[1]}
            width={t.rect[2]}
            height={t.rect[3]}
            fill={t.color}
            opacity={0.32}
          />
        ))}
        {/* rivers */}
        <rect x={0} y={68} width={4} height={108} fill="url(#riverGrad)" />
        <rect x={144} y={48} width={8} height={128} fill="url(#riverGrad)" />
        {/* Thunderpath */}
        <rect x={0} y={42} width={192} height={4} fill="#3a3d42" />
        {/* pines / moor textures */}
        <rect x={46} y={0} width={100} height={40} fill="#234024" opacity={0.55} />
        <rect x={108} y={6} width={34} height={30} fill="#3c5a44" opacity={0.5} />
        <rect x={152} y={40} width={40} height={136} fill="#5c7d4a" opacity={0.35} />
        {/* sand clearings */}
        <circle cx={89} cy={86} r={12.5} fill="#cbb27e" opacity={0.85} />
        <circle cx={20} cy={84} r={8} fill="#cbb27e" opacity={0.75} />
        <circle cx={170} cy={96} r={8} fill="#cbb27e" opacity={0.75} />
        <circle cx={96} cy={20} r={8} fill="#cbb27e" opacity={0.75} />
        {/* territory border lines */}
        <line x1={48} y1={0} x2={48} y2={176} stroke="#f5efdd" strokeWidth={0.5} strokeDasharray="3 2.5" opacity={0.35} />
        <line x1={0} y1={40} x2={192} y2={40} stroke="#f5efdd" strokeWidth={0.5} strokeDasharray="3 2.5" opacity={0.35} />
        <line x1={152} y1={40} x2={152} y2={176} stroke="#f5efdd" strokeWidth={0.5} strokeDasharray="3 2.5" opacity={0.35} />
        {/* spots */}
        {MAP_SPOTS.map((s) => {
          const found = !discovered || discovered.includes(s.id);
          const isWaypoint = waypoint === s.id;
          return (
            <g key={s.id} onClick={(e) => { e.stopPropagation(); onPickSpot?.(s); }} className="cursor-pointer">
              {isWaypoint && <circle cx={s.x} cy={s.y} r={5.4} fill="none" stroke="#7dd3fc" strokeWidth={1.2} />}
              <circle
                cx={s.x}
                cy={s.y}
                r={s.kind === "camp" ? 3.6 : 2.6}
                fill={found ? KIND_COLORS[s.kind] : "rgba(255,255,255,0.28)"}
                stroke={s.kind === "camp" ? "#5b3d0e" : "rgba(0,0,0,0.35)"}
                strokeWidth={s.kind === "camp" ? 1 : 0.6}
              />
              {s.kind === "camp" && <text x={s.x} y={s.y - 5.5} fontSize={4.6} textAnchor="middle" fill="rgba(255,255,255,0.92)" fontWeight={700}>{s.label.replace(" Camp", "")}</text>}
            </g>
          );
        })}
        {/* remote players */}
        {remotePlayers?.map((r, i) => (
          <circle key={i} cx={r.x / 32} cy={r.y / 32} r={2.2} fill="#8ab4ff" stroke="#1d3a6e" strokeWidth={0.6} />
        ))}
        {/* the player: clan-colored arrow showing facing */}
        <g transform={`translate(${px / 32}, ${py / 32})`}>
          <circle r={4.6} fill={playerClan ? TERRITORIES.find((t) => t.id === playerClan)?.color ?? "#e05d2a" : "#e05d2a"} opacity={0.35} />
          {facing >= 0 ? (
            <polygon points="0,-3.4 2.6,2.4 -2.6,2.4" fill="#ffffff" stroke="#1c1c1c" strokeWidth={0.5} />
          ) : (
            <polygon points="0,-3.4 -2.6,2.4 2.6,2.4" fill="#ffffff" stroke="#1c1c1c" strokeWidth={0.5} transform="scale(-1,1)" />
          )}
        </g>
      </svg>
      {myTerritory && (
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-black/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/85">
          {myTerritory.name} territory
        </div>
      )}
    </div>
  );
}

/** Legend strip shared by minimap + full map. */
export function MapLegend({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1", compact ? "text-[9px]" : "text-[11px]")}>
      {KIND_LEGEND.map((l) => (
        <span key={l.kind} className="flex items-center gap-1 text-white/60">
          <span className="size-1.5 rounded-full" style={{ backgroundColor: KIND_COLORS[l.kind] }} />
          {l.label}
        </span>
      ))}
      <span className="flex items-center gap-1 text-white/60">
        <span className="inline-block h-px w-3 border-t border-dashed border-white/50" /> Border
      </span>
    </div>
  );
}

/** Full-screen world map overlay with waypoint selection. */
export function WorldMapOverlay({
  onClose,
  px,
  py,
  facing,
  playerClan,
  discovered,
  remotePlayers,
  waypoint,
  onSetWaypoint,
}: {
  onClose: () => void;
  px: number;
  py: number;
  facing: 1 | -1;
  playerClan?: string;
  discovered: string[];
  remotePlayers?: { x: number; y: number }[];
  waypoint?: string | null;
  onSetWaypoint?: (id: string | null) => void;
}) {
  const [selected, setSelected] = useState<MapSpot | null>(null);
  const [innerWaypoint, setInnerWaypoint] = useState<string | null>(null);
  const wp = waypoint !== undefined ? waypoint : innerWaypoint;
  const setWp = onSetWaypoint ?? setInnerWaypoint;
  const dist = selected ? Math.round(Math.hypot(selected.x - px / 32, selected.y - py / 32)) : null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#121c12]/95 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">Territory Map</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="size-7 rounded-full text-white/80 hover:text-white">
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative mx-auto w-full max-w-[420px]">
            <WorldMapCanvas
              px={px}
              py={py}
              facing={facing}
              playerClan={playerClan}
              discovered={discovered}
              waypoint={wp}
              onPickSpot={setSelected}
              remotePlayers={remotePlayers}
              size={420}
              className="mx-auto"
            />
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-56">
            {selected ? (
              <div className="rounded-xl border border-white/15 bg-black/40 p-3">
                <p className="text-sm font-bold text-white">{selected.label}</p>
                <p className="mt-1 text-[11px] leading-snug text-white/60">{selected.info}</p>
                {dist !== null && <p className="mt-1.5 text-[11px] font-semibold text-amber-300">{dist} tiles away</p>}
                <Button
                  size="sm"
                  className="mt-2 w-full rounded-lg bg-amber-400 text-[#0d160d] hover:bg-amber-300"
                  onClick={() => setWp(wp === selected.id ? null : selected.id)}
                >
                  {wp === selected.id ? "Clear waypoint" : "Set waypoint"}
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] text-white/50">
                Tap any marker for details and a waypoint.
              </div>
            )}
            <div className="rounded-xl border border-white/10 bg-black/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Legend</p>
              <div className="mt-1.5"><MapLegend /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
