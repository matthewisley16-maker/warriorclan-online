// WarriorCatsRPG — quests and codex data for version 1.

export interface QuestDef {
  id: string;
  title: string;
  hint: string;
}

/** Version 1 objectives: learn the camp, meet the Clan, walk the territory. */
export const quests: QuestDef[] = [
  {
    id: "enter-camp",
    title: "Enter the ThunderClan camp",
    hint: "Follow the dirt trail north through the gorse tunnel.",
  },
  {
    id: "meet-bluestar",
    title: "Speak with Bluestar beneath Tallrock",
    hint: "The Clan leader waits by the great rock at the head of the clearing.",
  },
  {
    id: "meet-spottedleaf",
    title: "Meet Spottedleaf in the medicine den",
    hint: "Her den is the bramble-screened crevice east of Tallrock.",
  },
  {
    id: "meet-graypaw",
    title: "Make friends with Graypaw",
    hint: "The gray apprentice is eager to show you around.",
  },
  {
    id: "visit-nursery",
    title: "Peek into the nursery",
    hint: "The queens and kits den in the bramble at the west of camp.",
  },
  {
    id: "visit-elders",
    title: "Listen to the elders",
    hint: "The ivy-draped log at the west of the clearing.",
  },
  {
    id: "explore-territory",
    title: "Explore ThunderClan territory",
    hint: "Visit Sunningrocks, Fourtrees, the Sandy Hollow, and Snakerocks.",
  },
  {
    id: "fresh-kill",
    title: "Take prey from the fresh-kill pile",
    hint: "A growing warrior needs feeding. The pile sits at the clearing's heart.",
  },
];

/** Objects / NPCs whose interaction completes a quest. */
export const questTriggerMap: Record<string, string> = {
  "enter-camp": "entrance",
  "meet-bluestar": "npc:bluestar",
  "meet-spottedleaf": "npc:spottedleaf",
  "meet-graypaw": "npc:graypaw",
  "visit-nursery": "nursery",
  "visit-elders": "elders-den",
  "explore-territory": "explore-territory",
  "fresh-kill": "fresh-kill",
};
