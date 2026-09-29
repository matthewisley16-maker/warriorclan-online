// WarriorCatsRPG — Book 1 ("Into the Wild") character database.
//
// This file is the CANON-FIRST source of truth for every named character:
// rank, age band, personality, relationships, mentor/apprentice links,
// knowledge flags and when each cat exists in the Story Mode timeline.
// It only feeds the dialogue + availability systems — the visual roster,
// homes and schedules stay in world.ts.
//
// CANON RULES (Into the Wild era, before Firestar's rise):
//  - Redtail is deputy at the start of the book.
//  - Tigerclaw is a senior WARRIOR (he becomes deputy only after Redtail's
//    death, and only after Lionheart — who in turn got the post first).
//  - Firepaw, Graypaw, Ravenpaw, Dustpaw and Sandpaw are all apprentices.
//  - Yellowfang starts the book as a ShadowClan cat wandering ThunderClan
//    ground and is only later fed and sheltered by ThunderClan.
//  - Rusty is a kittypet until Bluestar takes him in.

export type AgeBand = "kit" | "apprentice" | "young-warrior" | "warrior" | "senior-warrior" | "elder" | "leader";

/**
 * Knowledge categories. An NPC only speaks about a topic when it has the
 * matching flag(s) — and every flag can be LEARNED per-NPC at runtime
 * (never globally unlocked). Twolegplace cats start with none of the
 * Clan/StarClan categories; Clan cats start with their Clan categories.
 */
export type KnowledgeFlag =
  | "clan-life" // ranks, patrols, fresh-kill, dens — any Clan resident
  | "warrior-code"
  | "starclan" // knows of StarClan and its role
  | "medicine" // herbs + healing
  | "medicine-spirit" // deeper: omens, Moonstone, prophecies
  | "thunderclan"
  | "riverclan"
  | "windclan"
  | "shadowclan"
  | "prophecy" // "fire alone can save our Clan" — held, not broadcast
  | "sunningrocks-truth" // Ravenpaw's secret about Redtail's death
  | "twolegplace"; // knows kittypet life / the Twoleg neighborhood

export type Stance =
  | "warm" // friendly to the player from the start
  | "curious" // interested, probing
  | "wary" // reserved until the player proves themselves
  | "hostile" // open disdain (later books aside: Book 1 prejudice)
  | "gruff"; // brusque to everyone, softening only with trust

export interface CharacterProfile {
  id: string;
  name: string;
  clan: "thunderclan" | "riverclan" | "windclan" | "shadowclan" | "kittypet" | "rogue";
  /** Book 1 role/rank — NOT later-book ranks. */
  rank: string;
  age: AgeBand;
  appearance: string;
  personality: string;
  /** dialogue texture hints used by the voice banks */
  voice: {
    /** overall stance toward the player at the story's start */
    stance: Stance;
    /** short speech quirks the dialogue banks lean on */
    style: string[];
    /** topics this cat steers conversations toward */
    topics: string[];
  };
  /** mentor ↔ apprentice links, Book 1 era */
  mentor?: string; // name of this cat's former mentor (flavor)
  apprentice?: string; // this cat currently mentors (Book 1)
  relationships?: string[]; // notable ties, e.g. "mother of Graystripe"
  knowledge: KnowledgeFlag[];
  /**
   * Story Mode availability: the cat exists from step `from` (0 = always)
   * and either leaves the world at `until` (exclusive) or stays forever.
   * Availability beyond a story death uses the timeline steps in story.ts.
   */
  storyFrom?: number;
  storyUntil?: number;
  /** false = this cat only exists in Story Mode (e.g. Redtail pre-death) */
  inOnline?: boolean;
}

// ---------------------------------------------------------------------------
// ThunderClan — Book 1 roster
// ---------------------------------------------------------------------------

export const THUNDERCLAN: CharacterProfile[] = [
  {
    id: "bluestar",
    name: "Bluestar",
    clan: "thunderclan",
    rank: "Leader",
    age: "leader",
    appearance: "Pale blue-gray she-cat, muzzle touched with silver, blue eyes.",
    personality:
      "Calm, authoritative and observant. Carries old grief like a stone under her tongue. Weighs every word; expects the code to be lived, not recited.",
    voice: {
      stance: "curious",
      style: ["measured", "uses short declaratives", "refers to the Clan as 'the Clan', never 'us' when deciding"],
      topics: ["the Clan's safety", "the warrior code", "training", "borders", "StarClan's silence", "the fire prophecy"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "medicine-spirit", "prophecy", "thunderclan", "riverclan", "windclan", "shadowclan"],
  },
  {
    id: "lionheart",
    name: "Lionheart",
    clan: "thunderclan",
    rank: "Warrior",
    age: "senior-warrior",
    appearance: "Massive golden tabby, amber eyes, broad shoulders.",
    personality:
      "Noble, honorable and devoted to duty. A mentor's patience with the young, a warrior's bluntness with fools. Believes the code is ThunderClan's spine.",
    voice: {
      stance: "wary",
      style: ["formal", "encouraging to apprentices", "quotes the code naturally"],
      topics: ["honor", "training", "mentoring", "border duty", "the code"],
    },
    apprentice: "graypaw", // Lionheart mentors Graypaw in Book 1
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan", "riverclan", "shadowclan"],
  },
  {
    id: "tigerclaw",
    name: "Tigerclaw",
    clan: "thunderclan",
    rank: "Warrior",
    age: "senior-warrior",
    appearance: "Big dark brown tabby, unusually long front claws, amber eyes.",
    personality:
      "Publicly the perfect senior warrior: disciplined, commanding, seemingly loyal. Privately ambitious and coldly calculating — but he shares that with no one, and never casually.",
    voice: {
      stance: "hostile",
      style: ["blunt", "short sentences", "finishes with a warning", "calls outsiders 'kittypet' before any name"],
      topics: ["strength", "discipline", "borders", "Ravenpaw's account of Sunningrocks", "who deserves a warrior name"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan", "riverclan", "shadowclan", "sunningrocks-truth"],
    // Tigerclaw's private knowledge must NEVER surface in dialogue: the
    // dialogue system treats sunningrocks-truth as held-but-unspoken.
  },
  {
    id: "redtail",
    name: "Redtail",
    clan: "thunderclan",
    rank: "Deputy",
    age: "young-warrior",
    appearance: "Small tortoiseshell tom with a distinctive ginger tail.",
    personality:
      "Brave, decisive and respected despite his size. Leads from the front; trusted by every patrol.",
    voice: {
      stance: "warm",
      style: ["efficient", "patrol-minded", "friendly authority"],
      topics: ["patrols", "Sunningrocks disputes", "the Clan's strength"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan", "riverclan"],
    // Redtail dies at Sunningrocks very early in the Book 1 timeline.
    // story.ts step index 1 = the Sunningrocks ambush; after that he is gone.
    storyFrom: 0,
    storyUntil: 1,
    inOnline: true, // alive and well in the persistent Book 1-era world
  },
  {
    id: "whitestorm",
    name: "Whitestorm",
    clan: "thunderclan",
    rank: "Warrior",
    age: "senior-warrior",
    appearance: "Thick-furred white tom, yellow eyes, calm stance.",
    personality:
      "Steady, fair and quietly respected. Doesn't need volume to be obeyed. Gentle with new cats; hard on sloppiness.",
    voice: {
      stance: "curious",
      style: ["level", "measured humor", "exercises patience before judgment"],
      topics: ["camp life", "patrol craft", "hunting technique", "the Clan's welfare"],
    },
    apprentice: "sandpaw", // Whitestorm mentors Sandpaw in Book 1
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan", "riverclan", "windclan", "shadowclan"],
  },
  {
    id: "spottedleaf",
    name: "Spottedleaf",
    clan: "thunderclan",
    rank: "Medicine cat",
    age: "young-warrior",
    appearance: "Young dark tortoiseshell she-cat with amber eyes, small and lithe.",
    personality:
      "Gentle, attentive and quietly spiritual. Notices a limp before its owner admits it. Takes omens seriously and speaks of them carefully.",
    voice: {
      stance: "warm",
      style: ["soft", "herbal metaphors", "asks how you feel before anything else"],
      topics: ["herbs", "healing", "dreams", "StarClan's signs", "the Clan's health"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "medicine", "medicine-spirit", "prophecy", "thunderclan"],
  },
  {
    id: "graypaw",
    name: "Graypaw",
    clan: "thunderclan",
    rank: "Apprentice",
    age: "apprentice",
    appearance: "Long-haired solid gray tom, yellow eyes, broad for his age.",
    personality:
      "Playful, warm and easily distracted by food. The first to befriend Rusty. Brave in a scrap, terrible at sitting still.",
    voice: {
      stance: "warm",
      style: ["chatty", "jokes about food", "enthusiastic interjections", "self-deprecating"],
      topics: ["training", "fresh-kill", "apprentice races", "his mentor", "the new kittypet"],
    },
    mentor: "Lionheart",
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "ravenpaw",
    name: "Ravenpaw",
    clan: "thunderclan",
    rank: "Apprentice",
    age: "apprentice",
    appearance: "Small black tom with a white chest and white tail-tip.",
    personality:
      "Jumpy, honest and eager to prove himself. Carries the memory of Sunningrocks like thorns in his pad and shrinks whenever Tigerclaw is near.",
    voice: {
      stance: "curious",
      style: ["hesitant", "trails off mid-sentence", "flinches at loud noises", "quieter around Tigerclaw"],
      topics: ["fear", "the battle at Sunningrocks", "wanting to be brave", "Tigerclaw's moods"],
    },
    mentor: "Tigerclaw", // Tigerclaw mentors Ravenpaw in Book 1
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan", "sunningrocks-truth"],
  },
  {
    id: "dustpaw",
    name: "Dustpaw",
    clan: "thunderclan",
    rank: "Apprentice",
    age: "apprentice",
    appearance: "Dark brown tabby tom, amber eyes.",
    personality:
      "Competitive and sharp-tongued. Mocks kittypets because it wins him laughter, and wants to be seen as the best apprentice in the den.",
    voice: {
      stance: "hostile",
      style: ["sneering", "short taunts", "echoes Tigerclaw's opinions"],
      topics: ["mocking the new kittypet", "training scores", "Tigerclaw's praise"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "sandpaw",
    name: "Sandpaw",
    clan: "thunderclan",
    rank: "Apprentice",
    age: "apprentice",
    appearance: "Pale ginger she-cat, green eyes.",
    personality:
      "Feisty and competitive with a fighter's pride. Wants to be the best and resents shortcuts. Warms only when respect is earned.",
    voice: {
      stance: "hostile",
      style: ["quick and pointed", "challenges first, apologizes last", "hates being compared to anyone"],
      topics: ["hunting contests", "proving herself", "the kittypet problem"],
    },
    mentor: "Whitestorm",
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "longtail",
    name: "Longtail",
    clan: "thunderclan",
    rank: "Warrior",
    age: "young-warrior",
    appearance: "Pale brown tabby with black stripes and a long tail.",
    personality:
      "Proud and aggressive, hungry for a first great deed. Openly challenges the kittypet's place in the Clan.",
    voice: {
      stance: "hostile",
      style: ["boastful", "confrontational", "brings up the nursery fight"],
      topics: ["his own prowess", "the fight with Rusty", "proving himself"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "darkstripe",
    name: "Darkstripe",
    clan: "thunderclan",
    rank: "Warrior",
    age: "warrior",
    appearance: "Sleek dark gray tabby, yellow eyes.",
    personality:
      "Sly and watchful. He orbits Tigerclaw, agrees with him loudly and suspects everyone quietly. No love for outsiders.",
    voice: {
      stance: "hostile",
      style: ["smooth", "implies more than he says", "defers to Tigerclaw"],
      topics: ["loyalty", "Tigerclaw's judgment", "cats that don't belong"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "yellowfang",
    name: "Yellowfang",
    clan: "shadowclan",
    rank: "Medicine cat of ShadowClan (wandering)",
    age: "elder",
    appearance: "Dark gray she-cat with a broad flattened face, orange eyes, matted fur and old scars.",
    personality:
      "Gruff, sarcastic and impossible to impress. Hides deep loyalty and old grief behind a wall of insults. Hunger makes her sharp; kindness embarrasses her.",
    voice: {
      stance: "gruff",
      style: ["barks short retorts", "complains about her stomach", "rare warmth hidden in an insult"],
      topics: ["food", "aches", "ShadowClan's wrongs", "not owing anyone anything"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "medicine", "medicine-spirit", "shadowclan", "thunderclan"],
    // Timeline: Yellowfang appears once she is found at Snakerocks in the
    // Book 1 sequence — the story step gates her arrival.
    storyFrom: 11,
  },
  // --- queens / elders / background warriors: a living camp ---
  {
    id: "frostfur",
    name: "Frostfur",
    clan: "thunderclan",
    rank: "Queen",
    age: "warrior",
    appearance: "Pure white she-cat with blue eyes.",
    personality: "Watchful and protective of the nursery; kind once you're inside its shade, ice outside it.",
    voice: { stance: "wary", style: ["maternal", "hushed voice", "asks who let you in"], topics: ["the kits", "camp safety"] },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "brindleface",
    name: "Brindleface",
    clan: "thunderclan",
    rank: "Queen",
    age: "warrior",
    appearance: "Pale gray tabby she-cat with green eyes.",
    personality: "Warm-hearted chatterbox of the nursery; knows every cat's appetite.",
    voice: { stance: "warm", style: ["chatty", "offers to feed you"], topics: ["kits", "fresh-kill", "camp gossip"] },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "goldenflower",
    name: "Goldenflower",
    clan: "thunderclan",
    rank: "Queen",
    age: "warrior",
    appearance: "Pale ginger she-cat.",
    personality: "Calm, capable, unafraid to remind warriors to wash their paws before visiting the nursery.",
    voice: { stance: "wary", style: ["firm but fair", "practical"], topics: ["the kits", "warriors behaving"] },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "willowpelt",
    name: "Willowpelt",
    clan: "thunderclan",
    rank: "Queen",
    age: "warrior",
    appearance: "Very pale gray-blue she-cat with unusual blue eyes.",
    personality: "Soft-spoken but fiercely protective; her warmth is reserved for the nursery and those who respect it.",
    voice: { stance: "wary", style: ["hushed", "gentle warnings"], topics: ["the kits", "camp safety", "her old hunting days"] },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "speckletail",
    name: "Speckletail",
    clan: "thunderclan",
    rank: "Queen",
    age: "elder",
    appearance: "Pale tabby she-cat, oldest nursery resident.",
    personality: "Sharp-eared matriarch; remembers every cat's mentor's mentor.",
    voice: { stance: "gruff", style: ["snorts", "corrects your memories of the Clan"], topics: ["the past", "how things used to be"] },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "smallear",
    name: "Smallear",
    clan: "thunderclan",
    rank: "Elder",
    age: "elder",
    appearance: "Gray tom with small ears.",
    personality: "Grumpy critic of young cats, secretly delighted when one visits his den.",
    voice: { stance: "gruff", style: ["grumbles", "hearing jokes", "annotates every story"], topics: ["old battles", "bad apprentices", "aches"] },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "patchpelt",
    name: "Patchpelt",
    clan: "thunderclan",
    rank: "Elder",
    age: "elder",
    appearance: "Small black-and-white tom.",
    personality: "Easygoing storyteller who falls asleep mid-tale and never minds.",
    voice: { stance: "warm", style: ["rambles", "falls asleep mid-sentence"], topics: ["tales", "old friends", "the forest's history"] },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "halftail",
    name: "Halftail",
    clan: "thunderclan",
    rank: "Elder",
    age: "elder",
    appearance: "Mottled dark brown tabby with a stump of a tail.",
    personality: "Blunt veteran who lost his tail to a Twoleg trap; warns about anything with teeth or wheels.",
    voice: { stance: "gruff", style: ["snaps then relents", "safety lectures"], topics: ["traps", "thunderpaths", "old hunts"] },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "one-eye",
    name: "One-eye",
    clan: "thunderclan",
    rank: "Elder",
    age: "elder",
    appearance: "Mottled gray she-cat with one clouded eye.",
    personality: "Quiet, wise, misses nothing — she hears the parts of camp you think are private.",
    voice: { stance: "wary", style: ["whispered asides", "startlingly accurate observations"], topics: ["camp secrets", "hearing things"] },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "dappletail",
    name: "Dappletail",
    clan: "thunderclan",
    rank: "Elder",
    age: "elder",
    appearance: "Lovely tortoiseshell she-cat with dappled coat.",
    personality: "Gentle and fond of apprentices, tells the best nursery stories.",
    voice: { stance: "warm", style: ["melodic", "draws out details"], topics: ["stories", "kits", "the river in leaf-bare"] },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "runningwind",
    name: "Runningwind",
    clan: "thunderclan",
    rank: "Warrior",
    age: "warrior",
    appearance: "Light brown tabby, wiry and fast.",
    personality: "Restless sprinter who prefers doubling the border to sitting still.",
    voice: { stance: "curious", style: ["breathless", "always half-departing"], topics: ["running", "patrols", "moor rabbits"] },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "mousefur",
    name: "Mousefur",
    clan: "thunderclan",
    rank: "Warrior",
    age: "warrior",
    appearance: "Small brown she-cat.",
    personality: "Cranky perfectionist; patrols are either done properly or done twice.",
    voice: { stance: "wary", style: ["clipped", "complains about everything"], topics: ["patrol discipline", "lazy cats", "prey sizes"] },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "swiftbreeze",
    name: "Swiftbreeze",
    clan: "thunderclan",
    rank: "Queen",
    age: "senior-warrior",
    appearance: "Calico she-cat with patches of ginger, black and white.",
    personality: "Former huntress, now nursery anchor; jokes to hide the worry of a mother.",
    voice: { stance: "warm", style: ["playful", "deflects worry with humor"], topics: ["kits", "old hunts", "wind from the moor"] },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  {
    id: "adderfang",
    name: "Adderfang",
    clan: "thunderclan",
    rank: "Elder",
    age: "elder",
    appearance: "Brown tabby with yellow eyes.",
    personality: "Grizzled warrior turned elder, tests apprentices with riddles from old battles.",
    voice: { stance: "gruff", style: ["growls softly", "quizzes the young"], topics: ["old wars", "the code's history"] },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan"],
  },
  // --- the protagonist cat of Book 1, as an NPC ---
  {
    id: "rusty",
    name: "Rusty",
    clan: "kittypet",
    rank: "Kittypet (Twolegplace)",
    age: "apprentice",
    appearance: "Bright flame-colored ginger tom, green eyes, thick coat.",
    personality:
      "Curious and restless. He dreams of the forest beyond the garden fence and asks questions he shouldn't. Loyal to Smudge, hungry for more than Twoleg food.",
    voice: {
      stance: "warm",
      style: ["eager", "asks about everything", "defends Smudge"],
      topics: ["the forest", "hunting", "what 'StarClan' could possibly be", "life with Twolegs"],
    },
    // Rusty only exists as an NPC in the ONLINE world; in Story Mode the
    // PLAYER is the Rusty/Firepaw of the narrative.
    knowledge: ["twolegplace", "clan-life"],
    inOnline: true,
  },
];

// ---------------------------------------------------------------------------
// Twolegplace — knowledge-poor by design
// ---------------------------------------------------------------------------

export const TWOLEGPLACE: CharacterProfile[] = [
  {
    id: "smudge",
    name: "Smudge",
    clan: "kittypet",
    rank: "Kittypet (Rusty's friend)",
    age: "apprentice",
    appearance: "Black-and-white tom, chunky and well-fed.",
    personality:
      "Rusty's best friend: comfortable, cautious, endlessly curious about the forest from a safe distance. Loves rumors; repeats Henry's as fact.",
    voice: {
      stance: "warm",
      style: ["chatty", "repeats rumors", "worries about Twolegs locking cat doors"],
      topics: ["food bowls", "Henry's tall tales", "Rusty's recklessness", "the scary forest"],
    },
    // The critical Book 1 rule: Smudge has NO Clan or StarClan knowledge.
    knowledge: ["twolegplace"],
  },
  {
    id: "princess",
    name: "Princess",
    clan: "kittypet",
    rank: "Kittypet (Rusty's sister)",
    age: "apprentice",
    appearance: "Light brown tabby she-cat with white chest and paws.",
    personality:
      "Refined, sheltered and genuinely sweet. Worries about her brother in that scary forest. Knows her own garden and nothing beyond it.",
    voice: {
      stance: "warm",
      style: ["soft-spoken", "worries aloud", "fragile confidence"],
      topics: ["grooming", "her Twolegs", "Rusty's safety", "birds on the fence"],
    },
    knowledge: ["twolegplace"],
  },
  // --- the rest of the neighborhood: every kittypet a different life ---
  {
    id: "henry",
    name: "Henry",
    clan: "kittypet",
    rank: "Kittypet (garden wall king)",
    age: "elder",
    appearance: "Plump tabby with a torn ear he exaggerates into a battle scar.",
    personality:
      "The street's storyteller and champion exaggerator. His tales of the forest grow one fox scarier every retelling.",
    voice: { stance: "curious", style: ["grandiose", "repeats his own rumors", "names himself in the third person"], topics: ["his fence-jump record", "forest horrors", "Twoleg dinner times"] },
    knowledge: ["twolegplace"],
  },
  {
    id: "marmalade",
    name: "Marmalade",
    clan: "kittypet",
    rank: "Kittypet (top cat of the street)",
    age: "warrior",
    appearance: "Bright orange tabby with a swaggering walk.",
    personality:
      "Self-appointed king of the street. Patrols the fences like a border and treats every stranger as a trespasser.",
    voice: { stance: "wary", style: ["boastful", "territory talk", "street politics"], topics: ["fence boundaries", "the fox incident", "who owns which garden"] },
    knowledge: ["twolegplace"],
  },
  {
    id: "biscuit",
    name: "Biscuit",
    clan: "kittypet",
    rank: "Kittypet (flowerbed napper)",
    age: "warrior",
    appearance: "Cream-and-ginger bicolor, always half-asleep.",
    personality:
      "Sweet, sleepy, food-motivated. The gentlest cat on the street and the hardest to wake.",
    voice: { stance: "warm", style: ["drowsy", "dream-talk", "food first"], topics: ["naps", "crumbs", "dreams about mice"] },
    knowledge: ["twolegplace"],
  },
  {
    id: "ginger",
    name: "Ginger",
    clan: "kittypet",
    rank: "Kittypet (street walker)",
    age: "warrior",
    appearance: "Ginger she-cat with a tidy white bib.",
    personality:
      "Practical motherly type; walks the pavement circuit daily and knows every cat's business.",
    voice: { stance: "curious", style: ["matronly", "schedules", "scent-nosed judgment"], topics: ["daily walks", "Twoleg habits", "how you smell of pine"] },
    knowledge: ["twolegplace"],
  },
  {
    id: "smokey",
    name: "Smokey",
    clan: "kittypet",
    rank: "Kittypet (car-roof philosopher)",
    age: "senior-warrior",
    appearance: "Dusty gray tom with slow-blinking amber eyes.",
    personality:
      "Unhurried observer of the street. Speaks rarely, notices everything, considers roofs superior to forests.",
    voice: { stance: "wary", style: ["slow", "lapidary", "car-warmth metaphors"], topics: ["warm roofs", "the forest at night", "patience"] },
    knowledge: ["twolegplace"],
  },
  {
    id: "fluffy",
    name: "Fluffy",
    clan: "kittypet",
    rank: "Kittypet (window watcher)",
    age: "apprentice",
    appearance: "Small white Persian-type with a huge plume of a tail.",
    personality:
      "Kept close to her Twolegs and desperate to prove she isn't scared of anything. Watches the forest through glass.",
    voice: { stance: "curious", style: ["quick questions", "tail-puff bravado"], topics: ["the window view", "Rusty's departure", "things she isn't afraid of"] },
    knowledge: ["twolegplace"],
  },
];

// ---------------------------------------------------------------------------
// RiverClan — Book 1 roster
// ---------------------------------------------------------------------------

export const RIVERCLAN: CharacterProfile[] = [
  {
    id: "crookedstar",
    name: "Crookedstar",
    clan: "riverclan",
    rank: "Leader",
    age: "leader",
    appearance: "Huge light brown tabby with a twisted jaw and green eyes.",
    personality:
      "Patient and confident, with old sorrow folded behind his crooked smile. Believes the river provides for those who work with it.",
    voice: {
      stance: "wary",
      style: ["calm authority", "river metaphors", "measures intruders before speaking"],
      topics: ["the river", "fishing", "Sunningrocks", "RiverClan pride"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "riverclan", "thunderclan", "windclan", "shadowclan"],
  },
  {
    id: "oakheart",
    name: "Oakheart",
    clan: "riverclan",
    rank: "Deputy",
    age: "senior-warrior",
    appearance: "Massive dark ginger tabby, green eyes.",
    personality:
      "Bold, professional, unbothered by ThunderClan bluster. Fights like water: patient, then overwhelming.",
    voice: {
      stance: "wary",
      style: ["confident", "taunting without heat", "praises the river"],
      topics: ["Sunningrocks", "fishing", "the border", "RiverClan strength"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "riverclan", "thunderclan"],
  },
  {
    id: "leopardfur",
    name: "Leopardfur",
    clan: "riverclan",
    rank: "Warrior",
    age: "warrior",
    appearance: "Golden spotted tabby she-cat, green eyes.",
    personality:
      "Fierce, elegant, sharp as a pike's tooth. Hunts like she fights: perfectly.",
    voice: {
      stance: "hostile",
      style: ["cutting", "graceful contempt", "dare-questions"],
      topics: ["hunting", "the river's bounty", "border-crossers"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "riverclan", "thunderclan"],
  },
  {
    id: "silverstream",
    name: "Silverstream",
    clan: "riverclan",
    rank: "Warrior",
    age: "young-warrior",
    appearance: "Slender silver tabby she-cat, blue eyes.",
    personality:
      "Bright, curious, enchanted by stories of other Clans. Dangerously friendly for a border patrol cat.",
    voice: {
      stance: "curious",
      style: ["playful", "asks more than she answers", "sparkles"],
      topics: ["the river at dawn", "other Clans' customs", "adventure"],
    },
    relationships: ["daughter of Crookedstar"],
    knowledge: ["clan-life", "warrior-code", "starclan", "riverclan", "thunderclan"],
  },
];

// ---------------------------------------------------------------------------
// WindClan — Book 1 roster
// ---------------------------------------------------------------------------

export const WINDCLAN: CharacterProfile[] = [
  {
    id: "tallstar",
    name: "Tallstar",
    clan: "windclan",
    rank: "Leader",
    age: "leader",
    appearance: "Black-and-white tom with a very long thin tail and small frame.",
    personality:
      "Honorable, wander-lusting, fair-minded. Speaks for the moor but thinks like a traveler.",
    voice: {
      stance: "curious",
      style: ["measured warmth", "wind-and-speed metaphors", "asks where you've come from"],
      topics: ["the moor", "running", "the Gathering", "far places"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "windclan", "thunderclan", "riverclan", "shadowclan"],
  },
  {
    id: "mudclaw",
    name: "Mudclaw",
    clan: "windclan",
    rank: "Warrior",
    age: "warrior",
    appearance: "Dark brown tabby tom, amber eyes.",
    personality:
      "Ambitious and prickly about borders; believes the moor should be run tighter than Tallstar runs it.",
    voice: {
      stance: "hostile",
      style: ["brusque", "border-first", "challenges your business"],
      topics: ["border markers", "rabbits", "suspicious strangers"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "windclan", "thunderclan"],
  },
  {
    id: "deadfoot",
    name: "Deadfoot",
    clan: "windclan",
    rank: "Deputy",
    age: "warrior",
    appearance: "Lean black-and-white tom with a twisted forepaw.",
    personality:
      "Cheerful and sharp despite his crooked paw; the moor's best tactician.",
    voice: {
      stance: "wary",
      style: ["dry humor", "self-assured", "quick assessments"],
      topics: ["patrol routes", "rabbit runs", "the Clan's speed"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "windclan", "thunderclan"],
  },
  {
    id: "barkface",
    name: "Barkface",
    clan: "windclan",
    rank: "Medicine cat",
    age: "senior-warrior",
    appearance: "Short-tailed brown tom.",
    personality:
      "Kindly and grave; his omens have weight across all four Clans.",
    voice: {
      stance: "warm",
      style: ["gentle", "ominous when it matters"],
      topics: ["herbs of the moor", "star signs", "the Moonstone"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "medicine", "medicine-spirit", "windclan"],
  },
];

// ---------------------------------------------------------------------------
// ShadowClan — Book 1 roster
// ---------------------------------------------------------------------------

export const SHADOWCLAN: CharacterProfile[] = [
  {
    id: "brokenstar",
    name: "Brokenstar",
    clan: "shadowclan",
    rank: "Leader",
    age: "leader",
    appearance: "Long-haired dark brown tabby, matted fur, broad shoulders, orange eyes.",
    personality:
      "Cold, commanding and hungry for territory. Pushes apprentices too hard and calls it strength. The pines obey him.",
    voice: {
      stance: "hostile",
      style: ["low and flat", "threats without raising his voice", "possessive of the pines"],
      topics: ["the forest's borders", "apprentice discipline", "driving out intruders"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "shadowclan", "thunderclan", "windclan"],
  },
  {
    id: "blackfoot",
    name: "Blackfoot",
    clan: "shadowclan",
    rank: "Deputy",
    age: "senior-warrior",
    appearance: "Large white tom with black paws, amber eyes.",
    personality:
      "Brutal enforcer who enjoys being feared. Follows Brokenstar's hunger because it feeds his own.",
    voice: {
      stance: "hostile",
      style: ["menacing", "short", "likes the sound of his own growl"],
      topics: ["patrols that hurt", "intruders", "Brokenstar's orders"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "shadowclan", "thunderclan"],
  },
  {
    id: "clawface",
    name: "Clawface",
    clan: "shadowclan",
    rank: "Warrior",
    age: "warrior",
    appearance: "Battle-scarred brown tom.",
    personality:
      "A fighter who enjoys the work. Scarred enough that kits cross the pine shadow to avoid him.",
    voice: {
      stance: "hostile",
      style: ["gravel", "tough-guy taunts"],
      topics: ["fights", "scars", "the Thunderpath"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "shadowclan"],
  },
  {
    id: "runningnose",
    name: "Runningnose",
    clan: "shadowclan",
    rank: "Medicine cat",
    age: "senior-warrior",
    appearance: "Small gray-and-white tom with a perpetually dripping nose.",
    personality:
      "Nervous, dutiful and quietly uneasy about Brokenstar's shadow. His visions trouble him more than his sniffles.",
    voice: {
      stance: "wary",
      style: ["sniffly pauses", "hedged statements", "worried glances"],
      topics: ["bad dreams", "herbs", "what the stars are saying"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "medicine", "medicine-spirit", "shadowclan"],
  },
  {
    id: "russetfur",
    name: "Russetfur",
    clan: "shadowclan",
    rank: "Warrior",
    age: "warrior",
    appearance: "Dark ginger she-cat, green eyes.",
    personality:
      "Hard-edged and loyal to ShadowClan's strength; secretly proud of any apprentice that survives training.",
    voice: {
      stance: "hostile",
      style: ["clipped", "proud", "mocks soft forest cats"],
      topics: ["marsh hunting", "pines", "ShadowClan superiority"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "shadowclan"],
  },
];

// ---------------------------------------------------------------------------
// Farm — Barley's barn sits in the Book 1 world already, before Ravenpaw.
// ---------------------------------------------------------------------------

export const FARM: CharacterProfile[] = [
  {
    id: "barley",
    name: "Barley",
    clan: "rogue",
    rank: "Barn cat (the farm)",
    age: "warrior",
    appearance: "Black-and-white tom, stout and friendly.",
    personality:
      "Warm-hearted loner who chose the barn over Clan life. Feeds travelers, tells the truth, asks nothing back.",
    voice: {
      stance: "warm",
      style: ["folksy", "barnyard humor", "knows the roads and rumor routes"],
      topics: ["barn mice", "the twolegplace streets", "Clan cats passing through"],
    },
    knowledge: ["clan-life", "twolegplace"], // knows OF the Clans, not their spirits
  },
  {
    id: "firepaw",
    name: "Firepaw",
    clan: "thunderclan",
    rank: "Apprentice",
    age: "apprentice",
    appearance: "Bright flame-colored ginger tom, green eyes, forest-lean and quick.",
    personality:
      "The kittypet who chose the Clan. Eager to prove himself, hungry to learn, still surprised by the code. Farther from Smudge's garden every moon — and he knows it.",
    voice: {
      stance: "warm",
      style: ["asks what everything means", "borrowed Clan phrases said carefully", "loyal past the point of sense"],
      topics: ["training", "Graypaw's appetite", "the border smells", "the warrior code", "his old Twolegs"],
    },
    knowledge: ["clan-life", "warrior-code", "starclan", "thunderclan", "twolegplace"],
    inOnline: true,
  },
];

/** All Book 1 character profiles, by id. */

export const characterProfiles: Record<string, CharacterProfile> = Object.fromEntries(
  [...THUNDERCLAN, ...TWOLEGPLACE, ...RIVERCLAN, ...WINDCLAN, ...SHADOWCLAN, ...FARM].map((c) => [c.id, c]),
);

/** Default profile so a stray NPC id never crashes the dialogue system. */
export const fallbackProfile: CharacterProfile = {
  id: "unknown",
  name: "Stranger",
  clan: "thunderclan",
  rank: "Warrior",
  age: "warrior",
  appearance: "An unfamiliar cat.",
  personality: "Hard to read.",
  voice: { stance: "wary", style: ["guarded"], topics: ["the forest"] },
  knowledge: ["clan-life", "warrior-code", "thunderclan"],
};

export function profileFor(id: string): CharacterProfile {
  return characterProfiles[id] ?? { ...fallbackProfile, id, name: id };
}
