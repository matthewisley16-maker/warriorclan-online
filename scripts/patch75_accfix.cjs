// patch75_accfix.cjs — fullSkin emits acc with only defined slots
const fs = require("fs");
const path = "src/pages/gameUi.tsx";
let S = fs.readFileSync(path, "utf8");
const needle = "    ...(a.acc && Object.keys(a.acc).length ? { acc: a.acc as Partial<Record<string, string>> } : {}),";
if (S.split(needle).length !== 2) { console.error("ABORT: fullSkin acc anchor"); process.exit(1); }
S = S.replace(
  needle,
  "    ...(a.acc && Object.keys(a.acc).length\n      ? { acc: Object.fromEntries(Object.entries(a.acc).filter(([, v]) => typeof v === \"string\")) as Record<string, string> }\n      : {}),",
);
fs.writeFileSync(path, S);
console.log("patch75 complete");
