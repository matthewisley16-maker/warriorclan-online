// §8 daily activities — shared, dependency-free logic used by BOTH the Convex
// backend (src/convex/dailies.ts) and static checks (scripts/check-dailies.ts).
// NO Convex imports here: this file must stay runnable headless.
//
// Design: every UTC day, each player gets 3 DISTINCT optional tasks drawn
// deterministically from a small pool, seeded by (date, userId) — so the
// server and client always agree on today's set without storing task text,
// and different players/days see different mixes (session variety).
// Progress is reported by KIND from real gameplay events (prey caught, areas
// visited, lore investigated, cats talked to, weather hunts) — never clicking.

export type DailyKind = "hunt" | "explore" | "patrol" | "social" | "gather" | "weather";

export interface DailyDef {
  /** stable id: `${date}:${kind}` */
  id: string;
  kind: DailyKind;
  label: string;
  hint: string;
  target: number;
  xp: number;
}

/** UTC calendar day "YYYY-MM-DD" (dailies rotate at midnight UTC). */
export function utcDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function yesterdayOf(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** FNV-1a — tiny deterministic seed for per-player task variety. */
export function seedOf(date: string, userId: string): number {
  let h = 2166136261;
  const s = `${date}:${userId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const POOL: { kind: DailyKind; label: string; hint: string; target: number; xp: number }[] = [
  { kind: "hunt", label: "Fresh catch", hint: "Pounce on prey anywhere in the forest.", target: 3, xp: 15 },
  { kind: "explore", label: "Somewhere new", hint: "Discover one place you have never been.", target: 1, xp: 14 },
  { kind: "patrol", label: "Border patrol", hint: "Roam through four different areas.", target: 4, xp: 12 },
  { kind: "social", label: "Camp gossip", hint: "Talk with cats — NPCs or Clanmates in chat.", target: 2, xp: 12 },
  { kind: "gather", label: "Follow your nose", hint: "Investigate scent & lore markers out in the world.", target: 2, xp: 10 },
  { kind: "weather", label: "Wet-pelt hunt", hint: "Catch prey while rain, snow or storm falls.", target: 1, xp: 18 },
];

export const DAILY_KINDS: DailyKind[] = POOL.map((p) => p.kind);

/**
 * Deterministic daily set: 3 DISTINCT kinds per (UTC date, player). LCG keyed
 * by the FNV seed shuffles the pool; same inputs → same tasks, forever.
 */
export function dailyDefsFor(date: string, userId: string): DailyDef[] {
  let s = seedOf(date, userId);
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const order = POOL.map((p, i) => ({ p, k: next() + i * 1e-9 })).sort((a, b) => a.k - b.k).map((x) => x.p);
  return order.slice(0, 3).map((p) => ({
    id: `${date}:${p.kind}`,
    kind: p.kind,
    label: p.label,
    hint: p.hint,
    target: p.target,
    xp: p.xp,
  }));
}

/** Bonus XP for finishing ALL of today's activities (once per day). */
export const FULL_SWEEP_BONUS_XP = 20;

/** Per-player daily state stored on the players row. */
export interface DailyState {
  date: string;
  progress: number[];
  claimed: boolean[];
  streak: number;
  lastFullDay?: string;
}

/** Fresh state for a new day (keeps the streak history intact). */
export function freshDailyState(prev: DailyState | undefined, today: string): DailyState {
  return {
    date: today,
    progress: [0, 0, 0],
    claimed: [false, false, false],
    streak: prev?.streak ?? 0,
    lastFullDay: prev?.lastFullDay,
  };
}

/**
 * Streak after the day becomes fully claimed: consecutive days extend,
 * gaps reset to 1, same-day re-entry is idempotent.
 */
export function streakAfterFullDay(prev: DailyState | undefined, today: string): number {
  if (prev?.lastFullDay === today) return prev.streak;
  if (prev?.lastFullDay === yesterdayOf(today)) return prev.streak + 1;
  return 1;
}
