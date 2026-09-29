import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import axios from "axios";
import { createAccount, retrieveAccount } from "@convex-dev/auth/server";

/**
 * Google OAuth (authorization-code) sign-in for Convex Auth.
 *
 * The browser is sent to Google's consent screen with redirect_uri pointing
 * back at this app's /auth route; the one-time `code` arrives in the URL and
 * the client calls signIn("google", { code, redirectUri }). This handler
 * exchanges the code for tokens server-side, loads the profile, and upserts
 * the auth account — the same identity every time for a given Google account.
 *
 * Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Keys tab) on a Google
 * Cloud OAuth client whose authorized JavaScript origin is this site.
 */
export const google = ConvexCredentials({
  id: "google",
  async authorize(credentials, ctx) {
    const code = typeof credentials.code === "string" ? credentials.code : undefined;
    const redirectUri = typeof credentials.redirectUri === "string" ? credentials.redirectUri : undefined;
    if (!code) throw new Error("Missing Google authorization code");
    if (!redirectUri) throw new Error("Missing redirect URI");
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Google sign-in is not configured: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the Keys tab.");
    }

    // 1) exchange the browser's one-time code for tokens
    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
    const accessToken: unknown = tokenRes.data?.access_token;
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      throw new Error("Google token exchange did not return an access token");
    }

    // 2) load the signed-in Google profile
    const profileRes = await axios.get("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = profileRes.data as { sub?: string; email?: string; name?: string; email_verified?: boolean };
    if (!profile.sub) throw new Error("The Google profile has no subject id");
    const email = profile.email;
    if (!email) throw new Error("The Google account has no email address");

    // 3) find or create the auth account (same Google account => same user)
    const existing = await retrieveAccount(ctx, {
      provider: "google",
      account: { id: profile.sub },
    }).catch(() => null);
    if (existing) return { userId: existing.user._id };

    const created = await createAccount(ctx, {
      provider: "google",
      account: { id: profile.sub },
      profile: {
        email,
        ...(profile.email_verified ? { emailVerified: Date.now() } : {}),
        ...(profile.name ? { name: profile.name } : {}),
      },
    });
    return { userId: created.user._id };
  },
});
