// §SURVIVAL UNLOCKS — when the story introduces each survival mechanic.
//
// The game's survival model (hunger / energy / health) already exists and is
// unchanged: it drains over time, empty hunger costs health and an empty tank
// forbids running. What this module decides is WHEN Story Mode is allowed to
// switch it on.
//
// Rules (they are the requirement, encoded once so the engine, the HUD and the
// check suites cannot drift apart):
//  - a meter is LIVE only once the story has reached the step that introduces
//    it. Before that it is not merely hidden — the engine does not drain it and
//    applies none of its penalties;
//  - progress is the STORY's, so a refresh, a map change or a house transition
//    can neither unlock a meter early nor switch an unlocked one back off;
//  - each introduction is explained once and then remembered in the save.
//
// It is dependency-free (story ids only) so headless checks can drive it.

import { storySteps } from "./story";

export type SurvivalMeter = "hunger" | "energy" | "health";

export interface SurvivalUnlock {
  /** stable id written into the save (players.survivalSeen) */
  id: string;
  /** the story step that introduces this mechanic */
  stepId: string;
  /** meters revealed with it — the HUD shows exactly these */
  meters: SurvivalMeter[];
  /** heading of the one-time explanation */
  title: string;
  /** what the meter means and how the player interacts with it */
  text: string;
}

/**
 * The introduction points, in story order:
 *
 *  - "First Hunt" (s8) is where Into the Wild first makes the player FEED the
 *    Clan — the warrior code's rule about hunting before eating. Hunger (and
 *    the health consequence that comes with an empty belly) is introduced
 *    there, by Graypaw, at the fresh-kill pile.
 *  - "Battle Training" (s9) is where stamina starts to matter — Whitestorm
 *    drills the apprentices until their paws ache. Energy is introduced there.
 *
 * Everything earlier — the kittypet days, fleeing into the forest, meeting the
 * Clan, being named — is exploration and story, with no survival pressure.
 */
export const SURVIVAL_UNLOCKS: SurvivalUnlock[] = [
  {
    id: "hunger",
    stepId: "s8-hunt-first",
    meters: ["hunger", "health"],
    title: "Feeding the Clan",
    text:
      "The warrior code says hunt before you eat — so now you'll feel your belly. Hunger drains as you run, swim and fight; fresh-kill from the pile, prey you catch, or food in a den fills it again. An empty belly slowly costs you health, which recovers once you're fed.",
  },
  {
    id: "energy",
    stepId: "s9-training",
    meters: ["energy"],
    title: "Strength for the Day",
    text:
      "Training burns strength. Energy drains as you sprint and fight, faster than walking; resting, sleeping in a den and lapping at the water restore it. A cat with an empty tank can't run — pace yourself.",
  },
];

/** Index of a story step id in the chain (-1 when unknown). */
export function storyStepIndexOf(stepId: string): number {
  return storySteps.findIndex((s) => s.id === stepId);
}

/** Has the story reached the step that introduces this mechanic? */
export function unlockReached(u: SurvivalUnlock, step: number): boolean {
  const at = storyStepIndexOf(u.stepId);
  if (at < 0) return false;
  return step >= at;
}

/**
 * Which meters are live at this story step. Story Mode starts with none of
 * them; each unlock can reveal several (hunger carries the health consequence
 * with it). Past the last step everything introduced stays on.
 */
export function unlockedMeters(step: number): Record<SurvivalMeter, boolean> {
  const live: Record<SurvivalMeter, boolean> = { hunger: false, energy: false, health: false };
  for (const u of SURVIVAL_UNLOCKS) {
    if (!unlockReached(u, step)) continue;
    for (const m of u.meters) live[m] = true;
  }
  return live;
}

/**
 * Unlocks the story has reached whose one-time explanation has NOT been shown
 * yet (the ids come from the save). These are exactly the ones to introduce
 * now; anything already introduced never replays.
 */
export function pendingIntros(step: number, seen: string[]): SurvivalUnlock[] {
  const shown = new Set(seen);
  return SURVIVAL_UNLOCKS.filter((u) => unlockReached(u, step) && !shown.has(u.id));
}

/** Every mechanic id (for validating a save's `survivalSeen` list). */
export const SURVIVAL_UNLOCK_IDS: string[] = SURVIVAL_UNLOCKS.map((u) => u.id);
