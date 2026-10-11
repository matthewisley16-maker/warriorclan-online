// WarriorCatsRPG — npcSync: the ONE vocabulary for online NPC synchronization.
//
// §30/§31 (ONLINE WORLD ONLY — Story Mode never touches this):
//
//   authority client simulates  →  SERVER validates + clamps  →  every other
//   client renders the authoritative snapshots.
//
// This module is pure (world data only: no canvas, no DOM, no React) so the
// Convex server, the engine and the test suites all share EXACTLY the same
// rules:
//   - territory clamp (a cat is pulled back into its own ground + leash)
//   - sanctioned crossings (gathering / patrol / medicine / … with a deadline)
//   - snapshot shape + vocabulary validation (pose / ai / movement)
//   - conversation visibility (a player cat NAME only — never chat text)
//
// The engine owns the movement; the server owns the truth.

import { MAP_H, MAP_W, TILE, npcs, territoryAt, type TerritoryId } from "./world";

export const NPC_SYNC_WORLD = "online";

/** authority → server cadence (throttled: "do not send excessive updates"). */
export const NPC_SYNC_INTERVAL_MS = 500;
/** server: how long an authority's heartbeat stays trusted (then anyone may take over). */
export const NPC_SYNC_AUTHORITY_MS = 6_000;
/** client: how long received snapshots stay usable (then local sim resumes). */
export const NPC_SYNC_FRESH_MS = 9_000;
/** longest sanctioned out-of-territory excursion (server-enforced). */
export const NPC_SYNC_MAX_CROSS_MS = 240_000;
/** a desync larger than this is a teleport/join → snap to the authoritative spot. */
export const NPC_SYNC_SNAP_PX = 250;
/** a conversation claim (busy flag) expires after this long without a refresh. */
export const NPC_SYNC_BUSY_TTL_MS = 15_000;
/** sanity cap on a published batch (the whole roster, never more). */
export const NPC_SYNC_MAX_STATES = 200;

/** Real-animation pose vocabulary (mirrors draw.ts CatPose). */
export const NPC_POSES: readonly string[] = [
  "walk", "sit", "sleep", "crouch", "groom", "stretch", "swim", "shake",
  "lie", "yawn", "sniff", "stalk", "pounce", "leap", "play", "bow",
  "scratch", "challenge", "dance1", "dance2", "dance3", "dance4",
];

/** NPC brain vocabulary (mirrors engine NpcAiMode). */
export const NPC_AI_MODES: readonly string[] = [
  "idle", "wander", "patrol", "hunt_stalk", "hunt_chase",
  "carry_home", "deliver", "return_home", "go_eat", "after_eat", "go_drink",
  "go_den", "in_den", "exit_den",
  "house_door", "house_travel", "house_enjoy", "house_exit",
];

/** Movement vocabulary (mirrors presence.ts MOVEMENT_STATES). */
export const NPC_MOVEMENTS: readonly string[] = ["idle", "walk", "run", "crouch"];

/**
 * Valid reasons a cat may leave its home territory (§4). A crossing is always
 * intentional and temporary: it carries a reason and a deadline, and the
 * server ends it (the cat is pulled home) when the deadline passes.
 */
export const NPC_CROSS_REASONS: readonly string[] = [
  "gathering", "patrol", "medicine", "emergency", "quest",
  "prey-chase", "following", "visit", "event", "return",
];

/** One authoritative NPC frame, as published by the authority client. */
export interface NpcWire {
  id: string;
  x: number;
  y: number;
  /** ±1 */
  facing: number;
  pose: string;
  ai: string;
  activity: string;
  movement: string;
  /** den the cat is inside (rendering/hiding on every client) */
  denId?: string | null;
  /** display name of the player this cat is talking to — NEVER chat text */
  convoWith?: string | null;
  /** per-cat monotonic sequence (server rejects regressions) */
  seq: number;
}

/** A declared, sanctioned out-of-territory excursion. */
export interface NpcCrossClaim {
  reason: string;
  /** absolute ms timestamp (Date.now domain) after which the crossing ends */
  until: number;
}

/** A live conversation claim (server-stored interaction state, §29). */
export interface NpcBusyClaim {
  npcId: string;
  /** the player's cat name — the only player info ever shared */
  name: string;
  until: number;
}

export interface NpcRosterEntry {
  id: string;
  home: { x: number; y: number };
  clan: string;
  role: string;
  homeTerritory: TerritoryId;
  leash: number;
}

const ROSTER: Map<string, NpcRosterEntry> = new Map(
  npcs.map((d) => {
    const homeTerritory = homeTerritoryFor(d);
    return [
      d.id,
      {
        id: d.id,
        home: { x: d.home.x, y: d.home.y },
        clan: d.clan,
        role: d.role,
        homeTerritory,
        leash: territoryLeashFor(d.clan, d.role),
      },
    ];
  }),
);

/** The territory a cat's HOME point belongs to (clan fallback for odd homes). */
export function homeTerritoryFor(def: { id: string; clan: string; role: string }): TerritoryId {
  const d = npcs.find((x) => x.id === def.id);
  if (d) return territoryAt(d.home.x, d.home.y) as TerritoryId;
  if (def.clan === "thunderclan" || def.clan === "windclan" || def.clan === "riverclan" || def.clan === "shadowclan") {
    return def.clan;
  }
  if (def.clan === "kittypet") return "kittypet";
  if (def.clan === "rogue") return "rogue";
  return "unclaimed";
}

/** How far a cat may roam from home (px). Kits/elders/queens stay close. */
export function territoryLeashFor(clan: string, role: string): number {
  const r = role.toLowerCase();
  if (r.includes("kit")) return 260;
  if (r.includes("elder")) return 220;
  if (r.includes("queen")) return 300;
  if (r.includes("medicine")) return 700;
  if (clan === "kittypet") return 340;
  if (clan === "rogue") return 600;
  if (r.includes("deputy") || r.includes("leader")) return 1000;
  return 850; // warriors/apprentices patrol widely but never across the map
}

/** Roster lookup by NPC id (null for anything not in the online world). */
export function npcRoster(id: string): NpcRosterEntry | null {
  return ROSTER.get(id) ?? null;
}

/**
 * Clamp a position into the cat's own ground: first the home TERRITORY (binary
 * search the furthest point along the home→target ray that stays inside), then
 * the leash radius. Mirrors the engine's historical clamp exactly.
 */
export function clampToHomeTerritory(
  home: { x: number; y: number },
  homeTerr: TerritoryId,
  leash: number,
  tx: number,
  ty: number,
): { x: number; y: number } {
  if (territoryAt(tx, ty) !== homeTerr) {
    const rlen = Math.hypot(tx - home.x, ty - home.y) || 1;
    const ux = (tx - home.x) / rlen;
    const uy = (ty - home.y) / rlen;
    let lo = 0;
    let hi = rlen;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (territoryAt(home.x + ux * mid, home.y + uy * mid) === homeTerr) lo = mid;
      else hi = mid;
    }
    const d = lo * 0.92;
    tx = home.x + ux * d;
    ty = home.y + uy * d;
  }
  const dHome = Math.hypot(tx - home.x, ty - home.y) || 1;
  if (dHome > leash) {
    tx = home.x + ((tx - home.x) / dHome) * leash;
    ty = home.y + ((ty - home.y) / dHome) * leash;
  }
  return { x: tx, y: ty };
}

/** Clamp into the map bounds (a cat can never leave the world). */
export function clampToMap(x: number, y: number): { x: number; y: number } {
  const pad = 12;
  return {
    x: Math.max(pad, Math.min(MAP_W * TILE - pad, x)),
    y: Math.max(pad, Math.min(MAP_H * TILE - pad, y)),
  };
}

export interface SanitizeResult {
  states: NpcWire[];
  rejected: { id: string; reason: string }[];
  /** how many positions the server had to pull back (§31) */
  clamped: number;
  /** how many out-of-territory excursions the server allowed with a reason */
  crossing: number;
}

/** Only a legitimate, still-valid crossing claim lets a cat leave its ground. */
function sanctionedCross(claim: NpcCrossClaim | undefined, now: number): boolean {
  if (!claim) return false;
  if (!NPC_CROSS_REASONS.includes(claim.reason)) return false;
  if (!Number.isFinite(claim.until)) return false;
  return claim.until > now && claim.until - now <= NPC_SYNC_MAX_CROSS_MS;
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // strip control characters/newlines: a name is a name, never a message body
  return v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function pickFrom(v: unknown, allowed: readonly string[], fallback: string): string {
  return typeof v === "string" && allowed.includes(v) ? v : fallback;
}

/**
 * The server's authoritative pass over one published batch (§30/§31).
 *
 * A client may send anything; only a snapshot that survives this function is
 * ever stored. Positions are clamped into home territory + leash unless a
 * sanctioned crossing is claimed, poses/AI/movement come from the shared
 * vocabulary, and conversation info is reduced to a display NAME (a client can
 * never push chat text through the sync channel).
 */
export function sanitizeNpcStates(
  raw: readonly unknown[],
  cross: Readonly<Record<string, NpcCrossClaim>>,
  now: number,
  prevSeq?: Readonly<Record<string, number>>,
): SanitizeResult {
  const states: NpcWire[] = [];
  const rejected: { id: string; reason: string }[] = [];
  const seen = new Set<string>();
  let clamped = 0;
  let crossing = 0;

  const list = Array.isArray(raw) ? raw.slice(0, NPC_SYNC_MAX_STATES) : [];
  for (const item of list) {
    if (!item || typeof item !== "object") {
      rejected.push({ id: "?", reason: "not-an-object" });
      continue;
    }
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    const entry = npcRoster(id);
    if (!entry) {
      rejected.push({ id: id || "?", reason: "unknown-npc" });
      continue;
    }
    if (seen.has(id)) {
      rejected.push({ id, reason: "duplicate" });
      continue;
    }
    const x = typeof r.x === "number" ? r.x : NaN;
    const y = typeof r.y === "number" ? r.y : NaN;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      rejected.push({ id, reason: "bad-coords" });
      continue;
    }
    const seq = typeof r.seq === "number" && Number.isFinite(r.seq) ? Math.floor(r.seq) : 0;
    if (prevSeq && prevSeq[id] !== undefined && seq <= prevSeq[id]!) {
      // old/duplicate/out-of-order NPC state: never let it move a cat backward
      rejected.push({ id, reason: "stale-seq" });
      continue;
    }

    // --- territory authority: permitted only while a sanctioned crossing lives
    const claim = cross[id];
    const allowed = sanctionedCross(claim, now);
    const map = clampToMap(x, y);
    let px = map.x;
    let py = map.y;
    if (allowed) {
      crossing++;
      // even a sanctioned excursion stays near home (temporary, bounded)
      const dHome = Math.hypot(px - entry.home.x, py - entry.home.y) || 1;
      const maxOut = entry.leash * 2.2;
      if (dHome > maxOut) {
        px = entry.home.x + ((px - entry.home.x) / dHome) * maxOut;
        py = entry.home.y + ((py - entry.home.y) / dHome) * maxOut;
        clamped++;
      }
    } else {
      const c = clampToHomeTerritory(entry.home, entry.homeTerritory, entry.leash, px, py);
      if (Math.abs(c.x - px) > 0.5 || Math.abs(c.y - py) > 0.5) clamped++;
      px = c.x;
      py = c.y;
    }

    // only an ACCEPTED entry counts as seen: a malformed packet for a cat can
    // never poison the valid one that follows it in the same batch
    seen.add(id);
    const convoWith = cleanText(r.convoWith, 24);
    const denId = cleanText(r.denId, 40);
    const ai = pickFrom(r.ai, NPC_AI_MODES, "idle");
    const movement = pickFrom(r.movement, NPC_MOVEMENTS, "idle");
    states.push({
      id,
      x: px,
      y: py,
      facing: typeof r.facing === "number" && r.facing < 0 ? -1 : 1,
      pose: pickFrom(r.pose, NPC_POSES, "sit"),
      ai,
      movement,
      activity: cleanText(r.activity, 48) || "somewhere in the world",
      denId: denId || null,
      convoWith: convoWith || null,
      seq,
    });
  }
  return { states, rejected, clamped, crossing };
}

/** Prune expired cross claims (the server keeps only live, bounded excursions). */
export function sanitizeCrossMap(
  raw: Readonly<Record<string, NpcCrossClaim>> | undefined,
  now: number,
): Record<string, NpcCrossClaim> {
  const out: Record<string, NpcCrossClaim> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, claim] of Object.entries(raw)) {
    if (!npcRoster(id)) continue;
    if (!claim || typeof claim !== "object") continue;
    if (!sanctionedCross(claim, now)) continue;
    out[id] = { reason: claim.reason, until: claim.until };
  }
  return out;
}

/** Active conversation claims, pruned to live ones for the given moment. */
export function liveBusyClaims(
  raw: readonly NpcBusyClaim[] | undefined,
  now: number,
): NpcBusyClaim[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: NpcBusyClaim[] = [];
  for (const c of raw) {
    if (!c || !npcRoster(c.npcId)) continue;
    if (!(c.until > now)) continue;
    if (seen.has(c.npcId)) continue;
    seen.add(c.npcId);
    out.push({ npcId: c.npcId, name: cleanText(c.name, 24) || "a cat", until: c.until });
  }
  return out;
}

/**
 * Cheap change digest: the authority only publishes when the world visibly
 * moved ("do not send excessive updates"). Rounded positions keep jitter from
 * forcing a packet every 500 ms.
 */
export function npcStatesDigest(states: readonly NpcWire[]): string {
  const parts: string[] = [];
  for (const s of states) {
    parts.push(
      `${s.id}:${Math.round(s.x / 6)},${Math.round(s.y / 6)},${s.facing},${s.pose},${s.ai},${s.activity},${s.convoWith ?? ""}`,
    );
  }
  return parts.join("|");
}
