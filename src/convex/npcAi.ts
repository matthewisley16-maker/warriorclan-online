"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";

/**
 * Optional AI upgrade for the character chat. When the user configures an
 * OpenAI-compatible API key (Keys tab), the client may ask for a richer
 * in-character line; without a key this action returns { available: false }
 * and the client keeps using the deterministic local engine in npcChat.ts.
 *
 * The key NEVER reaches the client: the request runs here, on the server.
 */
export const reply = action({
  args: {
    npcName: v.string(),
    npcRank: v.string(),
    npcClan: v.string(),
    npcPersonality: v.string(),
    npcStyle: v.string(),
    npcTopics: v.string(),
    npcKnowledge: v.string(),
    npcAvoid: v.string(),
    playerName: v.string(),
    playerClan: v.string(),
    playerRank: v.string(),
    bond: v.number(),
    storyStep: v.number(),
    mode: v.string(),
    history: v.array(v.object({ from: v.string(), text: v.string() })),
    npcAgePhrase: v.optional(v.string()),
    npcSex: v.optional(v.string()),
    npcMentor: v.optional(v.string()),
    npcApprentice: v.optional(v.string()),
    npcRelationships: v.optional(v.string()),
    npcActivity: v.optional(v.string()),
    rememberedFacts: v.optional(v.array(v.string())),
    message: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) return { available: false as const, text: null };
    const base = process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY
      ? "https://openrouter.ai/api/v1"
      : "https://api.openai.com/v1";

    const system = [
      `You voice ${args.npcName}, ${args.npcRank} of ${args.npcClan}, in the world of the Warriors book "Into the Wild" (fan-made 2D RPG, original dialogue only — never quote the novel).`,
      `Personality: ${args.npcPersonality}`,
      `Speech style: ${args.npcStyle}`,
      `Topics this cat knows and enjoys: ${args.npcTopics}`,
      `Knowledge flags: ${args.npcKnowledge}. Things this cat does NOT know or avoids: ${args.npcAvoid}.`,
      `Identity: ${args.npcSex ?? "cat"}; age: ${args.npcAgePhrase ?? "adult"}.${args.npcMentor ? ` Mentored by ${args.npcMentor}.` : ""}${args.npcApprentice ? ` Currently mentoring ${args.npcApprentice}.` : ""}${args.npcRelationships ? ` Notable ties: ${args.npcRelationships}.` : ""}`,
      `Current activity: ${args.npcActivity ?? "resting in camp"}.${(args.rememberedFacts ?? []).length > 0 ? ` The player has told this cat before: ${args.rememberedFacts!.join("; ")}.` : ""}`,
      `The player is ${args.playerName}, a ${args.playerRank} of ${args.playerClan}. Bond with the player: ${args.bond} on a scale of -3 (hostile) to 3 (trusted friend). World mode: ${args.mode}, timeline step: ${args.storyStep}.`,
      `RULES: Reply ONLY as ${args.npcName} speaking directly to the player, in first person, 1-2 short sentences (max ~40 words). No narration, no stage directions unless brief cat body language, no out-of-character talk, no mention of AI, games, developers or books. If this cat would not know something, say so naturally in-character or deflect. Stay warm/wary/gruff per personality. Never reveal secrets or future events.`,
    ].join("\n");

    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY ? "openai/gpt-4o-mini" : "gpt-4o-mini",
          temperature: 0.9,
          max_tokens: 90,
          messages: [
            { role: "system", content: system },
            ...args.history.slice(-6).map((h) => ({
              role: h.from === "player" ? ("user" as const) : ("assistant" as const),
              content: h.text,
            })),
            { role: "user", content: args.message },
          ],
        }),
      });
      if (!res.ok) return { available: true as const, text: null };
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) return { available: true as const, text: null };
      return { available: true as const, text: text.slice(0, 240) };
    } catch {
      return { available: true as const, text: null };
    }
  },
});
