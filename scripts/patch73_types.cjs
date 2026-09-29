// patch73_types.cjs — widen the remaining strict unions to extended ids
const fs = require("fs");

// saveShared.ts: AppearanceT pattern/tail/ears become string (validator updated separately)
{
  const path = "src/game/saveShared.ts";
  let S = fs.readFileSync(path, "utf8");
  const R = (needle, replacement, label) => {
    if (S.split(needle).length !== 2) { console.error(`ABORT saveShared: ${label} (${S.split(needle).length - 1})`); process.exit(1); }
    S = S.replace(needle, replacement);
    console.log(`ok [${label}]`);
  };
  R(
    `export const appearance = v.object({
  fur: v.string(),
  furDark: v.string(),
  eye: v.string(),
  chest: v.optional(v.string()),
  pattern: v.union(v.literal("solid"), v.literal("tabby"), v.literal("tortie"), v.literal("bicolor")),
  furLength: v.number(),
  tail: v.union(v.literal("normal"), v.literal("short"), v.literal("fluffy"), v.literal("bob")),
  ears: v.union(v.literal("normal"), v.literal("tall"), v.literal("fold")),
  size: v.number(),
  scar: v.boolean(),
});`,
    `export const appearance = v.object({
  fur: v.string(),
  furDark: v.string(),
  eye: v.string(),
  chest: v.optional(v.string()),
  // extended ids (mackerel/spotted/...) render via drawCat's pattern switch
  pattern: v.optional(v.string()),
  furLength: v.number(),
  tail: v.optional(v.string()),
  ears: v.optional(v.string()),
  size: v.number(),
  scar: v.boolean(),
  // customization extensions (optional so old saves load unchanged)
  eye2: v.optional(v.string()),
  patternIntensity: v.optional(v.number()),
  markings: v.optional(v.array(v.string())),
  scars: v.optional(v.array(v.string())),
  acc: v.optional(v.record(v.string(), v.string())),
  accColor: v.optional(v.string()),
});`,
    "validator extended",
  );
  R(
    `export type AppearanceT = {
  fur: string;
  furDark: string;
  eye: string;
  chest?: string;
  pattern: "solid" | "tabby" | "tortie" | "bicolor";
  furLength: number;
  tail: "normal" | "short" | "fluffy" | "bob";
  ears: "normal" | "tall" | "fold";
  size: number;
  scar: boolean;
};`,
    `export type AppearanceT = {
  fur: string;
  furDark: string;
  eye: string;
  chest?: string;
  pattern: string;
  furLength: number;
  tail: string;
  ears: string;
  size: number;
  scar: boolean;
  eye2?: string;
  patternIntensity?: number;
  markings?: string[];
  scars?: string[];
  acc?: Record<string, string>;
  accColor?: string;
};`,
    "AppearanceT extended",
  );
  fs.writeFileSync(path, S);
}

// schema.ts: mirror the validator
{
  const path = "src/convex/schema.ts";
  let S = fs.readFileSync(path, "utf8");
  const R = (needle, replacement, label) => {
    if (S.split(needle).length !== 2) { console.error(`ABORT schema: ${label} (${S.split(needle).length - 1})`); process.exit(1); }
    S = S.replace(needle, replacement);
    console.log(`ok [${label}]`);
  };
  R(
    `  pattern: v.union(v.literal("solid"), v.literal("tabby"), v.literal("tortie"), v.literal("bicolor")),
  furLength: v.number(),
  tail: v.union(v.literal("normal"), v.literal("short"), v.literal("fluffy"), v.literal("bob")),
  ears: v.union(v.literal("normal"), v.literal("tall"), v.literal("fold")),
  size: v.number(), // 0.9 - 1.15
  scar: v.boolean(),
});`,
    `  pattern: v.optional(v.string()),
  furLength: v.number(),
  tail: v.optional(v.string()),
  ears: v.optional(v.string()),
  size: v.number(), // 0.9 - 1.15
  scar: v.boolean(),
  // customization extensions (optional so old saves load unchanged)
  eye2: v.optional(v.string()),
  patternIntensity: v.optional(v.number()),
  markings: v.optional(v.array(v.string())),
  scars: v.optional(v.array(v.string())),
  acc: v.optional(v.record(v.string(), v.string())),
  accColor: v.optional(v.string()),
});`,
    "schema appearance extended",
  );
  fs.writeFileSync(path, S);
}

console.log("patch73 complete");
