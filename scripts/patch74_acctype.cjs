// patch74_acctype.cjs — unify acc type as Partial<Record<string,string>>
const fs = require("fs");

// saveShared.ts AppearanceT
{
  const path = "src/game/saveShared.ts";
  let S = fs.readFileSync(path, "utf8");
  const n = "  acc?: Record<string, string>;";
  if (S.split(n).length !== 2) { console.error("ABORT saveShared acc"); process.exit(1); }
  S = S.replace(n, "  acc?: Partial<Record<string, string>>;");
  fs.writeFileSync(path, S);
  console.log("ok saveShared");
}
// schema validator: v.record values may be undefined-safe? Keep v.record(string,string) —
// Partial Record on the TS side is assignable because the validator accepts missing slots
// via the whole-object optional. No schema change needed.
console.log("patch74 complete");
