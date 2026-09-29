// patch79_ingame.cjs — in-game CatClanMenu persistence wiring
const fs = require("fs");
const path = "src/pages/Game.tsx";
let S = fs.readFileSync(path, "utf8");
const R = (needle, replacement, label) => {
  if (S.split(needle).length !== 2) { console.error(`ABORT: ${label} (${S.split(needle).length - 1})`); process.exit(1); }
  S = S.replace(needle, replacement);
  console.log(`ok [${label}]`);
};

R(
  `          <CatClanMenu
            open
            player={{
              name: myCat.name,
              clan: myCat.clan,
              rank: rankLabel.toLowerCase(),
              xp: player?.xp ?? 0,
              skin: myCat.appearance,
            }}`,
  `          <CatClanMenu
            open
            player={{
              name: myCat.name,
              clan: myCat.clan,
              rank: rankLabel.toLowerCase(),
              xp: player?.xp ?? 0,
              skin: myCat.appearance,
            }}
            favorites={player?.favorites ?? []}
            presets={player?.presets ?? []}`,
  "in-game props",
);
R(
  `              if (v.skin) {
                updateCat({ appearance: fullSkin(v.skin) }).catch(() => undefined);
              }`,
  `              if (v.skin) {
                updateCat({ appearance: fullSkin(v.skin) }).catch(() => undefined);
                // live-update the in-world cat + menu preview immediately
                const g = gameRef.current;
                if (g) g.mySkin = { ...fullSkin(v.skin), furDark: fullSkin(v.skin).furDark || "#5a3a20" };
                setMyCat((c) => (c ? { ...c, appearance: fullSkin(v.skin) } : c));
              }
              if (v.favorites) setFavorites({ favorites: v.favorites }).catch(() => undefined);
              if (v.presets) savePresets({ presets: v.presets }).catch(() => undefined);`,
  "in-game save flow",
);
fs.writeFileSync(path, S);
console.log("patch79 complete");
