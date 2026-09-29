// patch72_fullskin.cjs — fullSkin carries the extended customization fields
const fs = require("fs");
const path = "src/pages/gameUi.tsx";
let S = fs.readFileSync(path, "utf8");
const R = (needle, replacement, label) => {
  if (S.split(needle).length !== 2) { console.error(`ABORT: ${label} (${S.split(needle).length - 1} hits)`); process.exit(1); }
  S = S.replace(needle, replacement);
  console.log(`ok [${label}]`);
};

R(
  `export function fullSkin(
  s?: Partial<{
    fur: string;
    furDark: string;
    eye: string;
    chest: string;
    pattern: "solid" | "tabby" | "tortie" | "bicolor";
    furLength: number;
    tail: "normal" | "short" | "fluffy" | "bob";
    ears: "normal" | "tall" | "fold";
    size: number;
    scar: boolean;
  }> | null,
) {
  const a = s ?? {};
  const fur = a.fur || "#d96b2f";
  return {
    fur,
    furDark: a.furDark || shade(fur, 0.62),
    eye: a.eye || "#4fae6e",
    chest: a.chest,
    pattern: a.pattern ?? ("solid" as const),
    furLength: a.furLength ?? 1,
    tail: a.tail ?? ("normal" as const),
    ears: a.ears ?? ("normal" as const),
    size: a.size ?? 1,
    scar: a.scar ?? false,
  };
}`,
  `export function fullSkin(
  s?: Partial<{
    fur: string;
    furDark: string;
    eye: string;
    chest: string;
    pattern: string;
    furLength: number;
    tail: string;
    ears: string;
    size: number;
    scar: boolean;
    eye2: string;
    patternIntensity: number;
    markings: string[];
    scars: string[];
    acc: Record<string, string | undefined>;
    accColor: string;
  }> | null,
) {
  const a = s ?? {};
  const fur = a.fur || "#d96b2f";
  return {
    fur,
    furDark: a.furDark || shade(fur, 0.62),
    eye: a.eye || "#4fae6e",
    chest: a.chest,
    pattern: a.pattern ?? "solid",
    furLength: a.furLength ?? 1,
    tail: a.tail ?? "normal",
    ears: a.ears ?? "normal",
    size: a.size ?? 1,
    scar: a.scar ?? false,
    // extended customization (optional; absent on old saves)
    ...(a.eye2 ? { eye2: a.eye2 } : {}),
    ...(a.patternIntensity !== undefined ? { patternIntensity: a.patternIntensity } : {}),
    ...(a.markings?.length ? { markings: a.markings } : {}),
    ...(a.scars?.length ? { scars: a.scars } : {}),
    ...(a.acc && Object.keys(a.acc).length ? { acc: a.acc } : {}),
    ...(a.accColor ? { accColor: a.accColor } : {}),
  };
}`,
  "fullSkin extended",
);
fs.writeFileSync(path, S);
console.log("patch72 complete");
