// Character saving / loading acceptance suite (§10–§20, §24 of the
// tail/customization repair task).
//
// The reported bug was "character saving does not work at all". This suite
// drives the REAL server mutations (players.ensurePlayer, players.getPlayer,
// customization.saveAppearance, players.updateCat) through a fake Convex auth +
// in-memory database, so the whole pipeline is exercised as written:
//
//   editor payload → fullSkin → normalizeSkin → saveAppearance → stored row →
//   getPlayer → what the game renders on the next login
//
// It asserts, in particular:
//   - the payload always satisfies the server's REAL argument validator
//     (read from the function's own exportArgs, so a missing/extra appearance
//     field can never silently fail a save)
//   - an empty/partial appearance is REJECTED and never overwrites a valid cat
//   - saving is account-specific: two accounts never mix, and signing back into
//     an account returns exactly the cat that account saved
//   - an appearance save does not disturb the account's other progress
//   - the editor's SAVE only confirms after the awaited write succeeds
//
// Run: bun scripts/check-save.ts

import fs from "node:fs";
import { ensurePlayer, getPlayer, updateCat } from "../src/convex/players";
import { saveAppearance as saveAppearanceFn } from "../src/convex/customization";
import { fullSkin } from "../src/pages/gameUi";
import { normalizeSkin } from "../src/game/draw";
import { appearanceVersion } from "../src/game/saveShared";
import { defaultAppearance } from "../src/convex/players";

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  if (ok) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

type Handler = (ctx: unknown, args: never) => Promise<unknown>;
const callEnsure = (ensurePlayer as unknown as { _handler: Handler })._handler;
const callGetPlayer = (getPlayer as unknown as { _handler: Handler })._handler;
const callSaveAppearance = (saveAppearanceFn as unknown as { _handler: Handler })._handler;
const callUpdateCat = (updateCat as unknown as { _handler: Handler })._handler;

// ---------------------------------------------------------------------------
// Fake Convex: auth identity + in-memory tables (query/withIndex/first/...)
// ---------------------------------------------------------------------------
interface Doc {
  _id: string;
  _creationTime: number;
  [k: string]: unknown;
}
function makeDb() {
  const tables = new Map<string, Doc[]>();
  let seq = 0;
  const rows = (name: string): Doc[] => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  };
  const builder = (name: string, conds: [string, unknown][]) => {
    const match = (d: Doc) => conds.every(([f, v]) => d[f] === v);
    const api: Record<string, unknown> = {
      withIndex: (_index: string, cb: (q: { eq: (f: string, v: unknown) => unknown }) => unknown) => {
        const local: [string, unknown][] = [];
        cb({ eq: (f, v) => (local.push([f, v]), undefined) });
        return builder(name, local);
      },
      first: async () => rows(name).find(match) ?? null,
      collect: async () => rows(name).filter(match),
      take: async (n: number) => rows(name).filter(match).slice(0, n),
      order: () => api,
      unique: async () => rows(name).find(match) ?? null,
    };
    return api;
  };
  const db = {
    query: (name: string) => builder(name, []),
    get: async (id: string) => [...tables.values()].flat().find((d) => d._id === id) ?? null,
    insert: async (name: string, doc: Record<string, unknown>) => {
      const _id = `${name}:${++seq}`;
      rows(name).push({ _id, _creationTime: seq, ...doc });
      return _id;
    },
    patch: async (id: string, patch: Record<string, unknown>) => {
      const d = [...tables.values()].flat().find((x) => x._id === id);
      if (!d) throw new Error(`no document ${id}`);
      Object.assign(d, patch);
    },
    replace: async (id: string, doc: Record<string, unknown>) => {
      const all = [...tables.values()].flat();
      const d = all.find((x) => x._id === id);
      if (!d) throw new Error(`no document ${id}`);
      for (const k of Object.keys(d)) if (k !== "_id" && k !== "_creationTime") delete d[k];
      Object.assign(d, doc);
    },
    delete: async (id: string) => {
      for (const [k, list] of tables) tables.set(k, list.filter((r) => r._id !== id));
    },
  };
  return { db, tables, count: (name: string) => rows(name).length };
}
function ctxFor(userId: string | null, db: unknown) {
  return {
    auth: {
      getUserIdentity: async () =>
        userId === null ? null : { subject: `${userId}|session-1`, issuer: "test", tokenIdentifier: "test" },
    },
    db,
  };
}

// ---------------------------------------------------------------------------
// The server's REAL argument validator, read from the function itself
// ---------------------------------------------------------------------------
interface VS {
  type: string;
  value?: unknown;
  fieldType?: VS;
  optional?: boolean;
  keys?: VS;
  values?: VS;
}
function validatorProblems(schema: VS, val: unknown, path: string): string[] {
  const out: string[] = [];
  if (val === undefined) {
    if (!schema.optional) out.push(`${path}: required but missing`);
    return out;
  }
  switch (schema.type) {
    case "object": {
      if (typeof val !== "object" || val === null || Array.isArray(val)) return [`${path}: expected object`];
      const fields = (schema.value ?? {}) as Record<string, VS>;
      const obj = val as Record<string, unknown>;
      for (const [k, f] of Object.entries(fields)) {
        const inner = f.fieldType ?? f;
        const val = obj[k];
        // an explicitly-undefined key is "not provided" to Convex (fullSkin
        // builds optional keys as `chest: undefined`), so only a REAL value is
        // recursed into — absence is judged by the wrapper's `optional` flag
        if (!(k in obj) || val === undefined) {
          if (!f.optional) out.push(`${path}.${k}: required but missing`);
          continue;
        }
        out.push(...validatorProblems({ ...inner, optional: f.optional }, val, `${path}.${k}`));
      }
      for (const k of Object.keys(obj)) if (!(k in fields)) out.push(`${path}.${k}: unexpected field`);
      break;
    }
    case "string": if (typeof val !== "string") out.push(`${path}: expected string`); break;
    case "number": if (typeof val !== "number") out.push(`${path}: expected number`); break;
    case "boolean": if (typeof val !== "boolean") out.push(`${path}: expected boolean`); break;
    case "array": {
      if (!Array.isArray(val)) return [`${path}: expected array`];
      val.forEach((x, i) => out.push(...validatorProblems(schema.value as VS, x, `${path}[${i}]`)));
      break;
    }
    case "record": {
      if (typeof val !== "object" || val === null || Array.isArray(val)) return [`${path}: expected record`];
      for (const [k, x] of Object.entries(val as Record<string, unknown>)) {
        out.push(...validatorProblems(schema.values as VS, x, `${path}.${k}`));
      }
      break;
    }
    default: break;
  }
  return out;
}
const argsSchema = JSON.parse(
  (saveAppearanceFn as unknown as { exportArgs: () => string }).exportArgs(),
) as VS;

/** What the editor actually sends: fullSkin then the renderer's normalization. */
const editorPayload = (skin: Record<string, unknown>) => normalizeSkin(fullSkin(skin as never));
function saveArgsOf(skin: Record<string, unknown>, catName?: string) {
  const full = editorPayload(skin);
  return {
    appearance: full,
    appearanceVersion: appearanceVersion(full),
    ...(catName ? { catName } : {}),
  } as never;
}

const RICH = {
  fur: "#2b2b33", furDark: "#15151a", eye: "#e0b74a", eye2: "#6fb7e8", chest: "#f4e9d8",
  nose: "black", face: "forehead-tabby", pattern: "spotted", patternIntensity: 0.55,
  furLength: 1.25, furStyle: "scruffy", tail: "fluffy", ears: "tufted", size: 1.05, scar: true,
  markings: ["chest", "paws", "tailtip", "blaze"], scars: ["cheek", "ear"],
  acc: { neck: "collar-red", head: "flower", tail: "band", paw: "wrap" },
  accColor: "#5b8fd6", accColors: { neck: "#d95f5f", tail: "#7fae4e" },
  morph: "morph-lion", presetId: "firestar",
};

console.log("\n--- 1. the save payload satisfies the server's REAL validator (§11) ---");
{
  const cases: [string, Record<string, unknown>][] = [
    ["a full appearance", RICH],
    ["an appearance with no extras", { fur: "#b5713f", furDark: "#8a5528", eye: "#4d9086" }],
    ["the editor's empty initial skin ({})", {}],
    ["a skin with only a colour", { fur: "#123456" }],
  ];
  let bad = 0;
  const detail: string[] = [];
  for (const [label, skin] of cases) {
    const problems = validatorProblems(argsSchema, { appearance: editorPayload(skin) }, "args");
    if (problems.length) {
      bad++;
      detail.push(`${label}: ${problems[0]}`);
    }
  }
  check(bad === 0, `every editor payload passes the server validator (${cases.length} shapes)`, detail[0]);
  // the "missing fur" payload that USED to be sent (and rejected) is impossible now
  const empty = editorPayload({});
  check(
    typeof empty.fur === "string" && empty.fur.length > 1 && typeof empty.furDark === "string" && typeof empty.eye === "string",
    "an empty editor skin is normalized to a complete default cat before saving",
    `fur=${String(empty.fur)}`,
  );
}

console.log("\n--- 2. first login creates ONE save; save → load round trip (§10/§11/§17) ---");
{
  const { db, count } = makeDb();
  const A = ctxFor("userA", db);
  const created = (await callEnsure(A, { mode: "open", appearance: fullSkin(null as never), catName: "Rusty" } as never)) as { _id: string };
  const again = (await callEnsure(A, { mode: "open", appearance: fullSkin(null as never), catName: "Rusty" } as never)) as { _id: string };
  check(created._id === again._id && count("players") === 1, "first login creates exactly one character (no duplicates)", `rows=${count("players")}`);

  // assign progress that an appearance save must NOT clobber (§12)
  await db.patch(created._id, {
    xp: 340, clan: "thunderclan", rank: "warrior",
    inventory: ["herb-marigold", "feather"], achievements: ["first-prey"], discovered: ["camp", "sunningrocks"],
    storyStep: 4, questsDone: ["q-freshkill"], skills: { hunt: 3, fight: 2, herb: 1 },
  });

  const res = (await callSaveAppearance(A, saveArgsOf(RICH, "Brackenfur"))) as { ok: boolean };
  check(res.ok === true, "saveAppearance reports success for a valid cat");

  const loaded = (await callGetPlayer(A, {} as never)) as Doc;
  const missing = (Object.keys(RICH) as (keyof typeof RICH)[]).filter((k) => {
    const v = loaded.appearance as Record<string, unknown>;
    return JSON.stringify(v[k as string]) !== JSON.stringify(RICH[k]);
  });
  check(missing.length === 0, "every appearance field survives the round trip (fur→accColors→morph)", `missing=[${missing.join(",")}]`);
  check(loaded.catName === "Brackenfur", "the cat name rides the same save", String(loaded.catName));
  check(
    loaded.xp === 340 && loaded.clan === "thunderclan" && (loaded.inventory as string[]).length === 2 &&
      (loaded.achievements as string[])[0] === "first-prey" && (loaded.discovered as string[]).length === 2 &&
      loaded.storyStep === 4 && (loaded.questsDone as string[])[0] === "q-freshkill" &&
      (loaded.skills as Record<string, number>).hunt === 3,
    "an appearance save leaves the account's progress untouched (§12)",
  );
  check(loaded.appearanceVersion === appearanceVersion(editorPayload(RICH)), "the stored version matches the saved look", String(loaded.appearanceVersion));
}

console.log("\n--- 3. an invalid/empty appearance never overwrites a saved cat (§11/§40) ---");
{
  const { db } = makeDb();
  const A = ctxFor("userA", db);
  const row = (await callEnsure(A, { mode: "open", appearance: fullSkin(null as never), catName: "Rusty" } as never)) as { _id: string };
  await callSaveAppearance(A, saveArgsOf(RICH) as never);
  const before = JSON.stringify((await callGetPlayer(A, {} as never) as Doc).appearance);

  let threw = 0;
  for (const bad of [{ fur: "" }, {}, { eye: "#fff" }] as Record<string, unknown>[]) {
    try {
      await callSaveAppearance(A, { appearance: bad, appearanceVersion: 1 } as never);
    } catch {
      threw++;
    }
  }
  const after = JSON.stringify((await callGetPlayer(A, {} as never) as Doc).appearance);
  check(threw === 3, "a cat with no fur is rejected on every attempt (never silently persisted)");
  check(after === before, "the stored cat is unchanged after the rejected writes");
  void row;
}

console.log("\n--- 4. saves are ACCOUNT-SPECIFIC; switching accounts never mixes cats (§13/§18) ---");
{
  const { db } = makeDb();
  const A = ctxFor("userA", db);
  const B = ctxFor("userB", db);
  await callEnsure(A, { mode: "open", appearance: fullSkin(null as never), catName: "RustyA" } as never);
  await callEnsure(B, { mode: "open", appearance: fullSkin(null as never), catName: "RustyB" } as never);

  const SKIN_A = editorPayload({ fur: "#b5713f", furDark: "#8a5528", eye: "#4d9086", acc: { neck: "collar-red" } });
  const SKIN_B = editorPayload({ fur: "#2b2b33", furDark: "#15151a", eye: "#e0b74a", tail: "bob" });
  await callSaveAppearance(A, { appearance: SKIN_A, appearanceVersion: appearanceVersion(SKIN_A), catName: "Ashfur" } as never);
  await callSaveAppearance(B, { appearance: SKIN_B, appearanceVersion: appearanceVersion(SKIN_B), catName: "Nightpelt" } as never);

  const rowA = (await callGetPlayer(A, {} as never)) as Doc;
  const rowB = (await callGetPlayer(B, {} as never)) as Doc;
  check(rowA._id !== rowB._id, "each account has its own character row");
  check(JSON.stringify(rowA.appearance) === JSON.stringify(SKIN_A), "account A reads back exactly its own cat");
  check(JSON.stringify(rowB.appearance) === JSON.stringify(SKIN_B), "account B reads back exactly its own cat");
  check(rowA.catName === "Ashfur" && rowB.catName === "Nightpelt", "names stay with their accounts");
  check((rowB.appearance as Record<string, unknown>).fur !== (rowA.appearance as Record<string, unknown>).fur, "the two cats are genuinely different");

  // account switching, in order: A saves → sign out → B saves → A returns
  const SKIN_A2 = editorPayload({ ...SKIN_A, accColor: "#7fae4e", markings: ["chest"] });
  await callSaveAppearance(A, { appearance: SKIN_A2, appearanceVersion: appearanceVersion(SKIN_A2) } as never);
  const bAfterAsEdit = (await callGetPlayer(B, {} as never)) as Doc;
  check(JSON.stringify(bAfterAsEdit.appearance) === JSON.stringify(SKIN_B), "editing as A never touches B's cat");
  const aReturning = (await callGetPlayer(A, {} as never)) as Doc;
  check(
    JSON.stringify(aReturning.appearance) === JSON.stringify(SKIN_A2) && (aReturning.appearance as Record<string, unknown>).accColor === "#7fae4e",
    "signing back in as A restores A's latest cat (never a temporary/default one)",
  );
}

console.log("\n--- 5. unauthenticated access is refused and writes nothing (§13) ---");
{
  const { db, count } = makeDb();
  const anon = ctxFor(null, db);
  let threwEnsure = false;
  let threwSave = false;
  try { await callEnsure(anon, { mode: "open", appearance: fullSkin(null as never), catName: "Nobody" } as never); } catch { threwEnsure = true; }
  try { await callSaveAppearance(anon, saveArgsOf(RICH) as never); } catch { threwSave = true; }
  const who = await callGetPlayer(anon, {} as never);
  check(threwEnsure && threwSave, "signed-out ensure/save both throw (never a ghost character)");
  check(who === null && count("players") === 0, "no rows are created while signed out");
}

console.log("\n--- 6. repeated saves are content-stable; the fingerprint tracks the look (§14/§16) ---");
{
  const { db } = makeDb();
  const A = ctxFor("userA", db);
  await callEnsure(A, { mode: "open", appearance: fullSkin(null as never), catName: "Rusty" } as never);
  const payload = saveArgsOf(RICH);
  await callSaveAppearance(A, payload);
  const first = JSON.stringify((await callGetPlayer(A, {} as never) as Doc).appearance);
  await callSaveAppearance(A, payload);
  await callSaveAppearance(A, payload);
  const third = JSON.stringify((await callGetPlayer(A, {} as never) as Doc).appearance);
  check(first === third, "saving the same cat repeatedly is content-stable (no drift, no partial write)");

  const base = editorPayload(RICH);
  const v0 = appearanceVersion(base);
  let blind = 0;
  for (const k of Object.keys(RICH)) {
    const edited = editorPayload({ ...RICH, [k]: k === "markings" ? ["chin"] : k === "size" ? 0.95 : k === "patternIntensity" ? 0.2 : undefined });
    if (appearanceVersion(edited) === v0) blind++;
  }
  check(blind === 0, "editing ANY single appearance field changes the version (so the save is broadcast)");
  check(appearanceVersion(base) === v0, "the fingerprint of an unchanged look is stable");
}

console.log("\n--- 7. updateCat keeps name/clan safe while re-skinning (§12) ---");
{
  const { db } = makeDb();
  const A = ctxFor("userA", db);
  await callEnsure(A, { mode: "open", appearance: fullSkin(null as never), catName: "Rusty" } as never);
  await callUpdateCat(A, { catName: "Firepaw" } as never);
  const skin = editorPayload(RICH);
  await callUpdateCat(A, { appearance: skin, appearanceVersion: appearanceVersion(skin) } as never);
  const row = (await callGetPlayer(A, {} as never)) as Doc;
  check(row.catName === "Firepaw", "a name set earlier survives a later re-skin");
  check(JSON.stringify(row.appearance) === JSON.stringify(skin), "the re-skin landed in full");
  // a degenerate appearance is refused, leaving the good cat in place
  await callUpdateCat(A, { appearance: { fur: "" } as never } as never).catch(() => undefined);
  const row2 = (await callGetPlayer(A, {} as never)) as Doc;
  check(JSON.stringify(row2.appearance) === JSON.stringify(skin), "a degenerate re-skin never overwrites a valid cat");
}

console.log("\n--- 8. the UI cannot FAKE a save (§14/§15) ---");
{
  const editor = fs.readFileSync("src/pages/CatCustomizer.tsx", "utf8");
  check(
    /void runSave\(skinToSave\)\.then\(\(ok\) => \{\s*if \(!ok\) return;/.test(editor),
    "SAVE CAT only confirms when the awaited write succeeded",
  );
  check(/setSaveState\(ok \? "saved" : "failed"\)/.test(editor), "a failed write sets the failed state (Retry save)");
  check(/saveState === "failed"\s*\n?\s*\?\s*"Save failed/.test(editor), "the editor tells the player the save failed");
  check(/console\.error\("\[customizer\] appearance save failed", err\)/.test(editor), "the real save error is logged, never swallowed");
  check(/"Saved successfully"/.test(editor) && /"Saving…"/.test(editor) && /"Loading character…"/.test(editor), "Saving/Saved/Loading statuses are all real states");
  check(/window\.setTimeout\(\(\) => \{\s*lastAutoRef\.current = key;\s*void runSave\(skinToSave\);/.test(editor), "autosave is debounced and written through the same single path");

  const menu = fs.readFileSync("src/pages/MainMenu.tsx", "utf8");
  check(/initialSkin=\{fullSkin\(player\?\.skin\)/.test(menu), "the editor is opened with a complete saved cat (never `{}`)");
  check(/loading=\{!player\}/.test(menu), "the editor is told when the account's cat is still loading");
  check(
    /if \(!onPersistAppearance\) onSaveAppearance\(v\.skin as CatSkin, player\?\.name\);/.test(menu),
    "a confirmed save writes the appearance once (legacy call only as a fallback)",
  );

  const game = fs.readFileSync("src/pages/Game.tsx", "utf8");
  check(
    /saveAppearance\(\{\s*appearance: full,\s*appearanceVersion: appearanceVersion\(full\),\s*catName: player\?\.catName/.test(game),
    "the awaited save persists the appearance AND the name in one write",
  );
  check(
    /g\.mySkin = \{ \.\.\.full/.test(game) && /sentAppearanceVerRef\.current = null;/.test(game),
    "a confirmed save updates the live cat and re-broadcasts the new look (§19)",
  );
}


console.log("\n--- 9. a saved cat reloads IDENTICALLY (refresh / rejoin, §17/§24) ---");
{
  const { db } = makeDb();
  const A = ctxFor("userA", db);
  await callEnsure(A, { mode: "open", appearance: fullSkin(null as never), catName: "Rusty" } as never);
  const saved = editorPayload(RICH);
  await callSaveAppearance(A, { appearance: saved, appearanceVersion: appearanceVersion(saved), catName: "Brackenfur" } as never);

  // the client's LOAD path: the row -> fullSkin -> what drawCat renders
  const stored = (await callGetPlayer(A, {} as never)) as Doc;
  const onLoad = fullSkin(stored.appearance as never);
  check(JSON.stringify(onLoad) === JSON.stringify(saved), "the cat rendered after a reload is byte-identical to the saved one");
  check(appearanceVersion(onLoad) === appearanceVersion(saved), "the appearance fingerprint does not drift across a reload (no re-broadcast storm)");
  check(JSON.stringify(normalizeSkin(onLoad)) === JSON.stringify(saved), "the renderer's normalization is a no-op on a stored cat (nothing is lost on load)");
  check(
    (onLoad.acc as Record<string, string>).tail === "band" && onLoad.eye2 === "#6fb7e8" && onLoad.morph === "morph-lion" &&
      (onLoad.markings ?? []).length === 4 && (onLoad.accColors as Record<string, string>).neck === "#d95f5f",
    "accessories, heterochromia, markings, per-slot tints and the morph all survive the reload",
  );
}

console.log("\n--- 10. cancel/close never persists; RESET restores the saved cat (§20) ---");
{
  const editor = fs.readFileSync("src/pages/CatCustomizer.tsx", "utf8");
  check(/onClick=\{onClose\}/.test(editor), "CANCEL closes without touching the account (temporary changes are dropped)");
  const saveCalls = (editor.match(/void runSave\(skinToSave\)/g) ?? []).length;
  check(saveCalls === 2, "only two writers exist: the Save button and the debounced autosave", `found ${saveCalls}`);
  check(
    !/onClose[\s\S]{0,80}runSave\(/.test(editor),
    "closing the editor never triggers a write",
  );
  check(
    /onClick=\{\(\) => setSkin\(\{ \.\.\.savedNorm \}\)\}/.test(editor),
    "RESET restores the account's saved cat (not the unsaved edits)",
  );
  // §22: no persistence inside a render loop (the preview animates at 60fps)
  const previewBody = editor.slice(editor.indexOf("function CatPreviewLarge"), editor.indexOf("// Re-runs the render effect"));
  check(
    previewBody.length > 200 && !/onPersist|saveAppearance|runSave|setSkin/.test(previewBody),
    "the 60fps preview loop never writes or mutates state (§22)",
  );
  const autosave = /window\.setTimeout\(\(\) => \{[\s\S]{0,80}\}, 900\)/.test(editor);
  check(autosave, "appearance autosave is debounced (no per-frame or per-keystroke writes)");
}

console.log("\n--- 11. the editor adopts the account's cat when it arrives late (§17) ---");
{
  const editor = fs.readFileSync("src/pages/CatCustomizer.tsx", "utf8");
  check(
    /if \(!untouched\) return;[\s\S]{0,220}setSkin\(\(s\) => \(JSON\.stringify\(s\) === JSON\.stringify\(next\) \? s : next\)\)/.test(editor),
    "a late-arriving saved cat replaces the placeholder (edits are never discarded)",
  );
  check(
    /const untouched = JSON\.stringify\(skinToSave\) === openedWithRef\.current;/.test(editor),
    "the editor knows whether the player has actually edited anything yet",
  );
  // the placeholder and the real cat are both complete, renderable cats
  const placeholder = normalizeSkin(fullSkin(undefined as never));
  check(
    typeof placeholder.fur === "string" && placeholder.fur.length > 1 && placeholder.tail === "normal",
    "the loading placeholder is a real default cat, never an empty skin",
  );
}

console.log(failures === 0 ? "\nALL SAVE CHECKS PASS" : `\n${failures} SAVE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
