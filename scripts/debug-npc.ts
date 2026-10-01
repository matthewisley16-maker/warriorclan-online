// temp debug
const { buildAskMenu, npcChatReply } = await import("../src/game/npcChat");
import type { DialogueContext } from "../src/game/dialogue";
const baseCtx = (over: Partial<DialogueContext> = {}): DialogueContext => ({
  mode: "story", storyStep: 6, hour: 9, weather: "clear",
  player: { name: "Rusty", clan: "thunderclan", rank: "apprentice" },
  discovered: [], learned: {}, bonds: {}, talked: {}, facts: [],
  npcActivity: "resting in camp", ...over,
} as DialogueContext);

// A) bluestar ask menu
const menu = buildAskMenu("bluestar", baseCtx());
console.log("bluestar menu:", menu.map((m) => m.id));

// B) bluestar starclan
console.log("bluestar starclan:", JSON.stringify(npcChatReply("bluestar", "Tell me about StarClan.", baseCtx())));

// C) ravenpaw secret open
console.log("ravenpaw open:", JSON.stringify(npcChatReply("ravenpaw", "What happened at Sunningrocks?", baseCtx({ bonds: { ravenpaw: 2 }, storyStep: 15 }))));

// D) distinctness: what do the duplicates look like?
const CAST = ["bluestar", "tigerclaw", "graypaw", "spottedleaf", "yellowfang", "ravenpaw", "sandpaw", "dustpaw", "longtail", "smudge"];
for (const q of ["What do you think about ThunderClan?", "What are you doing?"]) {
  console.log("Q:", q);
  for (const id of CAST) console.log("  ", id, "→", npcChatReply(id, q, baseCtx()).text);
}

// E) roleDenIds for windclan leader/medicine — what does the engine return?
const { roleDenIds } = await import("../src/game/engine");
console.log("wc leader ids:", roleDenIds("Leader", "windclan"));
console.log("wc medicine ids:", roleDenIds("Medicine Cat", "windclan"));
