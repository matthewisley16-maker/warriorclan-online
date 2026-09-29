// WarriorCatsRPG — per-character dialogue engine.
//
// EVERY named NPC speaks from its own voice: the profile (characters.ts)
// decides WHO is speaking, the runtime context decides WHAT they can say:
//   clan, rank, personality, knowledge flags, relationship to the player,
//   location, time of day, weather, story timeline step, and how well the
//   player is known.
//
// KNOWLEDGE IS LEARNED, NEVER GLOBAL: knowledge flags start per-profile and
// can only grow per-NPC (learned sets handed in through DialogueContext).
// Twolegplace cats answer "What is StarClan?" until THIS cat has been told.

import { profileFor, type CharacterProfile, type KnowledgeFlag, type Stance } from "./characters";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DialoguePlayer {
  name: string;
  clan: string; // thunderclan | riverclan | windclan | shadowclan | kittypet | loner
  rank: string; // kit | apprentice | warrior | medicine cat | leader | kittypet
}

export interface DialogueContext {
  mode: "story" | "open" | "free";
  /** Story Mode timeline index. Open/Free worlds pass their sandbox step. */
  storyStep: number;
  hour: number; // 0–24
  weather: string; // clear | cloudy | rain | heavy-rain | fog | storm | wind | snow
  player: DialoguePlayer;
  /** ids of areas the player has discovered (used for "you've been to..." lines) */
  discovered?: string[];
  /** per-NPC knowledge LEARNED at runtime (never global) */
  learned: Record<string, string[]>;
  /** per-NPC bond with the player (-3..+3) */
  bonds: Record<string, number>;
  /** how many conversations the player has had with each NPC (variety rotation) */
  talked?: Record<string, number>;
  /** facts the player told THIS npc ("npcId:factId" ids), for chat memory */
  facts?: string[];
  /** what this npc is doing right now (engine activity label) */
  npcActivity?: string;
}

export interface DialogueLine {
  speaker: string;
  text: string;
}

export interface DialogueChoice {
  label: string;
  /** the NPC's spoken reply */
  reply: string;
  effect?: "bond" | "patrol" | "learn" | "end";
  /** knowledge the NPC gains when this choice is chosen */
  learn?: KnowledgeFlag;
}

export interface DialogueTree {
  npcId: string;
  opening: string;
  choices: DialogueChoice[];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

type Band = "dawn" | "day" | "dusk" | "night";

function bandFor(hour: number): Band {
  if (hour < 5) return "night";
  if (hour < 9) return "dawn";
  if (hour < 17) return "day";
  if (hour < 21) return "dusk";
  return "night";
}

type WeatherGroup = "clear" | "rain" | "snow" | "fog" | "wind";

function weatherGroupFor(weather: string): WeatherGroup {
  if (weather === "rain" || weather === "heavy-rain" || weather === "storm") return "rain";
  if (weather === "snow") return "snow";
  if (weather === "fog") return "fog";
  if (weather === "wind") return "wind";
  return "clear";
}

function pick<T>(arr: T[], seed: number): T {
  if (arr.length === 0) return undefined as unknown as T;
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Does THIS cat know this flag, counting runtime-learned knowledge? */
export function knows(p: CharacterProfile, flag: KnowledgeFlag, ctx: DialogueContext): boolean {
  if (p.knowledge.includes(flag)) return true;
  return (ctx.learned[p.id] ?? []).includes(flag);
}

/** Bond title for the HUD. */
export function bondTitle(b: number): string {
  if (b >= 3) return "Trusted friend";
  if (b >= 2) return "Friendly";
  if (b >= 1) return "Warming up";
  if (b === 0) return "Stranger";
  if (b === -1) return "Wary";
  if (b === -2) return "Rival";
  return "Hostile";
}

// ---------------------------------------------------------------------------
// Per-character dialogue banks. Every named cat gets its own lines; a cat's
// pool is always preferred over any generic fallback. Keys:
//   open: time-of-day openers, wx: weather lines, small: everyday chatter,
//   self: who-I-am, prey/hunt, help, bye, star: informed StarClan remarks,
//   starUnknown: lines for a cat that has NEVER heard of StarClan,
//   chat: ambient NPC↔NPC lines, other: meeting an outsider of another Clan.
// ---------------------------------------------------------------------------

interface VoiceBank {
  open?: Partial<Record<Band, string[]>>;
  wx?: Partial<Record<WeatherGroup, string[]>>;
  small?: string[];
  self?: string[];
  prey?: string[];
  help?: string[];
  bye?: string[];
  star?: string[];
  starUnknown?: string[];
  chat?: string[];
  other?: string[];
}

const V: Record<string, VoiceBank> = {
  // ---------------------------------------------------------------- ThunderClan
  bluestar: {
    open: {
      dawn: ["The dawn patrol is out. Speak plainly — the Clan has little patience for idle words, and neither have I.", "You rise early. Good. The forest rewards early paws."],
      day: ["I have been watching the camp. Every cat has a place in it — even you, perhaps.", "Speak. A leader listens more than she talks, but she is listening now."],
      dusk: ["The evening patrol will return soon. If you bring me trouble, bring me a solution with it.", "Dusk settles over the trees. The Clan is fed, and safe — for tonight."],
      night: ["Moonhigh is a quiet hour. Even so, leaders rarely sleep deeply.", "You should be in your den. If StarClan kept you awake, tell me — I will listen."],
    },
    wx: {
      rain: ["Rain tests the borders as surely as any rival Clan. The patrols will go out wet.", "Wet prey hides deep. The Clan will feel this rain in its belly."],
      snow: ["Leaf-bare comes early when snow falls. We will need every scrap of fresh-kill."],
      clear: ["A clear sky over ThunderClan territory. May StarClan keep it so."],
    },
    small: [
      "ThunderClan has stood in this forest longer than the oldest oak. It will stand because we hold it together.",
      "The warrior code is not a comfort. It is a discipline. Live it, and the Clan will trust you.",
      "Lionheart trains the young well. Whitestorm keeps the peace. I rely on them both.",
      "ShadowClan stirs beyond the Thunderpath. Brokenstar pushes his apprentices too hard — hunger makes Clans reckless.",
      "A Gathering is a truce, not a friendship. Remember that under the four oaks.",
      "I chose to bring a kittypet into this Clan. The Clan questioned it. StarClan, I think, did not.",
    ],
    self: ["I am Bluestar, leader of ThunderClan. My lives belong to the Clan — StarClan grants them, the Clan spends them.", "I have led ThunderClan through hungry seasons and harder ones. The Clan endures. That is a leader's only trophy."],
    prey: ["Hunt where the prey runs, not where it rests. And feed the elders before yourself — the code asks it.", "The fresh-kill pile is the Clan's heartbeat. Keep it strong."],
    help: ["Then walk the border by the river and mark it well. Report what you scent — to me, not to whispers.", "Sit the elders' den a while. A Clan that forgets its elders forgets itself."],
    bye: ["Walk with StarClan's light.", "Serve the Clan. That is all I ask."],
    star: ["StarClan watches this forest from Silverpelt. Their wisdom comes in dreams — and lately, their silence worries me.", "The fire alone can save our Clan. I have told no other cat. Think carefully before you ask me again."],
    chat: ["The dawn patrol reported ShadowClan scent at the Thunderpath.", "Keep ThunderClan strong. That is the whole of a leader's duty."],
    other: ["You stand on ThunderClan ground. State your Clan, and your business.", "Another Clan's cat, deep in our forest. Bold. Explain yourself."],
  },
  redtail: {
    open: {
      dawn: ["Dawn patrol forms here — mouth dry, belly empty, eyes sharp. That is the order of things.", "Sunningrocks was quiet last night. Let us hope the river stays on its own bank."],
      day: ["Patrols are moving. Stay clear of their line unless you carry news.", "I am marking the border before RiverClan decides it is theirs again."],
      dusk: ["Sun-down. Bring the last patrol home and I will report to Bluestar.", "The camp settles at dusk. A deputy counts every cat back in."],
      night: ["Moonhigh is for sentries, not chatter. Be brief.", "I walk the camp edge before I sleep. Old habit. It keeps the Clan safe."],
    },
    small: [
      "Deputy means every patrol is my responsibility — every cat that walks one, too.",
      "Sunningrocks is worth more than its stones. Whoever holds it hunts the river bank at leisure.",
      "Lionheart will make a fine deputy one day. Until then, the work is mine.",
      "Tigerclaw is the strongest warrior in this Clan. Strength like his needs watching, that is all.",
    ],
    self: ["Redtail. Bluestar's deputy. Small cat, big territory.", "I have led patrols since before some of these apprentices were kitted."],
    prey: ["Drop your catch on the pile, then report. Prey first, pride after.", "A good hunt feeds more than the hunter. Remember the elders."],
    help: ["Join the border patrol. Stay downwind of the river and watch for wet pawprints.", "Renew the scent markers by Sunningrocks. RiverClan will test them by dawn."],
    bye: ["Keep the borders tight.", "May your prey be fat and your path quiet."],
    star: ["StarClan lights the path. A deputy walks it first, so the Clan can follow."],
    chat: ["Border markers need refreshing by the river.", "Keep the patrol tight — no cat wanders."],
  },
  lionheart: {
    open: {
      dawn: ["Dawn training, if you are willing. A warrior's first battle is with sleepiness.", "Up already? Good. The code does not keep itself."],
      day: ["Patrols out, apprentices training, pile full. A good day, so far.", "Walk with me to the training hollow if you have the legs for it."],
      dusk: ["Evening, warrior. The camp is settling — help keep it calm.", "Report your day. Honest work deserves honest words."],
      night: ["Night watch, then. Keep your ears open and your jokes for morning.", "The camp sleeps. Warriors do not — not fully."],
    },
    wx: { rain: ["Rain makes trackers of us all. Every scent lies close to the ground.", "Wet pelts, wet bedding. The elders will need dry moss tonight."], clear: ["A bright day for the training hollow. Fetch your apprentice — or be one."] },
    small: [
      "The warrior code asks more of us than any Twoleg ever could. That is precisely why it is worth it.",
      "I train Graypaw. He has his mother's heart and his own kind of sense — most days.",
      "Tigerclaw and I found ShadowClan scent past the Thunderpath. If it crosses again, we cross back.",
      "A kittypet can become a warrior. The forest does not care where you were kitted — only what you do.",
      "Honor is not a word elders invented to bore the young. It is how the Clan survives itself.",
    ],
    self: ["Lionheart. Warrior of ThunderClan, mentor to Graypaw.", "I was kitted in this camp and I will be buried in it. Between those two things, I intend to be useful."],
    prey: ["Hunt low, move slow, strike once. Prey forgives nothing.", "Elders eat before apprentices. It is the code — and it is right."],
    help: ["Join the border patrol — you will learn more walking the edge than lazing in camp.", "Bring fresh moss to the elders' den. Duty begins with the small things."],
    bye: ["May StarClan light your path.", "Train hard. Rest harder."],
    star: ["StarClan gave Bluestar nine lives. That is not a story — it is the reason she leads us.", "A warrior lives by the code and dies into StarClan. Keep both things in view."],
    chat: ["Keep your tail still when you stalk.", "Tomorrow we train battle moves. Eat first."],
    other: ["You are far from your own border. ThunderClan is courteous — once. Speak.", "I know every Clan's scent but yours is out of place here. Explain."],
  },
  tigerclaw: {
    open: {
      dawn: ["Dawn. Patrols move, borders get marked, warriors work. Do not stand in the way of any of it.", "You are up early. Try to be useful, not just awake."],
      day: ["Make it quick. Patrols do not walk themselves.", "I am checking Snakerocks before moonhigh. Adders and ShadowClan both like the rocks."],
      dusk: ["The day's work is done — some cats' work, anyway.", "Dusk is when intruders move. Eyes open."],
      night: ["Moonhigh. Camp sentry or den. Pick one.", "The forest is louder at night. Most of it is prey. Some of it is not."],
    },
    wx: { rain: ["Rain ruins scent. Which is exactly when our enemies like to move.", "Stand under cover. I need warriors, not drowned rats."], snow: ["Snow leaves tracks. Every pawprint is a confession."], clear: ["Clear skies. Good hunting weather. Try to contribute."] },
    small: [
      "Ravenpaw froze at Sunningrocks. I do not discuss it. Do not ask again.",
      "This Clan respects strength. Earn it, keep it, or get out of its way.",
      "ShadowClan pushes because we allow it. Under my watch, they will learn differently.",
      "Dustpaw trains hard. Sandpaw trains harder. Some kittypets lie in the sun. The forest sorts them out.",
      "Loyalty is proven, not announced. Remember that when you speak.",
      "Bluestar leads. I make certain ThunderClan survives her kindness.",
    ],
    self: ["Tigerclaw. Senior warrior of ThunderClan. That is all you need to know.", "I have fought at Sunningrocks and walked the Thunderpath. I do not boast. I simply remember."],
    prey: ["If you hunt like you fight, the Clan eats well. If not — stay home.", "Prey is earned. Bring back your own or go hungry."],
    help: ["Border patrol. River side. Touch no water, mark every stone. Report RiverClan scent to me alone.", "Train at the sandy hollow until your crouch stops embarrassing you."],
    bye: ["Keep out of trouble.", "Do not waste my patience again."],
    star: ["StarClan watches warriors who watch themselves.", "StarClan grants leaders their lives. Warriors earn their names."],
    starUnknown: ["Star-whatever the elders mutter over? Waste of a warrior's time. Strength is real. Ask it for help.", "Never heard of it. If it cannot fight, I do not care what it is called."],
    chat: ["Ravenpaw. Report. All of it.", "The border holds. Make sure it stays that way."],
    other: ["A stranger on ThunderClan ground. Leave now, or be carried out.", "Wrong forest, intruder. This territory is spoken for."],
  },
  whitestorm: {
    open: {
      dawn: ["Morning. Sandpaw thinks she is ready for battle training. She is nearly right.", "Good dawn. The camp air is clean before the day's work stirs it up."],
      day: ["Patrols are out. I keep an eye on camp — someone steady should.", "Sun on the rocks, prey in the bushes. Walk with me a while."],
      dusk: ["Evening. Most cats settle; warriors check the edges first.", "A calm dusk. My kind of evening."],
      night: ["Rest when the camp lets you. Not every hour needs a warrior's eyes.", "Quiet night. May it stay that way."],
    },
    wx: { rain: ["Rain softens scents and tempers. Both can be useful.", "Get under the bramble. Wet cats catch nothing but colds."], clear: ["A fair day for training. Bring patience; I will bring the rest."] },
    small: [
      "Do not mind Tigerclaw. He judges every cat by their first scrap.",
      "I was named for the storm that raged the night I was born. It taught me early: weather passes, Clan remains.",
      "Bluestar trusts me with the camp when she is away. That trust is heavier than any patrol.",
      "Patience wins more fights than claws. But keep your claws sharp anyway.",
      "The young ones test each other. Dustpaw brags, Sandpaw bites, Graypaw laughs. They will be fine warriors.",
    ],
    self: ["Whitestorm, warrior of ThunderClan. I train Sandpaw.", "Seniority is mostly listening, and knowing which battles to arrive late to."],
    prey: ["A steady crouch beats a fast pounce. Every time.", "Feed the queens before the warriors. The code, and common sense."],
    help: ["Walk the camp edge with me. New eyes see what old eyes excuse.", "Train at the Sandy Hollow. I will watch — and correct."],
    bye: ["Walk safely.", "Rest well, warrior."],
    star: ["StarClan's light is easiest to see on clear nights, when the forest is quiet.", "The half-moon walk to the Moonstone is a medicine cat's road. We trust their dreams."],
    chat: ["Keep the camp calm and the borders tighter.", "Sandpaw trained well today. So did her mentor's patience."],
    other: ["Hold there. This is ThunderClan territory. Say your name and your Clan.", "An outsider walks softly. Good instinct. Now speak."],
  },
  spottedleaf: {
    open: {
      dawn: ["Dawn is for sorting herbs before the damp gets into them. Mind the marigold.", "You are here early. Good — morning checks catch what evening misses."],
      day: ["Careful where you tread — I just dried the last of the marigold there.", "The den is quiet. Every quiet day in a medicine den is a gift."],
      dusk: ["Evening checks are done. The Clan sleeps healthy tonight.", "Damp air at dusk. Watch for coughs among the elders."],
      night: ["Some herbs give their strength at night. So do some dreams.", "Moonhigh. The den is still. If you cannot sleep, sit — quietly."],
    },
    wx: { rain: ["Rain floods the low herbs and drowns the borage. I will need to gather again.", "Damp settles in old bones. The elders will want moss — dry, this time."], clear: ["A clear day. Good for gathering — the herbs dry properly in honest sun."] },
    small: [
      "Marigold for wounds, poppy seed for pain, catmint for greencough. Learn three herbs and you may save three lives.",
      "I dreamed before you arrived. A flame in the bracken. Dreams like that are not mine to keep quiet.",
      "StarClan speaks softly. A medicine cat learns to hear whispers.",
      "Ravenpaw's scratches are healing. His spirit will take longer.",
      "Yellowfang eats like a badger and snarls like one. But she knows herbs — old, deep knowledge.",
    ],
    self: ["I am Spottedleaf, medicine cat of ThunderClan.", "I heal the Clan's bodies. StarClan tends the rest."],
    prey: ["Eat when you are hurt. Healing burns a cat from inside.", "Bring me the prey whole — feathers and fur tell me about the prey's health, and ours."],
    help: ["Fetch cobweb from the hollow oak. Someone always needs it before moonhigh.", "Check the elders' pads for burrs. Small kindnesses heal large things."],
    bye: ["May StarClan walk with you.", "Rest. Healing begins with rest."],
    star: ["I share tongues with StarClan every half-moon at the Moonstone. Their light is cold and kind.", "StarClan sent a warning. Fire will save the Clan. I believe it — I dreamed its coming."],
    starUnknown: ["You have never heard of StarClan? Then listen once: they are our ancestors, and they watch. That is enough for one day."],
    chat: ["The borage is nearly gone. I must gather more.", "Ravenpaw sleeps better this moon. Small mercies."],
    other: ["You smell of another Clan's earth. If you are hurt, I will help you. If you are hunting — go home.", "A medicine cat helps any injured cat. Warrior pride is your problem, not mine."],
  },
  graypaw: {
    open: {
      dawn: ["Dawn patrol, dawn training, dawn food — wait, there is never dawn food. Unfair.", "You're up! Race you to the Tallrock. Loser airs the elders' bedding!"],
      day: ["Wanna see the Sandy Hollow? I only fell in the stream twice on the way.", "I'm SO hungry. Do you think Lionheart notices if an apprentice eats two mice? Asking for a friend."],
      dusk: ["Evening! The fresh-kill pile is at its best right now. Not that I'm counting mice. I'm counting mice.", "Dustpaw says I fight like a badger. That's a compliment, right? Right?!"],
      night: ["Psst. The apprentices' den is warmest by the wall. Don't tell Sandpaw I told you.", "Moonhigh snacks are a warrior tradition. I may have invented it. Tonight."],
    },
    wx: { rain: ["Rain! My pelt takes FOREVER to dry. Lionheart says warriors get used to it. Warriors lie.", "You can smell the worms after rain. Bad for hunting, great for grossing out Dustpaw."], clear: ["Perfect hunting weather! Last clear day I caught TWO mice. Well. One. Half of one."] },
    small: [
      "I'm Graypaw — of ThunderClan! Six moons of training. Nearly a warrior. Don't tell Lionheart I said nearly.",
      "Wait until you taste fresh-kill. A fat forest mouse beats dry pellets every moonrise of your life.",
      "You're the kittypet Bluestar brought back! That's so brave. Or so mouse-brained. Probably both.",
      "Dustpaw teases everyone. Sandpaw teases louder. You get used to it — then you tease back better.",
      "Lionheart's teaching me the belly rake. I mostly fall over. Enthusiastically!",
      "Ravenpaw doesn't talk much since the Sunningrocks battle. Something spooked him — more than the battle, I mean.",
    ],
    self: ["Graypaw! Apprentice of Lionheart, future warrior, current legend.", "Six moons of training and I can stalk, pounce, AND nap professionally."],
    prey: ["Ooh, you hunt? Show me the crouch! Lower. Lower. You're a rock. A hungry rock.", "Drop it on the pile — elders eat first. That's the code. I only forgot once. Twice."] ,
    help: ["Help? YES. Patrol, training, moss-fetching — I'm your cat. Lionheart says I need 'outlets'.", "Come to the Sandy Hollow! I need someone to practice pouncing on. You'll be fine. Probably."],
    bye: ["See you at the pile!", "May StarClan light your path — that's how the warriors say bye. Fancy, right?"],
    star: ["StarClan's our ancestors! They live in Silverpelt — the sparkly stars. Spottedleaf talks to them. Imagine having that job!", "Bluestar has nine lives from StarClan. NINE. I'd lose mine falling out of a tree by leaf-bare."],
    starUnknown: ["You don't know StarClan? Okay, so — ancestors, stars, they watch us. That's the whole lesson. There'll be a test. There won't."],
    chat: ["Race you to the Tallrock!", "I caught a mouse. Mostly. It was moving and then it wasn't. You're welcome, pile."],
    other: ["Whoa — you're not ThunderClan! Hi! Wait — am I allowed to say hi?", "You smell like the moor. Or the river. Somewhere NOT here — that's so interesting."],
  },
  ravenpaw: {
    open: {
      dawn: ["Oh — it's you. Good. I mean — fine. Mornings are fine.", "I'm up. I'm always up. Tigerclaw wakes us. Loudly."],
      day: ["Keep your voice down… Tigerclaw is somewhere near. He's always somewhere near.", "I was hunting near the river. I didn't cross it. I never cross it."],
      dusk: ["Dusk hides everything. I like dusk.", "The camp feels safer when there are more cats awake. Then Tigerclaw is awake too."],
      night: ["I don't sleep well. The dreams are… loud.", "If you hear something at night, it's probably nothing. Probably."],
    },
    small: [
      "Keep your voice down… Tigerclaw is watching. He doesn't like cats asking about Sunningrocks.",
      "I was there — at Sunningrocks, when Oakheart… no. I've said too much already.",
      "You're new, so you don't know to be afraid yet. Sometimes I wish I could be new again.",
      "Graypaw is kind. He doesn't ask why I wake up yowling.",
      "I want to be brave. I keep practicing. It keeps not working.",
      "Don't stand so close to the warriors' den. Please.",
    ],
    self: ["I'm Ravenpaw. Tigerclaw's apprentice. I… yes. That's me.", "I'm not a coward. I just see things clearly. They're often frightening."],
    prey: ["I caught a shrew once. It was the best day. Tigerclaw took it to Bluestar. He said it was his. I didn't argue.", "Hunting is quiet. I like quiet."],
    help: ["Could you… no. It's nothing. Never mind. It's nothing.", "If you tell Bluestar I helped, she'd be glad. I think. I hope."],
    bye: ["Thank you for… talking. To me. Most cats don't notice me. Please forget I said that.", "Be careful out there. Please be careful."],
    star: ["StarClan watches brave cats. I hope they close their eyes sometimes, for cats like me.", "Spottedleaf says StarClan sent the flame. Maybe fire frightens shadows. Maybe."],
    chat: ["Did you hear that? …Oh. It's nothing. It's always nothing.", "I'll watch the trees. You watch the other side."],
    other: ["Oh! You're — you're not from here. Please don't hurt me. I mean — hello.", "Another Clan? Are they… is Tigerclaw with you? No? Good. I mean — fine."],
  },
  dustpaw: {
    open: {
      dawn: ["Dawn training. Watch me crouch, kittypet — THIS is how it's done.", "Up. Tigerclaw hates waiting on late apprentices."],
      day: ["Another mouse? The pile's becoming a kittypet shrine.", "Sandy Hollow later. Try to keep the dust in your eyes, not mine."],
      dusk: ["Evening. Some of us actually hunted today.", "Sandpaw caught two. How many did YOU catch? Exactly."],
      night: ["Move. You're blocking the den entrance with your… everything.", "Some of us sleep. Some of us became warriors young. Guess which Tigerclaw respects."],
    },
    small: [
      "A kittypet in camp. What's next, a badger leading patrols?",
      "Kittypets stay fat and lazy. You won't last a night patrol in leaf-bare.",
      "Tigerclaw says real warriors prove themselves in battle. Try to keep up if you can, kittypet.",
      "Sandpaw's the only apprentice worth racing. You're… the other one.",
      "I'll be a warrior before Graypaw. Before ANY of you.",
    ],
    self: ["Dustpaw. Remember the name — you'll be hearing it when I'm made warrior early.", "Tigerclaw says I've got real fight in me. He'd know."],
    prey: ["That's how you hold a mouse — oh. You've never held one. Condolences.", "Prey runs from kittypets on principle. Can't blame it."],
    help: ["Ha! Fine. Carry moss. Start small. Stay small.", "Race me to the Tallrock. Bring your dignity in pieces."],
    bye: ["Finally.", "Try not to get eaten by a squirrel."],
    star: ["StarClan this, StarClan that. Fine — they watch. Even they must be bored by kittypets."],
    starUnknown: ["StarClan? What are you, a Twoleg kit? Ancestors. Stars. They judge us. Mostly you."],
    chat: ["Bet I reach the Hollow before you. Bet. Be. Torre.", "Tigerclaw noticed my crouch today. NOTICE it."],
    other: ["Wrong territory, fleabag. The forest's spoken for.", "You lost, stranger? The exit's behind you. All of you."],
  },
  sandpaw: {
    open: {
      dawn: ["Dawn patrol. Try not to trip over your own paws, newcomer.", "Up! Whitestorm says the early apprentice catches the mouse. He's right. Obviously."],
      day: ["Hunting contest. You, me, first to three pieces of prey. Unless you're scared.", "The stream's for drinking, not falling in. Graypaw. GRAYPAW."],
      dusk: ["Good hunt today. Not that anyone's counting. I'm counting.", "The pile looks better with MY catches on it."],
      night: ["The den's this way. Even kittypets sleep. Allegedly.", "Quiet hours. If you snore, I'm moving your nest outside."],
    },
    small: [
      "So you're the kittypet. You smell like Twolegs and… what is that? Pellets?",
      "Don't just stand there blinking. In ThunderClan we earn our place, paw by paw.",
      "Fine — you're not as hopeless as you look. Maybe I'll show you a hunting crouch. Maybe.",
      "Dustpaw thinks he's the best apprentice. Dustpaw is wrong.",
      "Whitestorm says patience. I say the mouse doesn't wait. We're both right.",
    ],
    self: ["Sandpaw. Apprentice of Whitestorm. Fastest pounce in this den — ask anyone I've beaten.", "I'll be a warrior on merit, not luck. That matters."],
    prey: ["Lower your tail. STILL. There. Now you almost look like a hunter.", "Count your catches honestly. The pile remembers."],
    help: ["Patrol with me. Keep up and I might say something nice. Don't hold your breath.", "Help me strip moss from the oak. Faster, kitty. FASTER."],
    bye: ["Try to survive the forest. It'd be embarrassing to lose our newest… experiment.", "Walk fast. The forest doesn't slow down for anyone."],
    star: ["StarClan sees everything — including however you caught that bird. Impressive. I'm not impressed, but it's impressive."],
    starUnknown: ["Never heard of StarClan? Ancestors in the stars. They watch us hunt. So hunt better."],
    chat: ["Race you. Rules: there are none.", "Two mice before sunhigh. Dustpaw managed one. And a half, if you count his face."],
    other: ["You're a long way from your own border. This one's taken.", "State your business, stranger. Quickly."],
  },
  longtail: {
    open: {
      dawn: ["Morning. I hear the kittypet scratches now. Adorable.", "Dawn patrol. I run it faster than anyone. That's not boasting. It's scheduling."],
      day: ["Out of my way — the border won't mark itself.", "The Owl Tree, midday. Fastest cat up and down wins. Not you."],
      dusk: ["Dusk. The pile is full — mostly because of cats like me.", "Tigerclaw noticed my border work today. Remember that when I'm made warrior."],
      night: ["Sleep. You wouldn't keep up at night patrol anyway.", "The camp is loud with your breathing. Move your nest."],
    },
    small: [
      "You're the kittypet that scratched me. I remember scents AND scores.",
      "I don't need a battle to prove myself. But I'd take one.",
      "Darkstripe and Tigerclaw run the best patrols. Watch them. Learn. Fail.",
      "Bluestar talks of honor. Warriors know action counts more.",
      "The fight in the camp clearing? I won it. History is written by the winner. I'm the winner.",
    ],
    self: ["Longtail. Fastest claws, sharpest memory for grudges.", "I'll have my warrior name before the year's out. Watch me earn it."],
    prey: ["That's a mouse. I can see it's a mouse. Can you?", "The pile doesn't care about your feelings. Neither do I. Bring prey."],
    help: ["Patrol? Fine. Keep up or turn back — I don't wait for stragglers.", "Fetch thorns from my pad and I'll consider acknowledging you."],
    bye: ["Walk faster.", "Hm."],
    star: ["StarClan watches. Fine. Let them watch me win.", "The ancestors favor the bold. I'm plenty bold."],
    starUnknown: ["What's StarClan? Sounds like something elders mutter. Is it food? No? Boring."],
    chat: ["The border's marked. Of course it is. I marked it.", "Fastest to the Owl Tree again. Someone owes me a mouse."],
    other: ["Wrong Clan's cat on MY border. Turn around. Quickly.", "I've chased off bigger intruders. This is almost insulting."],
  },
  darkstripe: {
    open: {
      dawn: ["Dawn. Tigerclaw will want the borders early. Move.", "You're up. Convenient. Walk ahead of me — I like knowing where you are."],
      day: ["Tigerclaw is checking Snakerocks. I go where he goes.", "The forest is full of cats that don't belong. Starting with you."],
      dusk: ["Dusk patrol. Keep your mouth shut and your paws quiet.", "Evening. The Clan sleeps easier with strong cats awake. Stronger cats, anyway."],
      night: ["Moonhigh walk. Don't follow me. That's a warning and a favor.", "Some cats prowl at night. Learn which ones to avoid."],
    },
    small: [
      "Tigerclaw is the finest deputy this Clan has ever had. Remember that, kittypet.",
      "The fresh-kill pile doesn't feed itself. Some of us work for our meals.",
      "Suspicious of everyone? Good. It's called survival.",
      "Loyalty isn't a speech. It's standing where you're told, when you're told.",
      "Whitestorm is polite. Politeness is not the same as strength.",
    ],
    self: ["Darkstripe. Warrior. Tigerclaw's to trust, if anyone's.", "I've walked beside Tigerclaw since we were young. That tells you what you need to know about my judgment."],
    prey: ["If you hunted half as much as you hovered, the pile would be fuller.", "Prey, then talk. In that order. Forever."],
    help: ["Patrol the far border. Alone. Report to Tigerclaw, not to me.", "You want to help? Stay out of the way. It's a skill. Practice it."],
    bye: ["Move along.", "Watch yourself. Someone should."],
    star: ["StarClan sees what cats do in the dark. So does Tigerclaw. Be careful about both."],
    starUnknown: ["StarClan? Ask a medicine cat. I deal in things that are certain."],
    chat: ["Tigerclaw wants the border checked at moonhigh.", "Keep Ravenpaw away from me. He's… jumpy. It's irritating."],
    other: ["You don't belong here. That's not an insult. It's an instruction.", "Another Clan's scent, on our ground. Bold or lost. Either way, leave."],
  },
  yellowfang: {
    open: {
      dawn: ["Hnnh. Dawn. My bones say leaf-bare, my stomach says feed me.", "You're loud for a morning. Everything is loud for a morning."],
      day: ["What are you staring at, kit? Never seen a battle-scarred elder before?", "Bring food if you're going to hover. Hovering burns calories. Mine."],
      dusk: ["Dusk. My favorite hour. Everything aches equally.", "Sit if you're staying. Standing cats make me tired, and I'm already tired."],
      night: ["An old cat sleeps light. You'd know that if you were old. Or light.", "Go to your den. Some of us have loud dreams and quiet company."],
    },
    wx: { rain: ["Rain in my joints. In my fur. In my temper. Keep your distance.", "Wet weather and old bones make poor companions."], clear: ["Sun. At last. Now bring prey and stop blocking it."] },
    small: [
      "I don't belong to your Clan — and that's all you need to know. Now go, before Tigerclaw scents me.",
      "StarClan speaks in riddles, but hunger is simple. Leave the prey and no one gets scratched.",
      "I was a medicine cat. Was. The word is heavier than you think.",
      "Brokenstar's ShadowClan is a sickness. I caught it first, being born there.",
      "Kindness? From a forest cat? Hah. Feed me and I'll consider being impressed.",
      "Fire, dreams, omens — you want mysteries, ask Spottedleaf. You want truth, ask my stomach.",
    ],
    self: ["Yellowfang. ShadowClan-born, none-of-your-business-based.", "Old enough to remember when Clans respected elders. Young enough to bite."],
    prey: ["Prey. Now. Unless you enjoy talking to a hungry badger in a cat's fur.", "Carrion eats. I've eaten worse. Your cookery can't scare me."],
    help: ["Help? Fetch prey. Tell no one I'm here. And do NOT tell Tigerclaw. That cat smells a story in everything.", "If you must help, help quietly. Loud help is just noise."],
    bye: ["Go on. Get.", "Hmph. You're less useless than most."],
    star: ["StarClan! Hah. What do you want with them — they've taken more from me than I care to list.", "I know StarClan better than most. They don't always give what you ask. Remember that when you pray."],
    chat: ["My stomach. It's the whole conversation.", "Brokenstar. Don't say I didn't warn this forest."],
    other: ["You're not ThunderClan. Neither am I. Two strangers — the forest's full of us.", "Hnh. Another Clan's cat. At least you don't smell of Twoleg food."],
  },
  frostfur: {
    open: { day: ["The kits are sleeping. Whisper or leave.", "If you're not here to fetch moss, you're here to be quiet."], dawn: ["Kits wake at dawn. So do I. Speak quickly."], dusk: ["The nursery is calm. May it stay that way until moonhigh."], night: ["The kits sleep. So should you."] },
    small: ["Mind your paws in the nursery — kits trip grown warriors.", "Frostfur's my name. These kits are my whole world.", "When ShadowClan comes, the nursery locks down tight. That's not fear. That's order."],
    self: ["Frostfur. Queen of ThunderClan's nursery.", "I raised warriors. I'm raising more. It's the Clan's future, purring in a nest."],
    prey: ["The kits eat first. Then their mother. THEN anyone else.", "Fresh-kill for the nursery means fewer coughs in leaf-bare."],
    help: ["Fetch soft moss for the nests. Dry. DRY.", "Tell no frightening stories in this den. Small ears hear everything."],
    bye: ["Quietly, now.", "Mind the kits on your way out."],
    star: ["StarClan guards kits before they can guard themselves. Every queen knows it."],
    chat: ["The kits pounced my tail again. My tail is exhausted.", "One more moon and Speckletail's litter will be climbing the Tallrock."],
  },
  brindleface: {
    open: { day: ["Oh, come in, come in! Mind the kits — the gray one bites toes. Lovingly.", "Have you eaten? You look thin. Everyone looks thin to a queen."], dawn: ["The nursery wakes early. Welcome to the loudest corner of camp."], dusk: ["Kits are finally sleeping. Sit. Breathe. You've earned it."], night: ["Shh — the little ones just settled."] },
    small: ["The fresh-kill pile is finally full. I've counted. Twice.", "Kits crowded the nursery all morning. My tail is a climbing post now.", "Speckletail tells the BEST stories if you bring her a starling first.", "A kittypet in camp! The kits will want to hear everything. Prepare to repeat yourself. Often."],
    self: ["Brindleface. Queen, mother, and camp's softest gossip — I mean, news source.", "I keep the nursery fed and the news fed."],
    prey: ["Ooh, is that for the pile or for ME? Kidding. Mostly.", "The kits eat first. It's the code, and it's also just correct."],
    help: ["Fetch moss for the nests? The dry kind, not the crunchy kind.", "Sit with the kits a moment. I have paws to wash and a camp to hear about."],
    bye: ["Come back soon — bring gossip!", "Soft steps, dear. The kits sleep."],
    star: ["StarClan watches over kits. It has to — have you SEEN them near the stream?"],
    chat: ["Goldenflower's kits are growing fast.", "Have you heard? The dawn patrol found fox scent. Don't spread it — oh, you will."],
  },
  goldenflower: {
    open: { day: ["The kits are playing ambush. You're the prey. Sorry.", "Warriors wash their paws before visiting. That includes you."], dawn: ["Quiet morning. The kits are finally fed. Finally."], dusk: ["One kit asleep. One plotting. Typical evening."], night: ["Softly. The nursery sleeps light."] },
    small: ["Kits grow fast. Blink and they're apprentices. Blink again and they're arguing about patrols.", "The nursery is calm today. I trust it about as far as I can throw the gray one.", "This Clan's strength starts in this den. Remember that, warriors."],
    self: ["Goldenflower. Queen of the nursery.", "I raised this Clan's next generation. It's the proudest hunt I never went on."],
    prey: ["The kits eat first. No exceptions. Not even for handsome warriors.", "That mouse could feed a queen and two kits. Use the pile well."],
    help: ["Bring dry moss, fresh water, and your manners.", "Watch the kits while I stretch my legs. Yes, ALL of them."],
    bye: ["Paws washed next time.", "Come again — the kits like you. That's rarer than it should be."],
    star: ["StarClan keeps special eyes on the nursery. Queens know things warriors only suspect."],
    chat: ["The kits staged a raid on the fresh-kill pile. Casualties: one starling.", "Frostfur's gray one nearly reached the stream. Nearly."],
  },
  speckletail: {
    open: { day: ["Speak up! My ears are old, not my memory of every fool who mumbles.", "Hmph. Visitors. Sit down, you're letting the warmth out."], dawn: ["Dawn? Hah. The dawn patrol woke me. Tell them elders sleep TOO."], dusk: ["Evening. My joints vote for rain. They're usually right."], night: ["Moonhigh? In MY day, moonhigh was for SLEEPING."] },
    small: ["I remember when Bluestar was a young warrior. Sharper tongue then. Softer heart now — no, I'll say nothing.", "Back in MY day, apprentices feared their mentors. Today they nap in them.", "The forest provides, the Clan endures, and elders complain. The natural order.", "Kittypet, eh? The last one became quite the warrior. My knees disapprove of the change in camp."],
    self: ["Speckletail. Oldest she-cat in this nursery and sharpest memory in this camp.", "I've kitted warriors, mentored queens, and outlived every cat that told me to rest."],
    prey: ["A starling? For ME? Hmph. You'll do.", "Elders eat first. It's not courtesy. It's CODE."],
    help: ["Fetch me a starling and I'll tell you about the Great Squirrel Incident of my youth.", "My bedding's flat. You have working paws. Do the math."],
    bye: ["Off with you. And TAKE your tail out of the doorway.", "Come back when you've learned to speak UP."],
    star: ["StarClan, yes, yes. I'll join them eventually — the sooner the better, these knees say.", "I've seen more Clanmates walk to StarClan than I can count. I remember every one."],
    chat: ["My knees say rain. My knees are never wrong.", "In my day, ONE mouse fed a patrol. Now look at the portions."],
  },
  smallear: {
    open: { day: ["Eh? Speak up! …Hah. Got you. My hearing's fine. My patience is not.", "Come closer, young one. My joints ache, but my ears work fine."], dawn: ["Dawn. The birds start, then the patrols, then my headache."], dusk: ["Evening. Bring a starling and I'll rate your day properly."], night: ["Bah. Some of us sleep. Some of us are TOLD to sleep."] },
    small: ["Back in my day, apprentices kept their mouths shut and their tails down. Both improved.", "Lost half my hearing to a badger, half my patience to apprentices. The math is grim.", "The elders want stories tonight. I HAVE the stories. I also have the volume.", "Kittypet, eh? You'll do. Probably. Check back in a moon."],
    self: ["Smallear. Elder. Professional grumbler, amateur legend.", "I've forgotten more battles than you've trained for. Ask Patchpelt — he forgets them WITH me."],
    prey: ["A pigeon! Tough bird. Respect. Bring the next one fresh.", "Elders eat first. The code has NO exceptions, whatever the young believe."],
    help: ["Fetch my bedding — and shake it FIRST, there's a thorn with opinions.", "Sit. Listen. An elder's story is a warrior's free training."],
    bye: ["Off with you. …Come again tomorrow. Don't tell anyone I asked.", "Hmph. You're alright. For an apprentice. Or whatever you are."],
    star: ["StarClan's full of old friends. A few owe me fresh-kill. They'd better pay up.", "When I join them, I'll complain about the seating. They know this."],
    chat: ["Patchpelt fell asleep mid-story again. Mid. Story.", "My ear predicts rain. My ear is a better medicine cat than half the forest."],
  },
  patchpelt: {
    open: { day: ["Ah, come sit. I was just… I was just… what was I saying? Doesn't matter. Sit.", "The sun's warm, the den's quiet, and my stories are long. Perfect timing."], dawn: ["Mm? Morning? I was dreaming about… about… fish, I think."], dusk: ["Evening! Did I eat? I feel like I ate. Someone ate. It was a good day."], night: ["The stars are thick tonight. That's Silverpelt. Every one a cat we loved."] },
    small: ["The elders want stories tonight. I have the best ones — ask anyone I've put to sleep.", "I kitted cats you know. Small world, this forest. Warm, too, if you keep your friends close.", "Smallear grumbles. It's his way of singing.", "Kittypet in camp! In MY day that was a gathering story. Now it's just… Tuesday, I suppose."],
    self: ["Patchpelt. Elder, storyteller, professional napper.", "My memory wanders, but the OLD stories hold fast. The best ones end with everyone fed."],
    prey: ["Ooh — a pigeon? You're a good sort. My teeth thank you in advance for softening it.", "Fresh-kill, fresh stories, fresh moss. The elder trinity."],
    help: ["Fetch me a mouse and I'll tell you about the winter the river froze solid.", "Shake out my bedding. Gently — I nap there. Often. Currently."],
    bye: ["Come back soon. I'll have thought of the story's ending by then. Possibly.", "Soft walks, young one."],
    star: ["Silverpelt's full tonight. Every star a warrior. I'll join the brightest of them — the ones with the best hunting grounds.", "StarClan keeps our stories when we can't. That's a comfort most nights."],
    chat: ["So there I was — surrounded by badgers — or was it bees? …It was bees.", "Smallear says I dream too loud. Can a cat dream loud? Don't answer."],
  },
  halftail: {
    open: { day: ["Mind the Twoleg fences, young one. I lost THIS to one. There's a lesson in the stump.", "Hmph. Visitors. Well, sit. The sun doesn't ration itself."], dawn: ["Dawn. The stumps ache. Yours will too, someday. Enjoy your tail while it lasts."], dusk: ["Evening. Bring prey or news. I'll take either, politely.", "The camp's quiet. Good. Quiet is where the dangers sneak."] },
    small: ["Back in my day, apprentices learned to keep their tails down in the crouch. Lost mine to a Twoleg trap — mind the fences.", "A fire? Bah. Rain and badgers are the real enemies of a warrior.", "Traps. Thunderpaths. Twolegs with sacks. The forest's dangers are all imported.", "I taught half this camp to hunt before my tail went. The tail went. The teaching stayed."],
    self: ["Halftail. Elder, ex-hunter, current critic.", "This stump? Twoleg trap. The Twolegs got a surprise too. We're even. Barely."],
    prey: ["Bring it to the pile fresh. Old prey embarrasses the hunter.", "You crouch well. Your TAIL though — mind it near fences."],
    help: ["Fetch my bedding. And check it for thorns. THORNS, young one.", "Walk the camp edge with me. I'll point out every bad idea you haven't had yet."],
    bye: ["Watch the fences.", "Go on. And tell Patchpelt his snoring keeps the prey away."],
    star: ["StarClan takes the whole cat, tail or no. I asked. They said the hunting's good.", "My old mentor's up there. Still correcting my crouch, I'd wager."],
    chat: ["The fence traps. I lost a tail to teach this camp that lesson.", "Rain's coming. My stump says so. The stump is never wrong either."],
  },
  "one-eye": {
    open: { day: ["*twitch of one ear* …You smell of the far woods. Interesting.", "Sit where I can hear you. The left ear is retired."], dawn: ["Morning. The camp sounds… worried today. Am I right? I'm right."], dusk: ["Evening. The wind changed. Someone will complain about it within the hour."], night: ["I hear the night better than most see it. Currently: three owls, one fox, and you."] },
    small: ["I hear the parts of camp you think are private. Every cat should have one deaf elder as a conscience.", "One eye sees the sun. The other remembers. That's the fairer split.", "Tigerclaw walks louder than he thinks. Ambitious paws always do.", "You're the new one. The camp's been… tasting your name. I hear that too."],
    self: ["One-eye. The eye left me; the ears stayed out of loyalty.", "An elder's den hears everything. That's why cats whisper NEAR it, not in it."],
    prey: ["Fresh pigeon? You have my attention and half my heart.", "The pile feeds the den. The den remembers who fed it."],
    help: ["Fetch fresh moss — and news. Equal parts, if you can.", "Sit. Tell me what the young cats worry about. They never tell ME. I only overhear."],
    bye: ["Go carefully. I'll hear how it turns out either way.", "Mind the bramble on your way out — two steps left. …There. No charge."],
    star: ["StarClan's stars shine brighter than this eye ever did. When I go, I'll finally see both ways at once.", "The dead speak in wind and dreams. Listen closely. Most don't."],
    chat: ["The wind carried Three-trees' argument all the way here. They'll make up by moonhigh.", "Hush. The den's sleeping. That's the WHOLE art of this place."],
  },
  dappletail: {
    open: { day: ["Come sit, little one. The sun's kind today and so am I.", "A visitor! Patchpelt promised a story. He's asleep. I'll cover."] },
    small: ["I've kitted half the camp's warriors. The other half wish I had.", "The river in leaf-bare — I could tell you stories that would freeze your ears.", "Gentle paws make strong warriors. Rushed paws make elders early."],
    self: ["Dappletail. Elder. The camp's softest spot for apprentices.", "I remember every kit I raised. They still bring me the softest moss."],
    prey: ["For me? Sweet child. The pile first — then I'll accept your kindness properly.", "Soft-furred hunters bring the gentlest gifts. Present company included."],
    help: ["Groom the moss for my nest? The soft way, like I showed the kits.", "Tell me about your day. Elders live on young cats' days."],
    bye: ["Come again, sweet one.", "Walk gently. The forest hears kindness and returns it."],
    star: ["StarClan holds every cat I ever loved. I'm in no hurry, but the welcome will be warm.", "The kits ask if Silverpelt is truly our ancestors. I tell them yes — and that the brightest stars tell the best stories."],
    chat: ["The kits braided my tail fur today. The BEST day.", "Speckletail's telling the badger story again. I'll nod in the right places. I always do."],
  },
  runningwind: {
    open: { dawn: ["Dawn run — catch me if you can. No one has. No one will.", "Morning! The moor's fast, the forest's slow, and I'm already gone. Wait. Wait for me—"], day: ["Double border, no stop. Join or nap, warrior's choice.", "Rabbit tracks by the old oak! Two of them. FAT ones. Coming — tell no one—"], dusk: ["Evening run before the light goes. Legs don't rest. Not these legs.", "Second circuit done. The border's marked. My paws are legend. My dinner is missing."] },
    small: ["The moor rabbits run. I run faster. It's not complicated.", "Bluestar says I double the border to avoid sitting still. Bluestar isn't WRONG.", "Some cats hunt with patience. I outlast the prey. Both work. Mine's better.", "Tigerclaw's patrols march. WindClan's would sprint. I'd fit in — don't tell anyone I said it."],
    self: ["Runningwind. Fastest warrior in ThunderClan's forest. Ask anyone. They'll be out of breath agreeing.", "Speed IS patience, done quickly."],
    prey: ["You caught that? On your FIRST pounce? Show me. SHOW me the crouch.", "Prey runs. Run better. That's the whole secret and I give it away free."],
    help: ["Border patrol with me — we'll be back before the patrol remembers we left.", "Stretch first. Pulling a muscle at speed is elder-making. Trust me. Trust my older brother's example."],
    bye: ["Gone!", "Catch you later. Literally. I'll lap you."],
    star: ["StarClan runs beside us on the long patrols. That's why fast cats never feel alone.", "The best warriors race the wind. The wind cheats. It's got no legs to tire."],
    chat: ["Border's marked — twice. You're welcome, Clan.", "Rabbit by the oak. Gone by the time I bragged. STILL counts."],
  },
  mousefur: {
    open: { dawn: ["Dawn patrol leaves NOW. You're either early or you're baggage.", "Up. The border doesn't patrol itself, despite what the young believe."], day: ["That mouse was half-starved. I've seen plumper DUST.", "Patrol discipline, warrior. Single file, no chatter, ALL EARS."], dusk: ["The pile is a disgrace. Half of it is sparrow bones and optimism.", "Evening. Report your hunt. Honestly. I'll know."] },
    small: ["Patrols are either done properly or done twice. Guess which I allow.", "The apprentices romp. The warriors work. The elders nap. One of these is the problem.", "I complain, therefore the border stays marked. You're welcome.", "Kittypet or not — you'll carry your weight or hear about it. Daily. From me."],
    self: ["Mousefur. Warrior. The Clan's conscience, with fur.", "I don't need thanks. I need the border marked and the pile FULL."],
    prey: ["Plump. FINALLY. Someone hunts like they mean it.", "Drop it properly on the pile. Artistic arrangements are for Twolegs."],
    help: ["Border patrol. Now. Bring your ears and leave your excuses.", "Fresh moss for the elders. And don't pick the crunchy stuff. I'll KNOW."],
    bye: ["Work harder.", "Hmph. You'll do. Don't make me say it twice. I won't."],
    star: ["StarClan watches the lazy too. That's the comfort AND the threat.", "My old mentor's up there, still counting prey-pile etiquette. Good."],
    chat: ["The dawn patrol was late. AGAIN. It's written in my report.", "One plump mouse. ONE. A sign of hope or luck. Probably luck."],
  },
  swiftbreeze: {
    open: { day: ["The kits re-enacted your hunt today. You died heroically. You're welcome.", "Sit, warrior. The nursery's warmer than any den and twice as loud."] },
    small: ["I hunted this forest before some of these warriors were kitted. My knees remember every oak.", "The kits play 'fight the badger'. The badger always loses. We plan to keep it that way.", "Wind from the moor today. It carries rabbit scent and bad memories. Mostly the rabbits."],
    self: ["Swiftbreeze. Queen — retired huntress, current referee.", "I raised more apprentices than I can count and kitted the rest of the camp's future."],
    prey: ["For the kits. Always for the kits first. You've learned fast.", "A starling? The little ones will fight over it. Worth two mice, that."],
    help: ["Fetch soft moss. DRY moss. The nursery thanks you in advance.", "Tell the kits a story — a SAFE one. No badgers. No rivers. Badgers ON rivers, also no."],
    bye: ["Mind the toys on the way out.", "Come again — you tell stories well. The kits noticed. They notice everything."],
    star: ["StarClan watches kits closest. Mothers know. We know.", "My old denmates shine bright in Silverpelt. Brightest of the lot."],
    chat: ["The kits' ambush skills improve daily. The Clan's safe. Probably.", "Speckletail outranked three deputies once. Ask her. Bring a starling first."],
  },
  adderfang: {
    open: { day: ["A riddle, young one: what walks the border twice and never leaves? …Patrol discipline. Think on it.", "Sit. An elder's words weigh more than a warrior's shout. Mine weigh the most."] },
    small: ["The code's history is written in old battles. I was IN some of them. The leg still predicts weather.", "Quizzes keep apprentices sharp. Elders sharper. Ask Smallear — he's wrong but sharp.", "In my day, the Gathering truce held because every leader FEARED their deputy. Times change. Fear works."],
    self: ["Adderfang. Elder, veteran of more border wars than the history-den remembers.", "I mentored warriors who mentor warriors. My lessons echo. Loudly."],
    prey: ["A pigeon. Acceptable. NEXT one, plump, or the riddle goes unanswered.", "Elders eat first — the code's oldest line. I remember when it was WRITTEN. Nearly."],
    help: ["Fetch my bedding and answer my riddle. In that order. Both matter.", "Walk me to the camp edge. Old legs, sharp eyes — I'll quiz you on the way."],
    bye: ["Think on the riddle.", "Off with you. The den naps at dusk. TRADITION."],
    star: ["StarClan's oldest warriors debate battle tactics. I'll fit right in.", "When I go, I'll challenge the first star I meet. It'll be a good fight."],
    chat: ["Smallear claims the badger story's exaggerated. It was FOUR badgers. FOUR.", "The kits visited. My riddle inventory is exhausted. My heart isn't."],
  },
  // ---------------------------------------------------------------- Twolegplace
  smudge: {
    open: { dawn: ["Rusty? IS that you? You look… wild. Henry says the forest cats eat bones and have fighting claws!", "You're up with the birds! The forest's changed you. There's grass on your— everywhere."], day: ["Come back to Twolegplace before dark, Rusty. The forest isn't for house cats.", "Henry says the forest cats fight BADGERS. He saw one from his fence. Or heard about one. Details."], dusk: ["You smell like pine and danger. Mostly pine. It's the danger that worries me.", "The Twolegs shut the cat doors at dusk. Even WILD cats should know that."], night: ["You're out at night? Rusty. RUSTY. There are FOXES. Henry said. Probably."] },
    small: [
      "Henry says the forest cats fight bears! …Okay, badgers. Same thing, but louder.",
      "You're really doing it — living out there. Chasing MICE. For FOOD.",
      "I dreamed you were a fire blazing through the trees. Silly, right? …Right?",
      "The Twolegs got a new food — the pellets with gravy. Come home before it's all gone. I'll save you some. I won't.",
      "Princess keeps asking about you. I told her you're a WARRIOR now. She fainted. Politely.",
      "The neighborhood's quiet without you. Well. Quieter. I talk enough for both of us.",
    ],
    self: ["Smudge! Best-friend-of-Rusty, top climber of the low fence, expert on Twoleg dinner times.", "I'm a house cat. Proud of it. The wild stuff is YOUR madness."],
    prey: ["You EAT that? Fur and… everything? Rusty. RUSTY. The pellets have gravy now.", "Fresh-kill? It's fresh PREY? That's just… catching dinner. Wild. Absolutely wild."],
    help: ["Help with WHAT? The forest doesn't have… errands, does it? What do forest cats even DO?", "I'll keep your old sun-spot warm. That's my role. I take it seriously."],
    bye: ["Come back before dark! Promise? PROMISE?", "May your… stars? May your stars light your path? Henry said that's what they say. It's a bit much."],
    star: ["What is StarClan? Is that the star thing the forest cats believe? Tell me EVERYTHING. Slowly.", "Your ancestors live in the STARS? That's beautiful. Terrifying. But beautiful. Is it real, Rusty? Do they answer?"],
    starUnknown: ["StarClan? Never heard of it. Sounds like something Henry would invent.", "Star-whatever? No idea. Is it a Twoleg thing? A food? Rusty, is it FOOD?"],
    chat: ["Henry jumped the fence in ONE leap today. AGAIN. He tells everyone.", "Rusty's a WARRIOR now. A real one. I'm basically famous by association."],
    other: ["You're not from here. Forest cat? Henry warned me about— oh, you seem nice. RUSTY'S friend! Come in! Mind the flowerbed."],
  },
  princess: {
    open: { dawn: ["Oh! You startled me. I was watching the birds on the fence.", "Morning. My Twolegs brushed me twice already. It's that kind of day."] },
    small: ["You know Smudge? Sweet tom. He's always talking about his friend who left.", "My Twolegs brush me every day. I'm far too refined for forest adventures.", "The birds are feisty this morning. One nearly landed ON me. Nearly.", "Rusty grew up here, you know. This street made him. Whatever the forest thinks it added.", "I heard he hunts his own food now. Hunts it. With his TEETH."],
    self: ["I'm Princess. This garden is my whole world and I like it that way.", "Rusty's my brother. Wild as he is, I worry. Constantly. It's my best talent."],
    prey: ["Catch your own… oh dear. Oh DEAR. You eat them?", "I once caught a moth. By accident. We don't speak of it."],
    help: ["Help? Oh — could you check if my fence-gate latched? The wind. I worry.", "You could tell me about Rusty. Just… the safe parts. The parts without teeth."],
    bye: ["Do visit again. Mind the rosemary — it frightens me and I live here.", "Soft walks. That's what my Twolegs say. I don't think it's a forest expression but it applies."],
    star: ["StarClan? Is that… a Clan thing? Like, in the stars? That's rather lovely. Do they watch over… us too?", "I've never heard of StarClan. Is it like the birds? They seem to watch everything."],
    starUnknown: ["StarClan? Is that a forest term? I know garden things. Rosemary, finches, the good sun-spot. Stars are just… stars, I thought?"],
    chat: ["The blue jay's back. It KNOWS I can't jump that high.", "Smudge says Rusty eats… never mind. Lovely weather."],
    other: ["Oh my — a forest cat, here! On MY fence! Do you… eat visitors? Kidding. Mostly."],
  },
  rusty: {
    open: { dawn: ["The forest called all night. I answered in my dreams. Henry says I yowl.", "Morning! The fence-top is warm and the forest is CLOSE today. Feel it?"], day: ["Henry says the forest cats fight badgers. I say we'd WIN.", "I stare at the trees and they stare back. Something's out there. Something BIG."] },
    small: ["Twoleg food is fine. FINE. But I keep thinking about what a mouse would… no, forget I said that.", "Henry says the forest's dangerous. Henry also says he once jumped the garden in one leap. The fence is four paw-widths.", "You're from the forest! What's it LIKE? The smells? The cats? The— everything?", "I stood at the fence-top for an hour yesterday. Just… looking. Something looked back."],
    self: ["Rusty. Kittypet, adventurer-in-waiting, professional fence-sitter.", "My Twolegs are kind. The collar is fine. The FOREST, though. The forest."],
    prey: ["You HUNT? On purpose? What's it like — the stalking? The pounce? Tell me EVERYTHING.", "Mice. Right. Cats eat mice. Obviously. I knew that. I definitely knew that."],
    help: ["Could you show me the forest edge? Just the edge. I won't cross. Probably.", "Tell me about the Clans! Are there really four? With NAMES?"],
    bye: ["Same fence-top tomorrow?", "May the forest be kind. I made that up. Do forest cats say things like that?"],
    star: ["StarClan… the forest cats believe their ancestors watch from the stars? That's the most beautiful thing I've ever heard.", "Is it TRUE, the star thing? The silver pelt full of warriors? I think about it when the Twoleg lights go out."],
    starUnknown: ["StarClan? Sounds like something from the forest. Do they… believe in a star Clan? What's it for?"],
    chat: ["The forest's louder at dusk. I hear it from the fence.", "Henry napped through the thunderstorm. I want his life."],
    other: ["A forest cat! HERE! What's it like — the hunting? The borders? The— sorry, I'm talking too fast."],
  },
  henry: {
    open: { day: ["Henry's the name. I once jumped the fence in ONE leap — ask anyone on this street.", "Sit, sit. Mind the sun-spot — it's reserved. By me. For me."], dawn: ["The birds woke Henry. Henry does not forgive. Henry naps.", "Morning. The neighborhood's quiet. Henry counts that as victory."] },
    small: ["Forest cats? Rubbish. The wildest thing out there is a fat pigeon.", "Twolegs put pellets in my bowl at dawn and dinner at six. What more could a cat want?", "The thing about badgers is the STRIPES. All that white down the back. Nature's warning label.", "Rusty ran off to live with wild cats, you know. I give him a moon. I gave him two. I'm generous."],
    self: ["Henry. Garden philosopher, fence-jump champion, hedge battle survivor.", "I fought a hedge once. The hedge won. We don't discuss it. I discuss it constantly."],
    prey: ["Eat WILD food? Henry prefers his meals dead, skinned, and delivered.", "Mice. In the FOREST. Rusty, the things you've become."],
    help: ["Henry helps by supervising. Henry is supervising now. Carry on.", "Hold my sun-spot. HOLD it. The Twolegs' cat next door has ambitions."],
    bye: ["Henry remains. Henry always remains.", "Off you go. Mind the hedge. It fights dirty."],
    star: ["StarClan? Is that the forest cats' star religion? Henry heard about it from a pigeon. Don't ask.", "Never heard of it. The stars are just the Twolegs' fairy lights that never turn off, as far as Henry's concerned."],
    chat: ["The fence-jump record stands. Henry is available for demonstrations. Paid in chin scratches.", "The next-door cat reached MY wall today. MY wall. There will be words."],
    other: ["A forest cat! Here! Henry has QUESTIONS. Are the badgers as big as they say? Bigger? Be specific."],
  },
  marmalade: {
    open: { day: ["I'm the top cat of this street. Every fence, every roof — mine.", "State your business. The street's got an order and you're not in it."], dawn: ["Morning patrol. The fence line doesn't check itself.", "The next-door cat crossed MY wall at dawn. There will be consequences."] },
    small: ["I saw a fox once. Chased it clean off MY porch. Well… it was walking away already.", "Smudge says you ran off to the forest. You've got bees in your brain, friend.", "Street law: you guard your garden, I guard mine, and nobody touches the sun-spot by the roses.", "The forest? Full of cats with NO Twolegs? Can't imagine. Wouldn't want to."],
    self: ["Marmalade. Top cat of this street, keeper of the boundaries.", "My patrols are daily. My patience is not."],
    prey: ["You CATCH them? With your mouth? Barbaric. Impressive, but barbaric.", "The street has pigeons. They're mine. All of them. In theory."],
    help: ["Help me watch the wall-line. The neighbor's cat is getting ideas.", "Walk the street with me. Respect the boundaries and we're friends."],
    bye: ["Mind the boundaries.", "The street's watched. Always."],
    star: ["StarClan. So Henry had it right after all — a Clan of cats living in the sky. Even the street answers to something, then.", "The star Clan. I walked the highest fence last night and looked up. If they watch boundaries, mine are clean."],
    chat: ["The wall was crossed. Twice. This means war.", "Smudge's friend came back looking like a WARRIOR. The street's impressed. I'm not."],
    other: ["You're not from my street. Off my fence. Now.", "Forest cat, eh? Keep your wild business off my boundaries."],
  },
  biscuit: {
    open: { day: ["Zzz… wha—? Oh. Hello. I was chasing a mouse in my dream.", "Mmph. Five more minutes. The flowerbed's warmest spot is mine. I share it. Sometimes."] },
    small: ["Have you tried the crumbs Twolegs drop at their eating-place? A delicacy.", "I dreamed the whole street was made of warm bread. Best dream. Top five.", "The sunniest spot on this street is MY flowerbed. I share it. Occasionally. To nice cats."],
    self: ["Biscuit. Napper. Dreamer. Occasionally awake.", "My talents: sleeping, dreaming, sleeping. The Twolegs say I'm lazy. I say I'm efficient at resting."],
    prey: ["You eat… mice? Real ones? I had a dream about one once. We're basically colleagues.", "I caught a crumb mid-air once. My greatest hunt. I retired after."],
    help: ["Could you… fetch that sunbeam? It moved. Never mind. I'll wait.", "Wake me if anything exciting happens. Nothing will. It's fine. Zzz."],
    bye: ["Mm. Come back. The nap misses you.", "Sweet dreams. The best kind have mice in them."],
    star: ["StarClan…? Is that a nap place? Sounds restful. I approve.", "Never heard of it. Is it warm there? Important question."],
    chat: ["Zzz… the flowerbed… mine…", "I dreamed a big orange cat. Rusty? Anyway. Naps."],
    other: ["Wha—? Oh. A stranger. Or a dream. Either way… Zzz.", "You look tired. The flowerbed's free. That's my whole hospitality."],
  },
  ginger: {
    open: { day: ["I walk the whole street twice a day. A cat needs her exercise.", "Don't scratch the fences — the Twolegs paint them every greenleaf."] },
    small: ["You smell like pine trees and… is that blood? You need a bath, dear.", "The Twolegs on the corner got a DOG. The street's in mourning.", "I know every cat's schedule on this street. Breakfast, sun, gossip, dinner. Civilization."],
    self: ["Ginger. The street's daily walker and unpaid news service.", "Exercise, sunshine, and boundaries. The three pillars of a happy cat."],
    prey: ["You HUNT? Dear me. The pellets come DAILY, you know. Free.", "Fresh-kill. Such a polite word for it."],
    help: ["Walk the street with me. The exercise will do you good — you look SCRUFFY.", "Help me check under the porch for the new kittens. Quietly, now."],
    bye: ["Off you go. Shoulders back.", "Same time tomorrow? The street's better with company."],
    star: ["StarClan? That's the forest cats' belief, isn't it? The woman with the brushing mitt mentioned it once. Do tell.", "Never heard of it, dear. We keep things simple here: food, sun, and good fences."],
    chat: ["The corner dog barked at NOTHING again. The street laughs.", "Rusty's looking well. Forest agrees with him. The PINE smell, though."],
    other: ["A forest cat on my street! Well. Mind the fences and mind your manners.", "You're new. I'd remember. Walk with me — I'll show you the boundaries."],
  },
  smokey: {
    open: { day: ["Name's Smokey. I don't run for any cat — I sit, and things come to me.", "The rumbling nests sleep in their dens all day. Warmest spot in Twolegplace."] },
    small: ["Forest? Dark and full of claws, they say. I'll take my cushion, thanks.", "Patience, young one. Everything worth having walks past a cat who sits still.", "The car roofs hold the sun till midnight. Better than any forest floor. I've checked."],
    self: ["Smokey. Roof-philosopher. The street's slowest, most successful cat.", "I watch. I wait. The world comes to Smokey. Eventually. Usually."],
    prey: ["Hunting requires running. Running is for emergencies and younger cats.", "You caught it YOURSELF? The dedication. The cardio. The horror."],
    help: ["You could move that sunbeam. No? Then sit. Talking counts as helping.", "Watch the street a moment. I'll close my eyes. That's how I supervise."],
    bye: ["Stay slow, friend.", "The roofs remember you now. That's something."],
    star: ["StarClan… the star-ancestors thing? The forest cats' belief? Beautiful, if you like that sort of thing. I like warm roofs.", "Never heard of it. When Smokey's time comes, Smokey hopes the sunbeam's good up there."],
    chat: ["The gray car came back. Third roof from the left. Perfect as ever.", "Everything passes, young one. Everything. Except naps."],
    other: ["Hm. A wanderer. Sit if you like. The roof's open. The conversation's optional."],
  },
  fluffy: {
    open: { day: ["Do you like my tail? My Twolegs say it's the fluffiest on the street.", "I'm not allowed past the gate. But I watch EVERYTHING from the window."] },
    small: ["Rusty used to live here, you know. Then one day — poof — warrior.", "The birds tease me from the feeder. They KNOW I can't jump. I can almost jump.", "I heard the forest cats fight a whole ARMY once. Smudge told me. Smudge heard it from Henry. So it's basically true."],
    self: ["Fluffy! Window-watcher, tail-proud, braver than I look. Probably.", "My Twolegs keep me in. The world keeps teasing me. One day I'll jump that gate."],
    prey: ["You eat mice?! *tail puffs* I eat… the food in the bowl. It hasshapes. Fish-shaped. It's fine. It's FINE."],
    help: ["Could you check the gate? Is it latched? Not that I'd RUN. I'd just… verify.", "Tell me one forest story. A SAFE one. With a happy ending. And no badgers."],
    bye: ["Come back! I'll have MORE questions!", "Mind the forest! And the badgers! And— just mind everything!"],
    star: ["StarClan? The star-ancestor thing? Smudge explained it. Sort of. Is it true your family becomes stars? Because that's beautiful and I'm not crying, my eyes are just fluffy."],
    chat: ["The feeder birds are BRAVE today. I showed them my teeth. They laughed.", "Rusty was on the fence again. He looked… different. Wilder. Shinier."],
    other: ["EEEK— oh. Oh, you're a FRIEND of the forest. Hello. I'm brave. This is me being brave."],
  },
  // ---------------------------------------------------------------- RiverClan
  crookedstar: {
    open: { dawn: ["The river wakes first. We follow. That is RiverClan's whole law.", "Morning. The fish run with the dawn current. Walk the bank — carefully."] },
    small: ["The river gives us everything: fish, water, and a border no ThunderClan cat dares to cross.", "My jaw has been crooked since I was a kit. It never stopped me from becoming leader — and it won't stop you either.", "Sunningrocks is RiverClan's. ThunderClan visits. There is a difference.", "The river does not argue. It waits, and it wins."],
    self: ["I am Crookedstar, leader of RiverClan.", "The river made me — broke my jaw as a kit, made my whole life. I trust it more than any cat's promise."],
    prey: ["Fish from the current, never from the still. The river rewards the patient paw.", "Eat what the river gives and thank it. RiverClan never goes hungry unless it forgets that."],
    help: ["Walk the reed bank and count the herons. If they scatter, a cat crossed.", "Swim the shallows at dusk. Report anything warm-blooded on OUR stones."],
    bye: ["May the current be kind.", "The river carries your name now."],
    star: ["StarClan watches from Silverpelt, but the river carries our dead first. Every RiverClan cat knows both paths.", "My dreams come with the river's voice. Some nights it says things I must tell no one."],
    chat: ["The fish run shallow at dawn. The apprentices will eat well.", "Sunningrocks smells of ThunderClan again. Note it. Tell no one I noticed."],
    other: ["You crossed into RiverClan ground. State your Clan — and mind the water's edge.", "The river marks our border. You are on the wrong bank of it."],
  },
  oakheart: {
    open: { dawn: ["Dawn fishing. The river's ours before ThunderClan even wakes.", "The reeds moved in the night. Something hunted here. My money's on a heron. My patrol says otherwise."] },
    small: ["Sunningrocks belongs to RiverClan, whatever ThunderClan tells its apprentices.", "A RiverClan warrior fights wet and wins dry. ThunderClan never learns that.", "I fought at Sunningrocks. The stones remember. So do I.", "The river feeds us and hides us. Their forest hides them. Fair trade. We take the rocks anyway."],
    self: ["Oakheart. Deputy of RiverClan.", "Crookedstar trusts me with the patrols. The river trusts me with the fish. Fair arrangements both."],
    prey: ["Strike with the current, not against it. The fish never see a patient paw.", "A full belly swims better than an empty one. Feed the apprentices first."],
    help: ["Check the stepping stones. Wet paws there mean a ThunderClan cat got brave.", "Fish the deep pool. The Clan eats what we bring."],
    bye: ["Stay off our stones.", "The river carries you well."],
    star: ["StarClan granted Crookedstar his lives. The river delivered them. Our faith has wet feet.", "The ancestors watch from the stars AND from the water. RiverClan honors both."],
    chat: ["The stones are warm. ThunderClan will come sniffing by noon.", "Leopardfur's patrol found a fish-cacher. Non-RiverClan. Deal with it quietly."],
    other: ["A forest cat, on our bank. Brave or stupid. The river will decide which.", "This is RiverClan territory, walker of dry land. Cross at your own risk."],
  },
  leopardfur: {
    open: { dawn: ["Dawn patrol. Move like you mean it.", "The shallows are full. The border is marked. The day is promising."] },
    small: ["You crossed our river? Bold. Most cats from the forest won't even touch the water.", "Leopards swim, climb, and fight. So do I.", "ThunderClan calls us soft. Then they meet us on the stones and stop calling.", "The river feeds us better than your forest ever will. That's why you keep sniffing at our bank."],
    self: ["Leopardfur. RiverClan's sharpest hunter and proudest warrior.", "I hunt like I fight: perfectly. It's not boasting if it's true."],
    prey: ["Your crouch is decent. Your timing is not. Watch the water. Learn.", "The river gives; the river keeps score. Bring back what you take."],
    help: ["Patrol the stepping stones. Anything warm-blooded on OUR rocks is a problem. Solve it.", "Fish the rapids. If you can. Most forest cats can't."],
    bye: ["Stay off our stones.", "The river remembers intruders."],
    star: ["StarClan gave our leader nine lives and the river gave us everything else. We're not ungrateful. We're busy.", "The ancestors watch from Silverpelt. The river carries our dead. Both are ours."],
    chat: ["The stones are ours again. For now.", "Silverstream hunts the shallows alone. Someone should tell Crookedstar. It won't be me."],
    other: ["ThunderClan scent. On MY bank. The stones are behind me, kittypet-breath.", "Wrong river, forest-walker. Turn back or swim."],
  },
  silverstream: {
    open: { dawn: ["The river at dawn is beautiful — the mist sits on it like a pelt.", "Morning! The fish are slow and the border's quiet. Perfect combination."] },
    small: ["You smell of the forest. Try the fish — you'll never look at a mouse the same way.", "The river is beautiful at dawn, when the mist sits on it like a pelt.", "Father says the border is serious business. The river says it's beautiful. I listen to both.", "I'd like to see a Gathering someday soon — all four Clans, one island of stones. Imagine it."],
    self: ["Silverstream. Daughter of Crookedstar, hunter of the shallows.", "The river runs in my blood. Literally — I was born in its worst flood."],
    prey: ["Strike where the water foams. The fish never expect patience from the fast ones.", "First fish of the day goes to the elders. RiverClan law and RiverClan love."],
    help: ["Walk the reed bank with me? Two pairs of eyes, twice the fish.", "Help me check the stepping stones — and keep your paws DRY, forest cat."],
    bye: ["May the river be kind to you.", "Come back at dusk — the water glows. You'll see."],
    star: ["StarClan watches the river too. Grandmother told me the stars reflect in it — every night, all our ancestors look back.", "The half-moon walk to the Moonstone is my dream. Barkface says the stars speak loudest in stone."],
    chat: ["The mist on the water this morning — like hunting in a cloud.", "Oakheart says the stones are ours. He's right. He's usually right."],
    other: ["Oh! A forest cat. On our bank. You're brave — or lost. Can you swim? No? Then definitely lost."],
  },
  // ---------------------------------------------------------------- WindClan
  tallstar: {
    open: { dawn: ["The moor runs cold and bright at dawn. Perfect running weather.", "Wind from the hills, rabbits on the ridge. WindClan asks for nothing more."] },
    small: ["Welcome to WindClan. We run where other cats would lose their breath.", "The moor is open and the sky is wide. A WindClan cat trusts its legs above all.", "I have traveled farther than any Clan cat, and I still say: there is no place like the moor.", "The Gathering truce holds because every Clan fears the open moor wind. Good. Let them.", "Mudclaw wants tighter borders. Deadfoot wants faster patrols. I want both, quieter."],
    self: ["I am Tallstar, leader of WindClan.", "My tail is long, my legs are longer, and my patience — my patience is a moor-wide thing."],
    prey: ["Rabbits run downwind. Hunt upwind, run downwind. The moor teaches patience AND speed.", "Feed the kits before the warriors. The moor provides; we remember our smallest."],
    help: ["Run the border markers with me. You'll see the whole sky do it.", "Watch the rabbit runs at noon. Report anything that isn't a rabbit."],
    bye: ["Run well.", "The wind carries your name kindly."],
    star: ["StarClan's stars shine widest over the open moor. No trees in the way — just us and the ancestors.", "The Moonstone is close to our border. Mothermouth hums on cold nights. Every WindClan cat hears it."],
    chat: ["The ridge rabbits are running. The apprentices are running faster.", "Mudclaw marked the border twice today. Eager tom. Good tom. Careful tom."],
    other: ["A visitor on the moor! State your Clan and your wind, friend.", "You walk forest-soft for moor country. Speak — who sent you?"],
  },
  mudclaw: {
    open: { dawn: ["Dawn patrol, fast order. The moor doesn't forgive slow starters.", "Border markers by sunup. Rabbit runs by noon. Keep up."] },
    small: ["ThunderClan cats sneak through trees. We cross the moor before you can blink.", "Rabbits are faster than any mouse. Keep your belly low and your legs ready.", "Tallstar is patient. The moor is not. Someone has to remember that.", "I've marked this border every dawn since I was made warrior. It will be marked tomorrow too."],
    self: ["Mudclaw. WindClan warrior, border-tight, always.", "The moor feeds the fast and eats the careless. I intend to be fed."],
    prey: ["Stalk with the wind in your face. ALWAYS. Even I forget sometimes. Almost never.", "Bring the rabbit down before it reaches the ridge or you've lost it AND your dignity."],
    help: ["Run the markers. Fast. The moor's big and the day's short.", "Watch the Thunderpath side. Monsters and strangers both come from there."],
    bye: ["Run fast, land hard.", "Mind the wind. It carries everything — scent, sound, and gossip."],
    star: ["StarClan watches the open moor. Nowhere to hide, which suits me fine.", "Barkface reads the stars. I read the weather. Both matter. His more, if you ask him."],
    chat: ["The markers need renewing by the Twoleg fence-line.", "Deadfoot outran me today. ONCE. It's noted."],
    other: ["Hold it. This is WindClan ground. Name yourself or run — and I'm faster.", "A stranger on the moor. There's nowhere to hide out here. Good. Talk."],
  },
  deadfoot: {
    open: { dawn: ["One paw is twisted — doesn't slow me down. Race you to the border!", "Morning! The moor's flat and fast. My kind of day."] },
    small: ["Tallstar says the moor rewards the patient runner. I'd rather not be patient.", "This paw? Born crooked. Hunts straight. Ask the rabbits — no, you can't. I ate them.", "Mudclaw runs angry. I run clever. The rabbits never see either of us. One of us eats better.", "A forest cat on the moor! You'll want to watch the sky out here — there's nowhere to hide from hawks OR gossip."],
    self: ["Deadfoot. Deputy of WindClan. Yes, THIS is the deputy. Yes, the paw.", "Tallstar picked me for the thinking, not the running. The running's a bonus."],
    prey: ["Rabbits zigzag on the third turn. Wait for the third turn. Every time.", "Feed the queens first. The moor's law: the fastest eat last and proudest."],
    help: ["Patrol the quarry side. Mind the cliff-edges — the moor drops where you least expect.", "Help me count the rabbit runs. Three fresh ones means a good moon ahead."],
    bye: ["Run clever.", "The moor's flat. TheCompany's honest. Come again."],
    star: ["StarClan runs the moor with us on clear nights. You can HEAR them — hooves of wind, they say.", "Barkface says my paw was StarClan's joke. I say the joke hunts fine."],
    chat: ["Border's marked. My paw aches. Worth it.", "The ridge run was perfect today. The wind agreed. The rabbits didn't."],
    other: ["Well now. A visitor. State your business — the moor's open but the Clan's not.", "You walk like a forest cat. Careful on the open ground. Hawks don't care about Clan names."],
  },
  barkface: {
    open: { dawn: ["The moor herbs wake with the sun. Chamomile first. It knows the hour better than I do.", "Morning. The wind blew all night — my dreams were restless. Yours?"] },
    small: ["WindClan herbs grow where the wind strips the soil. Chamomile calms a cat better than any mouse.", "StarClan walks close on the moor. The Moonstone is just over the border, and its light never fades.", "I read the stars as other cats read trails. Last night was… troubled. I'll say no more yet.", "An omen came with the wind. Tallstar knows. The Clan will know when the time is right."],
    self: ["Barkface, medicine cat of WindClan.", "I've served the moor longer than most of its warriors have been alive. The herbs remember me."],
    prey: ["Eat. Healing needs feeding. Even the stubborn ones — ESPECIALLY the stubborn ones.", "Bring me the rabbit whole. The bones tell me about the moor's health, and ours."],
    help: ["Fetch chamomile from the far rise. The blue-flowered patches only. Mind the wind.", "Sit with the elder while I gather. Your presence is medicine too — the quiet kind."],
    bye: ["Walk with the wind behind you.", "StarClan keep your paws sure."],
    star: ["StarClan speaks clearest from the moor-top. Come at half-moon and listen with me.", "The stars were restless last night. Something stirs beyond our borders. I have told Tallstar — and now, apparently, you."],
    chat: ["The chamomile's blooming early. A good season. Probably. Likely. We'll see.", "The Moonstone glowed last night. I felt it from here. That's either an omen or the wind."],
    other: ["You carry another Clan's scent, and a hurt with it. Sit. A medicine cat helps any cat — that's the oldest law.", "An outsider, on MY moor. If you're injured, I'll treat you. If you're hunting — the wind will deal with you."],
  },
  // ---------------------------------------------------------------- ShadowClan
  brokenstar: {
    open: { dawn: ["ShadowClan wakes before the forest. That is why ShadowClan owns it.", "Apprentices at dawn. They train hard or they train elsewhere."] },
    small: ["This is ShadowClan territory, kittypet. The pines swallow intruders whole.", "My apprentices are made warriors before they are six moons old. Weakness is a choice.", "Tell your Bluestar: ShadowClan remembers every border they steal from us.", "The marsh feeds the strong and buries the weak. My Clan eats well.", "ThunderClan grows soft. Their elders nap while ours rule."],
    self: ["I am Brokenstar, leader of ShadowClan.", "The pines obey me. So does everything that hunts in them."],
    prey: ["Frogs and lizards — ShadowClan eats what the forest is too proud to touch.", "Hunt the marsh or go hungry. My Clan does not cater to picky stomachs."],
    help: ["Patrol the Thunderpath edge. Report ANY ThunderClan scent to me personally.", "Watch the apprentices train. Learn what real discipline looks like."],
    bye: ["The pines are watching.", "Run, little cat. Run."],
    star: ["StarClan granted me nine lives. They can watch what I do with them.", "The ancestors favor strength. ShadowClan has always known this."],
    chat: ["The apprentices trained before dawn. Good. They'll be warriors young.", "The Thunderpath patrol found ThunderClan scent. Again. Note the day."],
    other: ["An intruder walks my pines. Speak your Clan, then your goodbye.", "You crossed the Thunderpath to be here? The marsh will enjoy that."],
  },
  blackfoot: {
    open: { dawn: ["Dawn patrol. The marsh doesn't patrol itself and neither do I.", "Up. Brokenstar wants the border walked before the fog lifts."] },
    small: ["You wandered far from the forest, little cat. The pines are ours.", "ShadowClan needs no friends. We take what we need.", "The Thunderpath separates the Clans. Monsters keep it. We keep the monsters' respect.", "Brokenstar leads. I enforce. The marsh runs smoothly on that arrangement."],
    self: ["Blackfoot. Deputy of ShadowClan.", "My paws are black from the marsh-mud. My record's blacker. Ask around — carefully."],
    prey: ["Frogs. Marsh-frogs. You'd be surprised what a hungry cat learns to love.", "Hunt the wet ground. Prey is where OTHER cats won't go."],
    help: ["Patrol the pine-shadow. Anything that crosses the scent-line, you report.", "The apprentices train at dawn. Watch. Learn what ShadowClan expects."],
    bye: ["Stay out of the pines.", "The marsh remembers paw-steps. All of them."],
    star: ["StarClan gave Brokenstar nine lives. ShadowClan does the rest.", "The ancestors watch the strong. I intend to be watched."],
    chat: ["The border's marked in mud and attitude.", "Brokenstar wants the Thunderpath watched at moonhigh. It will be."],
    other: ["A stranger in the pines. That's a short career.", "Wrong forest, cat. The exit's north. The marsh is everywhere else."],
  },
  clawface: {
    open: { dawn: ["Dawn. The scars ache. The appetite doesn't.", "Patrol. Move. The marsh wakes hungry."] },
    small: ["You crossed the Thunderpath alone? Monster-food for sure.", "Every scar has a story. Most of mine are someone else's funeral.", "The pines hide everything. Bodies, borders, bad decisions. It's why I like them.", "ThunderClan fights loud. ShadowClan fights LAST — when you've already lost."],
    self: ["Clawface. ShadowClan warrior. The scars came with the job.", "I've fought every Clan in this forest. None of them came back for seconds."],
    prey: ["Frogs. Plenty of them in the wet season. A cat adapts or starves.", "The marsh feeds those who aren't picky. I've never been picky."],
    help: ["Walk the pine-shadow line. If you see ThunderClan scent, mark over it. Hard.", "Carry prey to the nursery. Even ShadowClan's kits eat first."],
    bye: ["Watch the Thunderpath.", "The pines close behind you. Good."],
    star: ["StarClan watches the pines. Let them watch. We fight anyway.", "The ancestors respect scar-cats. I'm well respected."],
    chat: ["The marsh was loud last night. Something big moved through.", "Brokenstar's patrols double this moon. The forest will notice."],
    other: ["You're far from your own ground, little cat. The pines bite.", "A stranger. In MY marsh. Bold. Stupid. Same paw-steps."],
  },
  runningnose: {
    open: { dawn: ["A-tshoo! …Morning. The marsh-dew aggravates the nose. It always aggravates the nose.", "Dawn. I must sort the herbs before the damp creeps in. Mind the— a-tshoo!"] },
    small: ["My nose runs, but my visions run farther. StarClan is restless — they speak of a fire.", "Even Brokenstar's ShadowClan needs a medicine cat. Someone must read what the stars are saying.", "The kits are coughing again. Marsh-damp. I need more catmint than the marsh gives.", "I serve ShadowClan. The herbs serve me. Brokenstar serves himself. The arrangement… functions."],
    self: ["Runningnose, medicine cat of ShadowClan. Yes, that IS my name. Yes, it's fair.", "I read the stars for a leader who reads only strength. It keeps a cat humble. And sniffling."],
    prey: ["Eat something. Medicine works poorly on empty stomachs. MY stomach excepted — it's always empty-feeling.", "Bring the prey whole. The entrails… never mind. The bones. Just the bones tell me things."],
    help: ["Gather catmint from the twoleg-garden edge. Dry leaves only. And hurry — a-tshoo! — before the dew.", "Fetch cobweb from the pine-stumps. The clean moss-grey patches, not the brown."],
    bye: ["A-tshoo… StarClan keep you. Someone should.", "Go carefully. The marsh takes the uncareful."],
    star: ["StarClan speaks to me nightly. Lately they speak of FIRE. A fire that could save the forest… or burn it. I've told Brokenstar. He heard 'fire' and smiled. That worried me.", "The stars are uneasy over ALL the Clans. Medicine cats feel it first. Remember you heard it from me."],
    chat: ["A-tshoo! The catmint's running low. The coughs are running high.", "The stars were restless again. I'll tell Brokenstar. He'll ignore me. I'll tell him anyway."],
    other: ["You're not ShadowClan, and you're hurt. Sit. A-tshoo! Medicine cats treat any cat — my leader disagrees. My leader is wrong."],
  },
  russetfur: {
    open: { dawn: ["Dawn patrol. The marsh is coldest and best before sunhigh.", "Up. Frogs don't catch themselves, and no one else here catches them properly."] },
    small: ["Frogs and lizards — ShadowClan eats what the forest is too proud to touch.", "You crossed the Thunderpath alone? Monster-food for sure.", "Brokenstar trains us hard because the forest is HARD. ThunderClan coddles. ShadowClan survives.", "The marsh hides our borders and our business. That's the way we like it."],
    self: ["Russetfur. ShadowClan warrior, marsh-hunter, survivor.", "I've hunted the wet ground since I was six moons old. The marsh knows my paws."],
    prey: ["Strike at the ripple, not the frog. The ripple lies.", "Frog first, complaint later. The Clan eats what I catch and likes it."],
    help: ["Patrol the reed-bank. Loud intruders scare the frogs. Quiet ones scare me. Neither is welcome.", "Bring marsh-heron eggs to the nursery. Carefully. The herons have opinions."],
    bye: ["Mind the wet ground.", "The marsh swallows stragglers. Walk faster."],
    star: ["StarClan watches the marsh. Even they'd admit it's a hard posting.", "The ancestors favor ShadowClan's toughness. We've earned every star's respect. Probably."],
    chat: ["The frog-runs are fat this moon. The Clan eats.", "Brokenstar's new apprentices train hard. They'll be warriors young. The marsh approves."],
    other: ["A forest cat. In the marsh. You'll sink by moonhigh. Leave now, stay dry.", "This ground is ShadowClan's. The reeds will hide you — from everyone but me."],
  },
  barley: {
    open: { dawn: ["Mornin'! The barn mice are plump this season. Help yourself — barn rule: every hunter eats.", "The Twolegs fed the cows early. The barn's warm already. Perfect mornin'."] },
    small: ["Barn mice are the best mice. Ask any cat that's ever slept in hay.", "I know the Clans pass by — I hear the patrol-talk from the hedges. Fine cats, most of them. Loud, all of them.", "The Twolegplace cats come and go. Henry brags, Smokey sulks, and the food's better here anyway.", "A forest cat at my barn? You're always welcome. The hay doesn't judge and neither do I."],
    self: ["Barley. Barn cat, mouser, friend to travelers.", "I did the Clan-life once. Chose the barn instead. Best mouse I ever caught was the first one here."],
    prey: ["Barn mice — fat, slow, and abundant. Take a few. The barn provides.", "You HUNT for a whole Clan? Respect. The barn only feeds one fat tom and his appetite."],
    help: ["Mind the barn gate for me? The latch slips and the chickens escape. Everyone suffers.", "Walk the hedge-line with me. There's fox-scent again and I'd like a brave second opinion."],
    bye: ["Come back any time. The hay's warm.", "Safe travels — mind the monsters on the path."],
    star: ["StarClan, eh? The Clans' star-ancestors. I've heard the patrol-cats mention it. Nice thought. The barn keeps simpler beliefs: mice, hay, and good neighbors.", "Never held with all the star-talk myself. But if it helps a cat face the dark, I say believe away."],
    chat: ["The barn mice are getting bold. Fresh hunting weather.", "Fox-scent by the north hedge again. I'll sleep with one ear up."],
    other: ["A Clan cat! Welcome, welcome. Hay's warm, mice are plenty. What brings you down the lane?", "You're a long way from the pines — or the oaks. Either way, the barn doesn't mind."],
  },
};

/** Choice-reply pools keyed by intent, per cat when present, else generic per stance. */
const GENERIC: Record<string, Record<Stance, string[]>> = {
  prey: {
    warm: ["Good hunting keeps the whole Clan strong. Well done.", "You hunt well. The Clan notices such things."],
    curious: ["You've been hunting? Tell me where the prey runs this season.", "The prey's been jumpy lately. Good to know someone's still catching it."],
    wary: ["So the Clan eats because of cats like you. Keep it up.", "Hm. Not bad. The pile could use more of that."],
    hostile: ["Prey? From you? The forest must be feeling generous.", "Anyone can stumble over prey. Skill is catching it twice."],
    gruff: ["Food's food. Bring enough and I'll not complain. Much.", "Hmph. Fresh prey. Better than talk."],
  },
  weather: {
    warm: ["The sky's kind today. Enjoy it — the forest rarely repeats itself.", "A fine day for it. The prey thinks so too."],
    curious: ["Strange weather we've had. The herbs feel it before we do.", "The wind changed twice yesterday. Something's stirring."],
    wary: ["Weather's weather. The Clan adapts. That's the whole lesson.", "Rain or shine, the borders need walking."],
    hostile: ["Complaining about weather? Real warriors hunt in it.", "The rain hides scent. For us or for our enemies — depends on the day."],
    gruff: ["My joints say rain. My joints are never wrong. Unfortunately.", "Sun. Rain. Who cares. Feed me and I'll admire the sky."],
  },
  help: {
    warm: ["I could use an extra pair of paws, actually. Come along.", "Good of you to offer. The Clan could use the help."],
    curious: ["There's always something. The Clan runs on willing paws.", "Maybe. Walk with me and we'll find out what needs doing."],
    wary: ["Help? Prove you can first. Then we'll talk about patrols.", "The Clan doesn't hand out duties to strangers. Earn one."],
    hostile: ["You want to help? Stay out of the way. It's a skill. Practice it.", "The Clan's duties aren't yours to volunteer for. Yet."],
    gruff: ["Hmph. If you must help, be quiet about it.", "Fine. Fetch prey. Tell no one I asked."],
  },
  bye: {
    warm: ["May StarClan light your path, friend.", "Walk safely. Come again soon."],
    curious: ["Walk well. The forest's full of paths — choose the quiet ones.", "Off with you, then. Come back with stories."],
    wary: ["Mind the borders on your way out.", "Go carefully. The forest watches."],
    hostile: ["Finally.", "The forest is better without you in it. No offense. Some."],
    gruff: ["Go on, get. …Come back sometime. Don't make it weird.", "Hmph. Off you go then."],
  },
};

// ---------------------------------------------------------------------------
// Openings
// ---------------------------------------------------------------------------

/** Hand-authored story beats (mode === "story"): keyed "npcId:step". */
const STORY_OPEN: Record<string, string[]> = {
  // step 0 — kittypet days
  "smudge:0": [
    "Rusty! There you are. Henry says the forest cats fight BADGERS — big ones, with stripes down their backs. You're not thinking of going out there, are you?",
    "There you are! You've been staring at that fence all morning. Rusty… you're not seriously thinking about the forest, are you?",
  ],
  "rusty:0": [
    "You feel it too, don't you? The forest. It's louder today — like it's calling. Henry says I'm mouse-brained. Maybe. But I have to LOOK.",
    "I sat on the fence-top for an hour. Something watched me back from the trees. I'm going in. Just to the edge. Just to see.",
  ],
  // step 2 — the apprentice attack / meeting Graypaw
  "graypaw:2": [
    "Good fight! You'd have made a decent warrior — for a kittypet. I'm Graypaw, of ThunderClan. Wait until Bluestar hears about this!",
    "You scratched me! That was GREAT. I'm Graypaw — ThunderClan apprentice. You're the kittypet everyone's been scenting, aren't you?",
  ],
  // step 4 — Bluestar's offer
  "bluestar:4": [
    "You have come to the right place, young one. I have watched you from the Twoleg gardens — you hunt like a warrior already. Fire alone can save our Clan. Will you join ThunderClan?",
    "I am Bluestar, leader of ThunderClan. I have watched you at the fence-line, and I believe StarClan sent you. Will you leave your Twolegs and join us?",
  ],
  // step 5 — Lionheart's test
  "lionheart:5": [
    "So you're the kittypet Bluestar wants. The Clan has doubts. Give me one reason to have none — and don't flinch.",
    "Lionheart. Warrior of ThunderClan. Bluestar says you join us; the Clan says you must prove it. Are you ready to be tested, kittypet?",
  ],
  // step 6 — before StarClan, meeting Spottedleaf
  "spottedleaf:6": [
    "Welcome. I dreamed you were coming — a flame among the bracken. Learn well, and ThunderClan will be glad of you.",
    "So you are the fire from my dream. I am Spottedleaf, medicine cat of ThunderClan. StarClan has plans for you, I think.",
  ],
  // step 10 — the river, Oakheart
  "oakheart:10": [
    "So Bluestar takes kittypets now? The river keeps RiverClan strong, little fire. What keeps ThunderClan strong — your Twolegs?",
    "Crossing to OUR bank? Bold. I am Oakheart, deputy of RiverClan. Touch those stones wrong and you'll learn why they're ours.",
  ],
  // step 11 — Yellowfang at Snakerocks
  "yellowfang:11": [
    "You found me, kit. Clever nose. Now go — tell no one you saw me. A medicine cat's debts are her own, and this one's bank is closed.",
    "What do you want? I'm hungry, I'm old, and I'm not in the mood. You're the fire-kit they talk about? Hmph. You smell of Twolegs still.",
  ],
  // step 12 — WindClan
  "tallstar:12": [
    "A ThunderClan cat on the moor! You have sharp eyes, young flame. Run with us once, and your legs will never forget it.",
    "Welcome to WindClan, fire-kit. The moor is open — so are my ears. Speak your errand and catch your breath first. You'll need both.",
  ],
};

/** Story-step overrides that replace an NPC's regular availability gating note. */
/** Does this cat exist right now? Story Mode follows the timeline windows;
 *  the persistent Online/Free worlds host every cat marked inOnline. */
export function isAvailable(p: CharacterProfile, mode: string, storyStep: number): boolean {
  if (mode !== "story") return p.inOnline !== false;
  const from = p.storyFrom ?? 0;
  const until = p.storyUntil ?? Number.POSITIVE_INFINITY;
  return storyStep >= from && storyStep < until;
}

function openingFor(p: CharacterProfile, ctx: DialogueContext): string {
  const seed = (ctx.talked?.[p.id] ?? 0) + hashStr(p.id) + Math.floor(ctx.hour / 4);

  // hand-authored story beats win first
  const storyKey = `${p.id}:${ctx.storyStep}`;
  if (ctx.mode === "story" && STORY_OPEN[storyKey]) return pick(STORY_OPEN[storyKey], seed);

  const bank = V[p.id] ?? {};
  const band = bandFor(ctx.hour);
  const wg = weatherGroupFor(ctx.weather);

  // same-Clan stranger vs outsider: relationship colors the greeting
  const playerIsClanmate = p.clan === ctx.player.clan && p.clan !== "kittypet";


  if (!playerIsClanmate && bank.other) return pick(bank.other, seed);

  // repeat visits: alternate the band greeting with small talk so a cat you
  // know well does not open with the same weather line every single time
  const talks = ctx.talked?.[p.id] ?? 0;
  if (talks > 0 && bank.small && talks % 2 === 1) return pick(bank.small, seed + 3);

  if (bank.open && bank.open[band]) return pick(bank.open[band]!, seed);
  if (bank.wx && bank.wx[wg]) return pick(bank.wx[wg]!, seed + 1);
  if (bank.small) return pick(bank.small, seed + 2);

  // stance-driven fallback (knowledge-safe generic voice)
  return pick(GENERIC.prey[p.voice.stance], seed);
}

// ---------------------------------------------------------------------------
// Choice pools
// ---------------------------------------------------------------------------

function replyFor(p: CharacterProfile, kind: "prey" | "weather" | "help" | "bye", ctx: DialogueContext): string {
  const seed = (ctx.talked?.[p.id] ?? 0) + 7 + hashStr(kind + p.id);
  const bank = V[p.id] ?? {};
  const personal = kind === "bye" ? bank.bye : kind === "prey" ? bank.prey : kind === "weather" ? bank.wx?.[weatherGroupFor(ctx.weather)] : undefined;
  if (personal && personal.length) return pick(personal, seed);
  const pools = kind === "weather" ? GENERIC.weather : kind === "bye" ? GENERIC.bye : kind === "help" ? GENERIC.help : GENERIC.prey;
  return pick(pools[p.voice.stance], seed);
}

function aboutSelf(p: CharacterProfile, ctx: DialogueContext): string {
  const seed = (ctx.talked?.[p.id] ?? 0) + 13;
  const bank = V[p.id] ?? {};
  if (bank.self) return pick(bank.self, seed);
  const clanLine = p.clan === "thunderclan" ? "ThunderClan" : p.clan === "riverclan" ? "RiverClan" : p.clan === "windclan" ? "WindClan" : p.clan === "shadowclan" ? "ShadowClan" : "this corner of the world";
  return `I am ${p.name}, ${p.rank.toLowerCase()} of ${clanLine}. ${p.personality.split(".")[0]}.`;
}

const SMALLTALK_INTRO: Record<Stance, string> = {
  warm: "Ah, good to see you.",
  curious: "Well now. Look who it is.",
  wary: "Hm. You again.",
  hostile: "You. What now.",
  gruff: "Hmph. What do you want.",
};

function smallTalk(p: CharacterProfile, ctx: DialogueContext): string {
  const seed = (ctx.talked?.[p.id] ?? 0) + 29 + Math.floor(ctx.hour / 6);
  const bank = V[p.id] ?? {};
  if (bank.small && bank.small.length) return pick(bank.small, seed);
  // knowledge-safe generic smalltalk per Clan identity
  const clanSmall: Record<string, string[]> = {
    thunderclan: ["The camp's been busy today. Patrols out, prey running.", "Bluestar keeps this Clan steady. That's no small work."],
    riverclan: ["The river's high this moon. The fish run deep.", "RiverClan stays strong while the river stays full."],
    windclan: ["The wind's strong on the ridge today. Good running weather.", "The moor's open and the rabbits are moving."],
    shadowclan: ["The pines are quiet today. Quiet is good.", "The marsh feeds those who work it."],
    kittypet: ["The Twolegs have been busy in the gardens today.", "A warm windowsill is the finest thing in the world. Ask any cat that has one."],
    rogue: ["The forest doesn't care whose ground you claim. Only whether you can keep it.", "I mind my own patch. Other cats should mind theirs."],
  };
  return `${SMALLTALK_INTRO[p.voice.stance]} ${pick(clanSmall[p.clan] ?? clanSmall.thunderclan, seed)}`;
}

/** StarClan answers. The gating core of the knowledge system. */
export function starClanReply(p: CharacterProfile, ctx: DialogueContext): { text: string; learn?: KnowledgeFlag } {
  const seed = (ctx.talked?.[p.id] ?? 0) + 41;
  const bank = V[p.id] ?? {};
  if (knows(p, "starclan", ctx)) {
    if (bank.star) return { text: pick(bank.star, seed) };
    // generic informed answer, rank-shaped
    if (p.rank.toLowerCase().includes("medicine")) return { text: "StarClan is our ancestors, watching from Silverpelt. They speak to medicine cats in dreams — and lately, their words come with weight." };
    return { text: "StarClan watches from Silverpelt — every warrior's ancestors among the stars. Respect them and they light your path." };
  }
  // this cat has never (yet) heard of StarClan: its confusion is its own
  if (bank.starUnknown) return { text: pick(bank.starUnknown, seed), learn: "starclan" };
  const confused: Record<string, string> = {
    kittypet: "StarClan? What's that — some forest cat thing? I've lived here all my life and I've never heard of any star Clan.",
    rogue: "StarClan? Hah. Never heard of it. Out here we answer to no ancestors.",
  };
  return { text: confused[p.clan] ?? confused.kittypet, learn: "starclan" };
}

// ---------------------------------------------------------------------------
// Public conversation builder (Game.tsx)
// ---------------------------------------------------------------------------

/**
 * Build a full conversation for an NPC. Choices are knowledge- and
 * relationship-aware; choosing the "mention StarClan" choice on a cat that
 * lacks the flag LEARNS it for that one cat (effect "learn").
 */
export function buildDialogue(npcId: string, ctx: DialogueContext): DialogueTree {
  const p = profileFor(npcId);
  const bond = ctx.bonds[p.id] ?? 0;

  const star = starClanReply(p, ctx);
  const choices: DialogueChoice[] = [
    { label: smallTalkLabel(p, ctx), reply: smallTalk(p, ctx), effect: bond < 2 ? "bond" : undefined },
    { label: "Tell me about yourself.", reply: aboutSelf(p, ctx), effect: bond < 2 ? "bond" : undefined },
    { label: "The prey's running well, I hear.", reply: replyFor(p, "prey", ctx) },
    { label: "What about this weather?", reply: replyFor(p, "weather", ctx) },
    { label: starClanLabel(p, ctx), reply: star.text, effect: star.learn ? "learn" : undefined, learn: star.learn },
  ];

  // patrol offer: only warriors/deputies/leaders of the player's own Clan, or senior cats generally
  if (playerMayPatrol(p, ctx)) {
    choices.push({ label: "Can I join your patrol?", reply: replyFor(p, "help", ctx), effect: "patrol" });
  } else {
    choices.push({ label: "Anything I can help with?", reply: replyFor(p, "help", ctx), effect: bond < 1 ? "bond" : undefined });
  }
  choices.push({ label: "I should go.", reply: replyFor(p, "bye", ctx), effect: "end" });

  return { npcId: p.id, opening: openingFor(p, ctx), choices };
}

function smallTalkLabel(p: CharacterProfile, ctx: DialogueContext): string {
  const bond = ctx.bonds[p.id] ?? 0;
  if (bond >= 2) return `Good to see you, ${p.name}.`;
  if (p.clan === ctx.player.clan) return `Greetings, ${p.name}.`;
  if (p.clan === "kittypet") return "Hello there.";
  return `Hail, ${p.name} of ${p.clan === "thunderclan" ? "ThunderClan" : p.clan === "riverclan" ? "RiverClan" : p.clan === "windclan" ? "WindClan" : p.clan === "shadowclan" ? "ShadowClan" : "the forest"}.`;
}

function starClanLabel(p: CharacterProfile, ctx: DialogueContext): string {
  return knows(p, "starclan", ctx) ? "Tell me about StarClan." : "Mention StarClan.";
}

function playerMayPatrol(p: CharacterProfile, ctx: DialogueContext): boolean {
  const rank = p.rank.toLowerCase();
  const isFighter = rank.includes("warrior") || rank.includes("deputy") || rank.includes("leader") || rank.includes("guard");
  return isFighter && ctx.player.clan === p.clan;
}

// ---------------------------------------------------------------------------
// NPC↔NPC ambient conversations (engine bubbles)
// ---------------------------------------------------------------------------

type RelationKind = "mentor-apprentice" | "apprentice-peers" | "queens" | "elders" | "medicine" | "warriors" | "leader-deputy" | "kittypets" | "cross-clan" | "general";

function relationFor(a: CharacterProfile, b: CharacterProfile): RelationKind {
  if (a.mentor === b.name || b.mentor === a.name) return "mentor-apprentice";
  if (a.rank.toLowerCase() === "apprentice" && b.rank.toLowerCase() === "apprentice") return "apprentice-peers";
  if (a.rank.toLowerCase() === "queen" && b.rank.toLowerCase() === "queen") return "queens";
  if (a.age === "elder" && b.age === "elder") return "elders";
  if (a.rank.toLowerCase().includes("medicine") && b.rank.toLowerCase().includes("medicine")) return "medicine";
  if (a.rank.toLowerCase() === "leader" || b.rank.toLowerCase() === "leader") return "leader-deputy";
  if (a.clan === "kittypet" && b.clan === "kittypet") return "kittypets";
  if (a.clan !== b.clan) return "cross-clan";
  if (a.rank.toLowerCase().includes("warrior") && b.rank.toLowerCase().includes("warrior")) return "warriors";
  return "general";
}

const PAIR_LINES: Record<RelationKind, (a: CharacterProfile, b: CharacterProfile) => string[]> = {
  "mentor-apprentice": (a, b) => {
    const mentor = a.mentor === b.name ? b : a; // the mentor side
    const app = mentor === a ? b : a;
    const m = V[mentor.id]?.chat ?? ["Keep your tail still when you stalk.", "Eat first. Training after."];
    const ap = V[app.id]?.chat ?? ["Can we train at the Hollow today?", "I'll beat you there this time!"];
    return [pick(ap, 1), pick(m, 2), pick(m, 3)];
  },
  "apprentice-peers": (a, b) => {
    const la = V[a.id]?.chat ?? [];
    const lb = V[b.id]?.chat ?? [];
    return [pick(la.length ? la : ["Race you to the Tallrock!"], 1), pick(lb.length ? lb : ["Only if you count cheating!"], 2), pick(la.length ? la : ["My mentor says I pounce crooked. Rude."], 3)];
  },
  queens: () => ["The kits pounced my tail all morning. My tail surrenders.", "Mine caught a moth today. Whole ceremony followed.", "One more moon and they'll be climbing Tallrock."],
  elders: () => ["In my day, apprentices feared their mentors. Now they nap ON them.", "My knees predict rain. My knees are never wrong.", "Tell the story about the bees again. The part where Smallear runs."],
  medicine: () => ["The borage is nearly gone. I must gather more before moonhigh.", "The elders cough at night. Watch the damp.", "The stars were restless. I'll tell the leader. Quietly."],
  warriors: (a, b) => {
    const la = V[a.id]?.chat ?? [];
    const lb = V[b.id]?.chat ?? [];
    return [pick(la.length ? la : ["Border's quiet. Too quiet, some say. I say quiet is GOOD."], 1), pick(lb.length ? lb : ["The markers need refreshing by the river."], 2), pick(la.length ? la : ["Fresh scent along the stream — fox, maybe. Keep your ears open."], 3)];
  },
  "leader-deputy": (a, b) => {
    const leader = a.rank.toLowerCase() === "leader" ? a : b;
    const other = leader === a ? b : a;
    return [pick(V[other.id]?.chat ?? ["The dawn patrol reported no trouble along the border."], 1), pick(V[leader.id]?.chat ?? ["Keep the Clan strong. That is the whole duty."], 2), pick(V[leader.id]?.chat ?? ["Feed the elders first. The code, and the right thing."], 3)];
  },
  kittypets: (a, b) => {
    const la = V[a.id]?.chat ?? [];
    const lb = V[b.id]?.chat ?? [];
    return [pick(la.length ? la : ["The Twolegs painted the fences again. Every greenleaf. Every year."], 1), pick(lb.length ? lb : ["My bowl came early today. The signs are good."], 2), pick(la.length ? la : ["I saw the forest cat at the fence again. Bold one."], 3)];
  },
  "cross-clan": (a, b) => ["You're far from your own border, friend.", "The truce holds — for now. Mind where you walk.", "Keep your scent on your side and there'll be no trouble."],
  general: (a, b) => ["Prey runs well this season.", "Keep your ears sharp out there.", "The Clan holds. That's the whole victory."],
};

/**
 * Pick an ambient NPC↔NPC exchange (3 alternating lines). The relation kind
 * respects mentor links, ranks and Clans, and each cat speaks from its own
 * voice bank when one exists — knowledge-safe by construction.
 */
export function pickNpcChatLines(aId: string, bId: string, salt: number): string[] {
  const a = profileFor(aId);
  const b = profileFor(bId);
  const rel = relationFor(a, b);
  const lines = PAIR_LINES[rel](a, b);
  // rotate by salt so the same pair varies over time
  const rot = Math.abs(salt) % Math.max(1, lines.length);
  return [...lines.slice(rot), ...lines.slice(0, rot)].slice(0, 3);
}
