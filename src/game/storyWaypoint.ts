// §STORY GUIDANCE — "where do I go now?" answered by the story script itself.
//
// Every story step already declares WHAT it wants (a cat to speak with, a place
// to reach, the camp clearing, a border marker, a den to enter, prey to catch).
// This module turns that declaration into ONE concrete world destination plus a
// short imperative line for the objective panel. It is dependency-free (data +
// geometry only) so the engine, the React layer and the headless check suites
// all read the exact same answer — the marker can never point somewhere the
// mission does not actually accept.
//
// Deliberate design points:
//  - the destination comes from the SAME data the staging system uses
//    (STORY_LOCATIONS / STAGED_STEPS), so the waypoint always matches where the
//    step's characters are actually standing;
//  - talk objectives follow the LIVE cat (the resolver returns its npcId, the
//    engine tracks the real position as the cat walks);
//  - "enter" objectives point at the den's real doorway in the world, not at a
//    room-local coordinate;
//  - nothing here invents new quests: destinations are the existing story
//    landmarks, and the trigger conditions used by Game.tsx stay untouched.

import { STAGED_STEPS, STORY_LOCATIONS } from "./storyStaging";
import { TILE, allObjects, npcs } from "./world";
import type { StoryStep } from "./story";

export interface StoryWaypoint {
  /** where to walk, in WORLD pixels */
  x: number;
  y: number;
  /** what the marker is pinned to ("Smudge", "Sunningrocks", "Mothermouth") */
  label: string;
  /** one short imperative line for the objective panel ("Find Graypaw") */
  instruction: string;
  /** how close counts as "arrived" (the objective's own accept radius) */
  radius: number;
  /** "npc" = a live cat whose position the marker keeps following */
  kind: "npc" | "place";
  /** npc id for "npc" targets — the engine follows the real cat */
  npcId?: string;
}

/** Which map area satisfies which "visit" objective (mirrors Game.tsx). */
const AREA_LOCATIONS: Record<string, string> = {
  tallpines: "forest-edge",
  sandy: "sandy-hollow",
  fourtrees: "fourtrees",
  sunningrocks: "sunningrocks",
};

/** ThunderClan camp centre — the same point the "camp" objective tests against. */
export const CAMP_POINT = { x: 89 * TILE, y: 86 * TILE };

/** The in-world name of an NPC id (never a raw id in the HUD). */
export function npcDisplayName(npcId: string): string {
  return npcs.find((n) => n.id === npcId)?.name ?? npcId;
}

/**
 * Where the den that satisfies an "enter" objective actually stands in the
 * world: the walk-in doorway on the building's south face (the same spot the
 * player must reach to trigger the transition), never a room-local coordinate.
 */
export function interiorEntrancePoint(interiorId: string): { x: number; y: number; label: string } | null {
  const o = allObjects.find((ob) => ob.interior === interiorId);
  if (!o) return null;
  return { x: o.x, y: o.y + o.h / 2, label: o.label ?? "the den" };
}

/** The step's staged MAIN character — the cat the scene is built around. */
function stagedMain(stepId: string) {
  return STAGED_STEPS[stepId]?.npcs.find((n) => n.priority === "main") ?? null;
}

export interface StoryWaypointContext {
  /** live world position of an NPC (engine) — falls back to the staging mark */
  npcPos?: (npcId: string) => { x: number; y: number } | null;
  /** nearest live prey to the player (hunt objectives without a staged scene) */
  nearestPrey?: (from: { x: number; y: number }) => { x: number; y: number } | null;
  /** the player's current outdoor position (used to pick a hunt target) */
  from?: { x: number; y: number };
}

/**
 * Resolve the ACTIVE step into the one destination the player should walk to.
 * Returns null only for a step that genuinely has no place to go (an unknown
 * objective kind), in which case the HUD simply shows the objective text.
 */
export function resolveStoryWaypoint(
  step: StoryStep | undefined | null,
  ctx: StoryWaypointContext = {},
): StoryWaypoint | null {
  if (!step) return null;
  const obj = step.objective;

  switch (obj.kind) {
    case "talk": {
      const staged = STAGED_STEPS[step.id]?.npcs.find((n) => n.npcId === obj.targetNpc);
      const name = npcDisplayName(obj.targetNpc);
      const live = ctx.npcPos?.(obj.targetNpc) ?? null;
      const at = live ?? (staged ? { x: staged.x, y: staged.y } : null);
      if (!at) return null;
      return {
        ...at,
        label: name,
        instruction: `Find ${name}`,
        radius: 110,
        kind: "npc",
        npcId: obj.targetNpc,
      };
    }
    case "visit": {
      const key = AREA_LOCATIONS[obj.areaId];
      const loc = key ? STORY_LOCATIONS[key] : undefined;
      if (!loc) return null;
      return { x: loc.x, y: loc.y, label: loc.label, instruction: `Head to ${loc.label}`, radius: 150, kind: "place" };
    }
    case "camp": {
      const loc = STORY_LOCATIONS["tc-clearing"];
      return {
        x: CAMP_POINT.x,
        y: CAMP_POINT.y,
        label: loc?.label ?? "ThunderClan camp",
        instruction: "Go to the camp entrance",
        radius: Math.max(120, obj.radius),
        kind: "place",
      };
    }
    case "patrol": {
      const loc = STORY_LOCATIONS[obj.marker];
      if (!loc) return null;
      return { x: loc.x, y: loc.y, label: loc.label, instruction: `Go to the ${loc.label.toLowerCase()}`, radius: 140, kind: "place" };
    }
    case "enter": {
      const door = interiorEntrancePoint(obj.interior);
      if (!door) return null;
      return { x: door.x, y: door.y, label: door.label, instruction: `Enter ${door.label}`, radius: 130, kind: "place" };
    }
    case "hunt": {
      // prey is not a fixed place: guide the player to the hunting ground the
      // step stages (the fresh-kill pile where the mentor waits), or — when the
      // step stages no scene — to the nearest live prey right now.
      const scene = STAGED_STEPS[step.id]?.scene ?? null;
      const count = step.count ?? obj.prey;
      if (scene) {
        return {
          x: scene.x,
          y: scene.y,
          label: scene.label,
          instruction: `Catch ${count} prey and bring them back`,
          radius: Math.max(140, scene.r),
          kind: "place",
        };
      }
      const from = ctx.from ?? { x: 0, y: 0 };
      const prey = ctx.nearestPrey?.(from) ?? null;
      if (prey) return { ...prey, label: "Prey", instruction: `Catch ${count} prey`, radius: 150, kind: "place" };
      const main = stagedMain(step.id);
      if (main) {
        return {
          x: main.x,
          y: main.y,
          label: main.label,
          instruction: `Hunt for the Clan (${count} prey)`,
          radius: 150,
          kind: "npc",
          npcId: main.npcId,
        };
      }
      return null;
    }
  }
}
