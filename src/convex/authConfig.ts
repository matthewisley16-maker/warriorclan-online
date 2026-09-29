import { query } from "./_generated/server";

/**
 * Is Google sign-in configured on this deployment? The auth screen uses the
 * public client id to build the consent-screen URL — client secrets never
 * leave the server. Also reports whether the optional NPC AI upgrade has a
 * key, so the game can use it without ever exposing it.
 */
export const googleAuthConfigured = query({
  args: {},
  handler: () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    return {
      configured: Boolean(clientId) && Boolean(process.env.GOOGLE_CLIENT_SECRET),
      clientId: clientId ?? null,
      npcAi: Boolean(process.env.OPENAI_API_KEY) || Boolean(process.env.OPENROUTER_API_KEY),
    };
  },
});
