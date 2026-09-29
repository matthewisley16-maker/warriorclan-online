import { query } from "./_generated/server";

/**
 * Is Google sign-in configured on this deployment? The auth screen uses the
 * public client id to build the consent-screen URL — client secrets never
 * leave the server.
 */
export const googleAuthConfigured = query({
  args: {},
  handler: () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    return {
      configured: Boolean(clientId) && Boolean(process.env.GOOGLE_CLIENT_SECRET),
      clientId: clientId ?? null,
    };
  },
});
