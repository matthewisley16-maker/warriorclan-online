// patch78_game.cjs — persist favorites/presets; full customizer in-game
const fs = require("fs");
const path = "src/pages/Game.tsx";
let S = fs.readFileSync(path, "utf8");
const R = (needle, replacement, label) => {
  if (S.split(needle).length !== 2) { console.error(`ABORT: ${label} (${S.split(needle).length - 1})`); process.exit(1); }
  S = S.replace(needle, replacement);
  console.log(`ok [${label}]`);
};

// 1) mutations for customization persistence
R(
  "  const updateCat = useMutation(api.players.updateCat);",
  "  const updateCat = useMutation(api.players.updateCat);\n  const setFavorites = useMutation(api.customization.setFavorites);\n  const savePresets = useMutation(api.customization.savePresets);",
  "customization mutations",
);

// 2) pass to MainMenu
R(
  "          onSaveName={(name) => updateCat({ catName: name }).catch(() => undefined)}",
  `          favorites={player?.favorites ?? []}
          presets={player?.presets ?? []}
          onSaveCustomization={(v) => {
            setFavorites({ favorites: v.favorites }).catch(() => undefined);
            savePresets({ presets: v.presets }).catch(() => undefined);
          }}
          onSaveName={(name) => updateCat({ catName: name }).catch(() => undefined)}`,
  "MainMenu wiring",
);

fs.writeFileSync(path, S);
console.log("patch78 complete");
