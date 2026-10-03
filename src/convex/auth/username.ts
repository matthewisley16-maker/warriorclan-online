import { Password } from "@convex-dev/auth/providers/Password";

/**
 * Username & password sign-in — the player picks their OWN username and
 * password, no email required. Runs on the standard Convex Auth Password
 * provider, so secrets are hashed with Scrypt (Lucia) and stored in the
 * standard authTables row for this provider — the users document NEVER
 * stores a password.
 *
 * The Password provider keys accounts by the identifier returned from
 * `profile()` (its `email` slot). This provider's accounts are keyed by the
 * lowercased username, stored as "<username>@username.local" so the slot
 * stays a string and can never collide with a real address. The users
 * document keeps the plain `username` (plus the display name as typed).
 *
 * Client usage: signIn("username", { username, password, flow }) where flow
 * is "signUp" (create account) or "signIn" — `id: "username"` below is the
 * provider id the client passes to signIn, and the namespace for this
 * provider's stored account credentials.
 */

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export const usernamePassword = Password({
  id: "username",
  validatePasswordRequirements(password: string) {
    if (typeof password !== "string" || password.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }
  },
  profile(params) {
    const typed = typeof params.username === "string" ? params.username.trim() : "";
    if (!USERNAME_RE.test(typed)) {
      throw new Error("Usernames are 3–20 characters: letters, numbers or _.");
    }
    const username = typed.toLowerCase();
    return {
      email: `${username}@username.local`,
      username,
      name: typed,
    };
  },
});
