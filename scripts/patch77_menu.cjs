// patch77_menu.cjs — "Customize Cat" opens the full customizer from the menu
const fs = require("fs");
const path = "src/pages/MainMenu.tsx";
let S = fs.readFileSync(path, "utf8");
const R = (needle, replacement, label) => {
  if (S.split(needle).length !== 2) { console.error(`ABORT: ${label} (${S.split(needle).length - 1})`); process.exit(1); }
  S = S.replace(needle, replacement);
  console.log(`ok [${label}]`);
};

// 1) imports: customizer + item types
R(
  'import { MenuScene } from "@/game/menuScene";',
  'import { MenuScene } from "@/game/menuScene";\nimport { CatCustomizer, type CustomizerSave } from "./CatCustomizer";\nimport type { CustomSkin as FullSkinT } from "@/game/catItems";',
  "imports",
);

// 2) MainMenu state + favorites/presets lift props
R(
  `export default function MainMenu({
  player,
  onPlay,
  onSaveName,
  onSaveSkin,
  onSaveClan,
  onSaveSettings,
}: {
  player: MainMenuPlayer | null;
  /** mode + chosen Clan — Clan is picked every session, never locked */
  onPlay: (mode: GameMode, clanId: string) => void;
  onSaveName: (name: string) => void;
  onSaveSkin: (skin: CatSkin) => void;
  onSaveClan: (clan: string) => void;
  onSaveSettings: (s: Settings) => void;
}) {`,
  `export default function MainMenu({
  player,
  onPlay,
  onSaveName,
  onSaveSkin,
  onSaveClan,
  onSaveSettings,
  favorites = [],
  presets = [],
  onSaveCustomization,
}: {
  player: MainMenuPlayer | null;
  /** mode + chosen Clan — Clan is picked every session, never locked */
  onPlay: (mode: GameMode, clanId: string) => void;
  onSaveName: (name: string) => void;
  onSaveSkin: (skin: CatSkin) => void;
  onSaveClan: (clan: string) => void;
  onSaveSettings: (s: Settings) => void;
  favorites?: string[];
  presets?: { name: string; skin: FullSkinT }[];
  onSaveCustomization?: (v: { favorites: string[]; presets: { name: string; skin: FullSkinT }[] }) => void;
}) {`,
  "MainMenu props",
);

// 3) customizer state inside MainMenu
R(
  `  const [screen, setScreen] = useState<"menu" | "character" | "settings">("menu");`,
  `  const [screen, setScreen] = useState<"menu" | "character" | "settings">("menu");
  const [customizerOpen, setCustomizerOpen] = useState(false);`,
  "customizer state",
);

// 4) CharacterScreen: add the Customize Cat button (opens the overlay)
R(
  `              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full gap-1.5 rounded-full border-white/20 bg-black/40 text-xs text-white hover:bg-white/10"
                onClick={() => {
                  setSkin(randomSkin());
                  setName(randomCatName());
                }}
              >
                <RefreshCw className="size-3.5" /> Randomize cat
              </Button>`,
  `              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full gap-1.5 rounded-full border-white/20 bg-black/40 text-xs text-white hover:bg-white/10"
                onClick={() => {
                  setSkin(randomSkin());
                  setName(randomCatName());
                }}
              >
                <RefreshCw className="size-3.5" /> Randomize cat
              </Button>
              <Button
                size="sm"
                className="mt-2 w-full gap-1.5 rounded-xl bg-amber-400 text-xs font-bold text-[#0d160d] hover:bg-amber-300"
                onClick={onOpenCustomizer}
              >
                <Sparkles className="size-3.5" /> Customize Cat
              </Button>`,
  "character screen button",
);

// CharacterScreen props: onOpenCustomizer
R(
  `function CharacterScreen({
  player,
  onClose,
  onSave,
}: {
  player: MainMenuPlayer;
  onClose: () => void;
  onSave: (v: { name?: string; skin?: CatSkin; clan?: string }) => void;
}) {`,
  `function CharacterScreen({
  player,
  onClose,
  onSave,
  onOpenCustomizer,
}: {
  player: MainMenuPlayer;
  onClose: () => void;
  onSave: (v: { name?: string; skin?: CatSkin; clan?: string }) => void;
  onOpenCustomizer: () => void;
}) {`,
  "CharacterScreen props",
);

// pass the handler at the call site
R(
  `            onClose={() => setScreen("menu")}
            onSave={(v) => {
              if (v.name && (!player || v.name !== player.name)) onSaveName(v.name);
              if (v.skin) onSaveSkin(v.skin);
              if (v.clan && (!player || v.clan !== (player.clan ?? "thunderclan"))) onSaveClan(v.clan);
              setScreen("menu");
            }}`,
  `            onClose={() => setScreen("menu")}
            onOpenCustomizer={() => setCustomizerOpen(true)}
            onSave={(v) => {
              if (v.name && (!player || v.name !== player.name)) onSaveName(v.name);
              if (v.skin) onSaveSkin(v.skin);
              if (v.clan && (!player || v.clan !== (player.clan ?? "thunderclan"))) onSaveClan(v.clan);
              setScreen("menu");
            }}`,
  "pass handler",
);

// 5) render the customizer overlay itself
R(
  `        {screen === "settings" && (
          <SettingsScreen key="settings" settings={settings} onChange={updateSettings} onClose={() => setScreen("menu")} />
        )}`,
  `        {screen === "settings" && (
          <SettingsScreen key="settings" settings={settings} onChange={updateSettings} onClose={() => setScreen("menu")} />
        )}
        {customizerOpen && (
          <CatCustomizer
            open
            playerName={player?.name ?? "Rusty"}
            initialSkin={(player?.skin ?? {}) as FullSkinT}
            savedSkin={(player?.skin ?? {}) as FullSkinT}
            favorites={favorites}
            presets={presets}
            onClose={() => setCustomizerOpen(false)}
            onSave={(v) => {
              onSaveSkin(v.skin as CatSkin);
              onSaveCustomization?.({ favorites: v.favorites, presets: v.presets });
              setCustomizerOpen(false);
            }}
          />
        )}`,
  "render customizer",
);

fs.writeFileSync(path, S);
console.log("patch77 complete");
