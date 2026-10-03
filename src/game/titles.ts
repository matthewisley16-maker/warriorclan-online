// §27 cosmetic titles — descriptive profile achievements only (no gameplay
// power, nothing purchasable). Earned status derives from data the client
// already has (discoveries, quests, skills, streaks, XP, story completion).
// Dependency-free so static checks can import it headless.

export interface TitleDef {
  id: string;
  label: string;
  how: string;
}

export const TITLES: TitleDef[] = [
  { id: "explorer", label: "the Explorer", how: "Discover 5 areas" },
  { id: "hunter", label: "the Hunter", how: "Hunting skill 3" },
  { id: "tracker", label: "the Tracker", how: "Discover 9 areas" },
  { id: "patrol-cat", label: "Patrol Cat", how: "Finish 3 quests" },
  { id: "social-cat", label: "Social Cat", how: "Get to know several cats" },
  { id: "clan-helper", label: "Clan Helper", how: "Finish 6 quests" },
  { id: "devoted", label: "the Devoted", how: "3-day activity streak" },
  { id: "veteran", label: "Veteran Warrior", how: "Reach 300 XP" },
  { id: "storyteller", label: "the Storyteller", how: "Complete Into the Wild" },
];

export const TITLE_IDS: string[] = TITLES.map((t) => t.id);

export function titleLabel(id: string | undefined): string | undefined {
  return TITLES.find((t) => t.id === id)?.label;
}

/** The data a player row needs to derive earned titles. */
export interface TitleSource {
  discoveredCount?: number;
  questsCount?: number;
  npcTalkedCount?: number;
  streak?: number;
  xp?: number;
  huntSkill?: number;
  storyStep?: number;
}

export function earnedTitleIds(p: TitleSource): string[] {
  const earned: string[] = [];
  if ((p.discoveredCount ?? 0) >= 5) earned.push("explorer");
  if ((p.huntSkill ?? 0) >= 3) earned.push("hunter");
  if ((p.discoveredCount ?? 0) >= 9) earned.push("tracker");
  if ((p.questsCount ?? 0) >= 3) earned.push("patrol-cat");
  if ((p.npcTalkedCount ?? 0) >= 3) earned.push("social-cat");
  if ((p.questsCount ?? 0) >= 6) earned.push("clan-helper");
  if ((p.streak ?? 0) >= 3) earned.push("devoted");
  if ((p.xp ?? 0) >= 300) earned.push("veteran");
  if ((p.storyStep ?? 0) >= 16) earned.push("storyteller");
  return earned;
}
