// WarriorCatsRPG — npcChatIdentity: identity answers from REAL profile data.
//
// Every "who are you" style answer is built from the character database
// (characters.ts): name, rank, Clan, sex, canon age phrasing, mentor and
// apprentice links, relationships. Nothing is invented as canon: when the
// book doesn't give an exact age, the cat answers with a life-stage phrase,
// never a fabricated number. Twolegplace cats never gain Clan identity.

import { profileFor, type CharacterProfile } from "./characters";
import type { DialogueContext } from "./dialogue";

const CLAN_LABEL: Record<string, string> = {
  thunderclan: "ThunderClan",
  riverclan: "RiverClan",
  windclan: "WindClan",
  shadowclan: "ShadowClan",
  kittypet: "",
  rogue: "",
};

function seedPick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}

/** Relationship tier between this cat and the player (spec #16). */
export type Relation = "hostile" | "wary" | "stranger" | "acquaintance" | "friendly" | "friend" | "trusted" | "clanmate";

export function relationTo(p: CharacterProfile, ctx: DialogueContext): Relation {
  const bond = ctx.bonds[p.id] ?? 0;
  const talked = ctx.talked?.[p.id] ?? 0;
  if (bond <= -3) return "hostile";
  if (bond < -1) return "wary";
  const sameClan = p.clan === ctx.player.clan;
  if (sameClan && bond >= 2) return "clanmate";
  if (bond >= 3) return "trusted";
  if (bond >= 2) return "friend";
  if (bond >= 1 || talked >= 3) return "friendly";
  if (talked >= 1) return "acquaintance";
  return "stranger";
}

/** Tone warpers: a name answer to a stranger differs from one to a friend. */
const WARMERS: Partial<Record<Relation, string>> = {
  stranger: "",
  wary: "Hm. You again.",
  hostile: "Why should I tell YOU anything?",
};
const SOFTENERS: Partial<Record<Relation, string>> = {
  friendly: "Since you asked —",
  friend: "You know me by now.",
  trusted: "For you? Anything.",
  clanmate: "Clanmate to clanmate,",
};

function tone(relation: Relation, base: string): string {
  const warm = WARMERS[relation] ?? "";
  const soft = SOFTENERS[relation] ?? "";
  if (warm && relation === "hostile") return `${warm} ${base}`;
  return soft ? `${soft} ${base}` : base;
}

// ---------------------------------------------------------------------------
// Identity answers — all data pulled from the profile, never generic
// ---------------------------------------------------------------------------

export function identityName(p: CharacterProfile, ctx: DialogueContext, seed: number): string {
  const relation = relationTo(p, ctx);
  const isKittypet = p.clan === "kittypet" || p.clan === "rogue";
  if (isKittypet) {
    return tone(relation, seedPick([
      `${p.name}. Just ${p.name} — names don't need a Clan attached.`,
      `I'm ${p.name}. My Twolegs picked it.`,
      `${p.name}, and I answer to it — mostly.`,
    ], seed));
  }
  if (p.rank.toLowerCase().includes("leader")) {
    return tone(relation, seedPick([
      `I am ${p.name}, leader of ${CLAN_LABEL[p.clan]}. You may speak plainly.`,
      `They call me ${p.name}. I carry nine lives for ${CLAN_LABEL[p.clan]}.`,
    ], seed));
  }
  const suffix = p.id === "rusty" ? "" : ""; // Firepaw naming handled by story
  const clanTail = relation === "stranger" ? ` of ${CLAN_LABEL[p.clan]}.` : ".";
  return tone(relation, seedPick([
    `${p.name}${clanTail} And you are?`,
    `My name is ${p.name}${suffix}${clanTail} Remember it.`,
    `${p.name}. That's ${p.rank.toLowerCase() === "apprentice" ? "my apprentice name" : "the name I've earned"}${clanTail}`,
  ], seed));
}

export function identityAge(p: CharacterProfile, ctx: DialogueContext, seed: number): string {
  const relation = relationTo(p, ctx);
  const phrase = p.agePhrase ?? "a warrior of no particular fame";
  const lead = seedPick([
    `Old enough to know better, young enough to still enjoy it — ${phrase}.`,
    `${p.sex === "she-cat" ? "She-cat" : "Tom"}, ${phrase}. Why do you ask?`,
    `I'm ${phrase}. Moons blur together — you stop counting.`,
    `The seasons don't hand out numbers. ${phrase[0].toUpperCase()}${phrase.slice(1)} is what I'll say.`,
  ], seed);
  // elders and leaders lean dignified; apprentices lean cheeky
  if (p.age === "apprentice") {
    return tone(relation, seedPick([
      `Six moons when I was named! Well — ${phrase}.`,
      `I'm an apprentice — ${phrase}. Practically a warrior, ask anyone. (Don't ask my mentor.)`,
    ], seed));
  }
  if (p.age === "elder") {
    return tone(relation, seedPick([
      `Old? Ha! ${phrase[0].toUpperCase()}${phrase.slice(1)}, and every season EARNED.`,
      `I've outlived more fleas than you've caught mice. ${phrase[0].toUpperCase()}${phrase.slice(1)}.`,
    ], seed));
  }
  return tone(relation, lead);
}

export function identityClan(p: CharacterProfile, ctx: DialogueContext, seed: number): string {
  const relation = relationTo(p, ctx);
  const isKittypet = p.clan === "kittypet" || p.clan === "rogue";
  if (isKittypet) {
    return tone(relation, seedPick([
      `Clan? I live in a Twoleg nest, not a Clan. Is that some kind of forest club?`,
      `I have a home and a bowl. Clans are for cats that like weather.`,
      `Never heard of a Clan 'til cats started talking about them. Should I have?`,
    ], seed));
  }
  const label = CLAN_LABEL[p.clan] ?? "the forest";
  const detail: Record<string, string[]> = {
    thunderclan: [
      `ThunderClan — the forest is ours, from the Thunderpath to the river.`,
      `ThunderClan. We hunt beneath the oaks and hold what's ours.`,
    ],
    riverclan: [`RiverClan. We swim when ThunderClan cats flounder.`, `RiverClan — fed by the river, ruled by its moods.`],
    windclan: [`WindClan. The moor is open, the sky is wide, and we are fast.`, `WindClan — the wind knows us by name.`],
    shadowclan: [`ShadowClan. The pines keep our secrets.`, `ShadowClan — you'd smell us before you saw us. That's the point.`],
  };
  return tone(relation, seedPick(detail[p.clan] ?? [`${label}, and proud of it.`], seed));
}

export function identityRank(p: CharacterProfile, ctx: DialogueContext, seed: number): string {
  const relation = relationTo(p, ctx);
  const isKittypet = p.clan === "kittypet" || p.clan === "rogue";
  if (isKittypet) return tone(relation, `Rank? I chase butterflies and sleep on cushions. If that's a rank, I hold it well.`);
  const r = p.rank.toLowerCase();
  if (r.includes("leader")) {
    return tone(relation, seedPick([
      `I am leader of ${CLAN_LABEL[p.clan]}. StarClan gave me nine lives to spend on the Clan.`,
      `Leader. Every cat in ${CLAN_LABEL[p.clan]} is my responsibility — every one.`,
    ], seed));
  }
  if (r.includes("deputy")) {
    return tone(relation, seedPick([
      `Deputy of ${CLAN_LABEL[p.clan]}. I organize the patrols — and answer for them.`,
      `Deputy. I speak for the leader when she's otherwise engaged.`,
    ], seed));
  }
  if (r.includes("medicine")) {
    return tone(relation, seedPick([
      `Medicine cat. I mend what battles break.`,
      `I'm the medicine cat of ${CLAN_LABEL[p.clan]} — healer, dreamer of StarClan's signs.`,
    ], seed));
  }
  if (r.includes("apprentice")) {
    const ment = p.mentor ? ` ${p.mentor} trains me.` : "";
    return tone(relation, `Apprentice.${ment} One day — warrior.`);
  }
  if (r.includes("queen")) {
    return tone(relation, `I nurse the kits. Small paws, big noise — I wouldn't trade it.`);
  }
  if (r.includes("elder")) {
    return tone(relation, `Elder. I fought my fights. Now I collect fresh-kill and opinions.`);
  }
  return tone(relation, seedPick([
    `A warrior of ${CLAN_LABEL[p.clan]}. Hunt, patrol, defend — repeat until the seasons run out.`,
    `Warrior. The Clan feeds because I and others like me keep it that way.`,
  ], seed));
}

export function identityLeader(p: CharacterProfile, ctx: DialogueContext, seed: number): string {
  const relation = relationTo(p, ctx);
  const isKittypet = p.clan === "kittypet" || p.clan === "rogue";
  if (isKittypet) return tone(relation, `A leader? Of cats? Who'd follow ME. I barely follow the sun around the windowsill.`);
  if (p.clan === "thunderclan") {
    if (p.id === "bluestar") return tone(relation, `I lead ThunderClan — and I answer to StarClan for it.`);
    return tone(relation, seedPick([
      `Bluestar leads ThunderClan. Wise, fair — and sharper than cats expect.`,
      `Bluestar. She's led us through worse than this.`,
    ], seed));
  }
  const leaders: Record<string, string[]> = {
    riverclan: [`Crookedstar rules RiverClan — jaw crooked, will anything but.`, `Crookedstar. He's led RiverClan a long while.`],
    windclan: [`Tallstar leads WindClan. Thin as a moor reed, and just as hard to knock over.`, `Tallstar — he's walked more miles than any cat alive.`],
    shadowclan: [`Brokenstar leads ShadowClan. Ask your elders why that's a problem.`, `Brokenstar. Keep your distance from his patrols.`],
  };
  return tone(relation, seedPick(leaders[p.clan] ?? [`Ask your own Clan about its leader — I know mine.`], seed));
}

export function identityMentor(p: CharacterProfile, ctx: DialogueContext, seed: number): string {
  const relation = relationTo(p, ctx);
  if (p.clan === "kittypet" || p.clan === "rogue") return tone(relation, `Trained? My Twolegs trained me to come when the bowl clatters. Mastered it, too.`);
  if (p.apprentice) {
    return tone(relation, seedPick([
      `I mentor ${p.apprentice[0].toUpperCase()}${p.apprentice.slice(1)}. Good paws, if a little quick.`,
      `${p.apprentice[0].toUpperCase()}${p.apprentice.slice(1)} is my apprentice. Patience is the first lesson — for ME.`,
    ], seed));
  }
  if (p.mentor) {
    return tone(relation, seedPick([
      `${p.mentor} trained me. Half my stance is theirs.`,
      `I learned from ${p.mentor}. The other half I learned getting scratched.`,
    ], seed));
  }
  return tone(relation, seedPick([
    `I trained like every Clan cat — under a warrior's eye. Who, exactly? That's my business.`,
    `Long seasons ago, and the mentor's name stays with me.`,
  ], seed));
}

export function identityFamily(p: CharacterProfile, ctx: DialogueContext, seed: number): string {
  const relation = relationTo(p, ctx);
  const rel = p.relationships ?? [];
  if (p.clan === "kittypet" && rel.length === 0) {
    return tone(relation, seedPick([
      `Family? My Twolegs. Two of them, both terrible at understanding cats.`,
      `There's the neighborhood cats. We tolerate each other, mostly.`,
    ], seed));
  }
  if (rel.length > 0) return tone(relation, `My ties? ${rel.join(". ")}. The Clan is family too — closer than blood, some days.`);
  if (p.clan !== "kittypet") {
    return tone(relation, seedPick([
      `The Clan is my family. That's how it works — every kit raised by every queen.`,
      `Kin? Cats come and go. The Clan remains.`,
    ], seed));
  }
  return tone(relation, `That's a personal question for a stranger.`);
}

export function identityFriends(p: CharacterProfile, ctx: DialogueContext, seed: number): string {
  const relation = relationTo(p, ctx);
  if (relation === "stranger") return tone(relation, seedPick([
    `Friendships are earned, not announced. You'll pardon me for not listing them for a stranger.`,
    `Why? So you can use them?`,
  ], seed));
  if (p.clan === "kittypet") {
    return tone(relation, seedPick([
      `The neighborhood cats — Smudge, a few others. We share gossip over the fences.`,
      `My friends? Well-fed and harmless. It's a good life.`,
    ], seed));
  }
  const ties: Record<string, string[]> = {
    graypaw: [`Ravenpaw — quieter than a mouse, sharper than you'd think. And now you, maybe.`, `The apprentices: Ravenpaw, and Dustpaw when he's not being Dustpaw.`],
    ravenpaw: [`Graypaw is... loud. Kind, though. I trust him.`, `Graypaw. And — the fewer cats that know me, the better. Lately.`],
    dustpaw: [`Sandpaw keeps me honest in training. And Tigerclaw — I mean, he's my mentor's peer. You know.`],
    sandpaw: [`Dustpaw trains alongside me. He talks big; he's not wrong often.`],
    firepaw: [`Graypaw. Graypaw. And more Graypaw.`, `Graypaw vouched for me before I'd earned it. I don't forget that.`],
    bluestar: [`The Clan is my friend. That is enough — and everything.`],
    tigerclaw: [`Darkstripe has sense. The rest of the Clan has potential.`],
    lionheart: [`Whitestorm and I trained under the same sky. Graypaw keeps me humble.`],
    whitestorm: [`Lionheart. A finer cat you'll not meet.`, `The Clan's young ones — they keep an old warrior honest.`],
  };
  return tone(relation, seedPick(ties[p.id] ?? [
    `I share tongues with the Clan same as any cat. You'll find your own den-mates in time.`,
    `The cats I patrol with — that's friendship, tested daily.`,
  ], seed));
}

/** What does THIS cat think of the named target? Relationship-aware. */
export function opinionOf(p: CharacterProfile, targetId: string, ctx: DialogueContext, seed: number): string | null {
  const t = profileFor(targetId);
  const tName = t.name;
  const self = p.id === targetId;
  const isKittypet = p.clan === "kittypet" || p.clan === "rogue";
  const tKittypet = t.clan === "kittypet" || t.clan === "rogue";

  if (self) {
    return seedPick([
      `Me? I'm ${p.name}. You'd have to ask somecat ELSE about me.`,
      `What do I think of myself? Hungry, usually. Ask the next question.`,
    ], seed);
  }

  // Twolegplace cats only know Twolegplace + the player-cat's old identity
  if (isKittypet) {
    const knowsTarget = (t.clan === "kittypet" && t.id !== p.id) || targetId === "rusty" || targetId === "firepaw";
    if (!knowsTarget) {
      return seedPick([
        `${tName}? Who's that? One of yours from the forest?`,
        `Never met a ${tName}. Should I have?`,
      ], seed);
    }
    if (targetId === "rusty") return seedPick([`Rusty? Best friend I had. Then he went into the FOREST. You'll pardon me if I'm still cross.`, `He'd sit with me at dusk. Now he's off being Firepaw or something. I miss him.`], seed);
    if (targetId === "firepaw") return seedPick([`You mean Rusty. Firepaw's just a name the forest gave him.`, `Firepaw, Rusty — same cat. The one who chose trees over friends.`], seed);
    return seedPick([`${tName}? Good cat. Keeps to their garden, mostly.`], seed);
  }

  // Clan cats on kittypets
  if (tKittypet) {
    return seedPick([
      `A kittypet? Soft paws, soft heart, some say. I say: prove it on the border.`,
      `Kittypets live soft. Some wake up anyway. Rare — but it happens.`,
    ], seed);
  }

  // Clan cat on Clan cat — hand-authored for the Book 1 web
  const VIEWS: Record<string, Record<string, string[]>> = {
    bluestar: {
      tigerclaw: [`Tigerclaw is the finest fighter in the Clan. I trust his claws — where they point is the question seasons will answer.`],
      graypaw: [`Graypaw has a good heart and a loud mouth. Both will serve the Clan eventually.`],
      ravenpaw: [`Ravenpaw is quieter than he should be. Cats go quiet for reasons. I watch.`],
      lionheart: [`Lionheart is the deputy's metal — brave, loyal, and steadier than the rocks.`],
      yellowfang: [`Yellowfang is ShadowClan-born and ThunderClan-fed now. Judge her by her paws, not her pelt.`],
      firepaw: [`The kittypet? He chose the forest with his eyes open. StarClan seems interested in him — that interests me.`],
    },
    tigerclaw: {
      firepaw: [`The kittypet. Even his name smells of Twolegs. He'd better be more than his name.`],
      bluestar: [`Bluestar leads. I follow — while her choices stay sharp.`],
      graypaw: [`Loud apprentice. Loud apprentices make loud warriors — or dead ones.`],
      ravenpaw: [`My apprentice. He'll either toughen up or be carried. The forest decides which.`],
      lionheart: [`A fine warrior. Trustworthy — which makes him predictable.`],
      whitestorm: [`Whitestorm earned his silver pelt. I'd fight beside him. Carefully.`],
      dustpaw: [`Dustpaw understands that strength decides. Good.`],
      redtail: [`Redtail led well enough. Small cat, big heart. The Clan felt his loss.`],
      yellowfang: [`The ShadowClan rogue? Watch her. Old cats don't wander into enemy ground for the weather.`],
    },
    graypaw: {
      firepaw: [`Firepaw? Best friend the forest ever handed me. Kittypet my whiskers — he OUT-jumped Dustpaw his first week.`],
      ravenpaw: [`Ravenpaw's my den-mate. He's jumpy, but he's REAL, you know? Don't tell him I said nice things.`],
      tigerclaw: [`Tigerclaw scares me. Don't repeat that. ARE you going to repeat that?`],
      bluestar: [`Bluestar NAMED me! Well — after Firepaw. Second best name of the ceremony, thank you very much.`],
      sandpaw: [`Sandpaw acts like we're mouse-brains. She's... kind of right, honestly.`],
      dustpaw: [`Dustpaw can't decide if he hates me or wants to race me. It's BOTH.`],
      yellowfang: [`The old rogue? She stole from the fresh-kill pile! Then Lionheart fed her again. I don't understand deputies.`],
      spottedleaf: [`Spottedleaf's the medicine cat. She fixed my pads after the first week. Nice. Scary-smart.`],
    },
    ravenpaw: {
      tigerclaw: [`Tigerclaw? He— he's a great warrior. The greatest. Please don't tell him I— never mind. I said nothing.`],
      firepaw: [`Firepaw listens. That's rarer than courage.`, `He doesn't treat me like I'm broken. I'd... trust him. Quietly.`],
      graypaw: [`Graypaw talks enough for both of us. It's... restful, being around him.`],
      bluestar: [`Bluestar sees everything. I hope— I hope that's a good thing.`],
      redtail: [`I— I was there. At Sunningrocks. I saw— no. Forget it. Forget I said anything.`],
    },
    lionheart: {
      firepaw: [`The kittypet apprentice? Graypaw's friend. Bluestar sees something in him. So does StarClan, if Spottedleaf's dream means anything.`],
      tigerclaw: [`Tigerclaw is a worthy warrior. Ambitious — but the code holds him, as it holds us all.`],
      graypaw: [`My apprentice. Reckless, warm-hearted, and better than he knows. Mostly.`],
    },
    whitestorm: {
      tigerclaw: [`Tigerclaw is strong. Strength with patience is power; strength alone is trouble. I'm watching which he is.`],
      sandpaw: [`My apprentice. Sharp tongue, sharper instincts.`],
      firepaw: [`Bluestar's choice. That's recommendation enough — for now.`],
    },
    spottedleaf: {
      yellowfang: [`The ShadowClan cat? StarClan sent her — the dream was clear. She needs care, whatever her Clan says.`],
      firepaw: [`The new apprentice has fire in him. Fitting name.`],
      bluestar: [`Bluestar carries the Clan like a mother carries kits — even when it bites.`],
    },
    yellowfang: {
      firepaw: [`The kittypet kit? He fed me. That's more courtesy than ShadowClan ever showed me.`],
      bluestar: [`Your leader's got sense. She fed me when her own warriors wanted me gone.`],
      brokenstar: [`Brokenstar. Don't— don't say that name near me. He took everything.`],
    },
    sandpaw: {
      firepaw: [`The kittypet? He's... less useless than he looks. DON'T tell him I said that.`],
      graypaw: [`Graypaw's all noise. Harmless noise. Mostly.`],
    },
    dustpaw: {
      firepaw: [`Kittypet. Soft. But— fine, he keeps up. Barely. I said what I said.`],
      tigerclaw: [`Tigerclaw's the warrior I want to be. What? Everyone thinks it.`],
    },
    oakheart: {
      redtail: [`Redtail fought bravely at Sunningrocks. I'll say that for a ThunderClan cat.`],
      bluestar: [`Bluestar leads her Clan well. If only she'd lead it AWAY from our rocks.`],
    },
  };
  const mine = VIEWS[p.id]?.[targetId];
  if (mine) return seedPick(mine, seed);
  // generic-but-real fallbacks by relative rank
  if (t.rank.toLowerCase().includes("leader") && p.clan === t.clan) {
    return seedPick([`${tName} leads us. You speak carefully around a leader.`, `${tName} has led ${CLAN_LABEL[p.clan] ?? "the Clan"} through hard seasons.`], seed);
  }
  if (t.clan !== p.clan) {
    return seedPick([`${tName} is ${CLAN_LABEL[t.clan] ?? "an outsider"} — that's all the answer you need from me.`, `We don't share tongues across Clans. Ask some cat who talks to strangers.`], seed);
  }
  return seedPick([`${tName}? A Clanmate. You'd have to ask them about them.`, `${tName} does their part for the Clan. That's praise enough in a forest like this.`], seed);
}

/** Where this cat stands on StarClan, using the knowledge system's answer. */
export function identityStarClan(p: CharacterProfile, ctx: DialogueContext, seed: number): string {
  // imported lazily by caller to avoid cycles — caller routes to starClanReply
  void p; void ctx; void seed;
  return "";
}

/** "What were you doing?" — uses the engine's live activity label. */
export function identityActivity(p: CharacterProfile, ctx: DialogueContext, seed: number): string {
  const act = ctx.npcActivity?.trim();
  const relation = relationTo(p, ctx);
  if (!act || act === "talking with you") {
    return tone(relation, seedPick([
      `I was about to find some shade before YOU found me.`,
      `Nothing worth reporting — until you showed up.`,
    ], seed));
  }
  return tone(relation, seedPick([
    `I was ${act} — before you interrupted, and before you ask: no, you can't help.`,
    `${act[0].toUpperCase()}${act.slice(1)}. The day doesn't wait for conversation.`,
    `I was ${act}. Still am, in my head. Walk with me if you must.`,
  ], seed));
}
