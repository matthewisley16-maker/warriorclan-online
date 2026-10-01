// WarriorCatsRPG — customization item catalog.
//
// Every selectable customization is an ITEM here: id, human name, category,
// and an `apply(skin)` that edits the CatSkin. The customizer renders one
// card per item (with a live preview drawn from the same drawCat sprite the
// game uses), and search/favorites operate over this catalog.

export type AccessorySlot = "head" | "ear" | "neck" | "body" | "paw" | "tail";
export const ACCESSORY_SLOTS: { id: AccessorySlot; name: string }[] = [
  { id: "head", name: "Head" },
  { id: "ear", name: "Ears" },
  { id: "neck", name: "Neck" },
  { id: "body", name: "Body" },
  { id: "paw", name: "Legs/Paws" },
  { id: "tail", name: "Tail" },
];

export type ItemCategory =
  | "fur" | "colors" | "patterns" | "markings" | "eyes" | "face" | "ears" | "tail" | "tailAcc" | "scars"
  | "collars"
  | AccessorySlot;

export const CATEGORIES: { id: ItemCategory | "all" | "favorites"; name: string }[] = [
  { id: "fur", name: "Fur" },
  { id: "colors", name: "Colors" },
  { id: "patterns", name: "Patterns" },
  { id: "markings", name: "Markings" },
  { id: "eyes", name: "Eyes" },
  { id: "face", name: "Face" },
  { id: "ears", name: "Ears" },
  { id: "tail", name: "Tail" },
  { id: "tailAcc", name: "Tail Items" },
  { id: "scars", name: "Scars" },
  { id: "head", name: "Head" },
  { id: "ear", name: "Ear Items" },
  { id: "collars", name: "Collars" },
  { id: "neck", name: "Neck" },
  { id: "body", name: "Body" },
  { id: "paw", name: "Legs/Paws" },
  { id: "favorites", name: "Favorites" },
];

/** The full extended skin the customizer edits (additive to the old CatSkin). */
export interface CustomSkin {
  // --- base (existing CatSkin fields — never renamed) ---
  fur: string;
  furDark: string;
  eye: string;
  eye2?: string; // heterochromia (second eye)
  chest?: string;
  pattern?: string; // extended pattern id
  patternIntensity?: number; // 0..1
  furLength?: number; // 0.55 sleek .. 1.6 fluffy
  furStyle?: string; // "" (plain) | "thick" | "scruffy" | "tufted" — silhouette variation
  tail?: string; // extended tail id
  ears?: string; // extended ear id
  nose?: string; // nose color id (undefined = natural pink)
  face?: string; // face marking id (undefined / "default" = none)
  size?: number;
  scar?: boolean;
  // --- markings (multi-select, white overlay) ---
  markings?: string[]; // ids from MARKING_ITEMS
  // --- scars (multi-select) ---
  scars?: string[]; // ids from SCAR_ITEMS
  // --- accessories: one item per slot (head/ear/neck/body/paw/tail) ---
  acc?: Partial<Record<AccessorySlot, string>>;
  accColor?: string; // shared accessory tint (flowers/ribbons/bands)
  // §21: per-slot tint override — a red flower on the head can coexist with a
  // blue collar. Falls back to accColor when absent.
  accColors?: Partial<Record<AccessorySlot, string>>;
  // §22-23: applied morph id (WARRIORS character look on the same account)
  morph?: string;
  // §25/§30: the WARRIORS character preset this look came from (undefined =
  // the player's own baseCustomAppearance)
  presetId?: string;
}

// ---------------------------------------------------------------------------
// Item type
// ---------------------------------------------------------------------------

export interface CatItem {
  id: string;
  name: string;
  category: ItemCategory;
  desc: string;
  /** Apply to the skin when equipped (toggles off when re-clicked). */
  apply: (s: CustomSkin) => void;
  /** True when this item is currently equipped on the skin. */
  isOn: (s: CustomSkin) => boolean;
  /** Searchable keywords. */
  tags?: string[];
}

const setPattern = (id: string): ((s: CustomSkin) => void) => (s) => {
  s.pattern = id;
};
const patternOn = (id: string) => (s: CustomSkin) => s.pattern === id;

const setTail = (id: string): ((s: CustomSkin) => void) => (s) => { s.tail = id; };
const tailOn = (id: string) => (s: CustomSkin) => s.tail === id;

const setEars = (id: string): ((s: CustomSkin) => void) => (s) => { s.ears = id; };
const earsOn = (id: string) => (s: CustomSkin) => s.ears === id;

const setFur = (v: number, style = ""): ((s: CustomSkin) => void) => (s) => {
  s.furLength = v;
  s.furStyle = style || undefined;
};
const furOn = (v: number, style = "") => (s: CustomSkin) => (s.furLength ?? 1) === v && (s.furStyle ?? "") === style;

const toggleMark = (id: string) => ({
  apply: (s: CustomSkin) => {
    const m = new Set(s.markings ?? []);
    if (m.has(id)) m.delete(id); else m.add(id);
    s.markings = [...m];
  },
  isOn: (s: CustomSkin) => (s.markings ?? []).includes(id),
});

const toggleScar = (id: string) => ({
  apply: (s: CustomSkin) => {
    const m = new Set(s.scars ?? []);
    if (m.has(id)) m.delete(id); else m.add(id);
    s.scars = [...m];
  },
  isOn: (s: CustomSkin) => (s.scars ?? []).includes(id),
});

const TACC = (item: { id: string; name: string; desc: string; apply: CatItem["apply"]; isOn: CatItem["isOn"]; tags?: string[] }) => ({
  ...item,
  category: "tailAcc" as const,
});

const equipAcc = (slot: AccessorySlot, id: string) => ({
  apply: (s: CustomSkin) => {
    s.acc = { ...(s.acc ?? {}) };
    if (s.acc[slot] === id) delete s.acc[slot]; // toggle off
    else s.acc[slot] = id;
  },
  isOn: (s: CustomSkin) => s.acc?.[slot] === id,
});

// ---------------------------------------------------------------------------
// Palette (natural colors)
// ---------------------------------------------------------------------------

export const COAT_COLORS: { hex: string; name: string }[] = [
  { hex: "#1c1c20", name: "Black" },
  { hex: "#2c2c30", name: "Charcoal" },
  { hex: "#43434a", name: "Dark Gray" },
  { hex: "#5c5c60", name: "Gray" },
  { hex: "#8f8f96", name: "Light Gray" },
  { hex: "#c9c2b8", name: "Silver" },
  { hex: "#e8e6e0", name: "White" },
  { hex: "#f4e9d8", name: "Cream" },
  { hex: "#e3c088", name: "Buff" },
  { hex: "#cfc3a1", name: "Ivory" },
  { hex: "#b0925f", name: "Tan" },
  { hex: "#8a7a66", name: "Fawn" },
  { hex: "#7a5b3a", name: "Brown" },
  { hex: "#6b4a2f", name: "Dark Brown" },
  { hex: "#a5622d", name: "Reddish Brown" },
  { hex: "#8a5a3a", name: "Cinnamon" },
  { hex: "#d96b2f", name: "Ginger" },
  { hex: "#e8963f", name: "Orange" },
  { hex: "#f0b26b", name: "Pale Orange" },
  { hex: "#d9a441", name: "Golden" },
  { hex: "#c98d5a", name: "Muted Gold" },
  { hex: "#a8563a", name: "Russet" },
];

export const EYE_COLORS: { hex: string; name: string }[] = [
  { hex: "#4fae6e", name: "Green" },
  { hex: "#8fd0a0", name: "Pale Green" },
  { hex: "#2f7a4a", name: "Dark Green" },
  { hex: "#5b8fd6", name: "Blue" },
  { hex: "#9cc2ea", name: "Pale Blue" },
  { hex: "#d9a83a", name: "Amber" },
  { hex: "#d9c04a", name: "Yellow" },
  { hex: "#c98a1e", name: "Gold" },
  { hex: "#b3502d", name: "Copper" },
  { hex: "#a88a4a", name: "Hazel" },
  { hex: "#e08a2a", name: "Orange-Gold" },
];

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

export const CAT_ITEMS: CatItem[] = [
  // --- FUR (length + silhouette styles) ------------------------------------
  { id: "fur-short", name: "Short Fur", category: "fur", desc: "Sleek and close to the body.", apply: setFur(0.7), isOn: furOn(0.7), tags: ["short", "sleek"] },
  { id: "fur-medium", name: "Medium Fur", category: "fur", desc: "The classic forest cat coat.", apply: setFur(1), isOn: furOn(1), tags: ["medium", "normal"] },
  { id: "fur-long", name: "Long Fur", category: "fur", desc: "Extra fluff around the chest and tail.", apply: setFur(1.3), isOn: furOn(1.3), tags: ["long", "fluffy"] },
  { id: "fur-fluffy", name: "Fluffy Fur", category: "fur", desc: "Maximum floof. Built for leaf-bare.", apply: setFur(1.6), isOn: furOn(1.6), tags: ["fluffy", "thick", "long"] },
  { id: "fur-sleek", name: "Sleek Fur", category: "fur", desc: "RiverClan-swimmer smooth.", apply: setFur(0.55), isOn: furOn(0.55), tags: ["sleek", "smooth", "short"] },
  { id: "fur-thick", name: "Thick Fur", category: "fur", desc: "A heavy, dense double coat.", apply: setFur(1.15, "thick"), isOn: furOn(1.15, "thick"), tags: ["thick", "dense", "winter", "leaf-bare"] },
  { id: "fur-scruffy", name: "Scruffy Fur", category: "fur", desc: "Tufty, ragged and untamed.", apply: setFur(1.05, "scruffy"), isOn: furOn(1.05, "scruffy"), tags: ["scruffy", "ragged", "messy"] },
  { id: "fur-tufted", name: "Tufted Fur", category: "fur", desc: "Chest and haunch fur tufts.", apply: setFur(1.3, "tufted"), isOn: furOn(1.3, "tufted"), tags: ["tuft", "ruff", "fluffy"] },

  // --- COLORS (primary coat) ----------------------------------------------
  ...COAT_COLORS.map((c) => ({
    id: `color-${c.name.toLowerCase().replace(/\s+/g, "-")}`,
    name: c.name,
    category: "colors" as ItemCategory,
    desc: `A natural ${c.name.toLowerCase()} coat.`,
    apply: (s: CustomSkin) => { s.fur = c.hex; s.furDark = shade(c.hex, 0.62); },
    isOn: (s: CustomSkin) => s.fur === c.hex,
    tags: [c.name.toLowerCase(), "color"],
  })),

  // --- PATTERNS ------------------------------------------------------------
  { id: "pat-solid", name: "Solid", category: "patterns", desc: "One color, head to tail.", apply: setPattern("solid"), isOn: patternOn("solid"), tags: ["plain"] },
  { id: "pat-tabby", name: "Classic Tabby", category: "patterns", desc: "Bold swirling stripes.", apply: setPattern("tabby"), isOn: patternOn("tabby"), tags: ["striped", "tabby"] },
  { id: "pat-mackerel", name: "Mackerel Tabby", category: "patterns", desc: "Fine tiger stripes.", apply: setPattern("mackerel"), isOn: patternOn("mackerel"), tags: ["striped", "tabby", "tiger"] },
  { id: "pat-spotted", name: "Spotted", category: "patterns", desc: "Dappled hunting spots.", apply: setPattern("spotted"), isOn: patternOn("spotted"), tags: ["spots", "dappled"] },
  { id: "pat-speckled", name: "Speckled", category: "patterns", desc: "Fine flecks of darker fur.", apply: setPattern("speckled"), isOn: patternOn("speckled"), tags: ["freckles"] },
  { id: "pat-tortie", name: "Tortoiseshell", category: "patterns", desc: "Mottled patches of two colors.", apply: setPattern("tortie"), isOn: patternOn("tortie"), tags: ["tortie", "patches"] },
  { id: "pat-calico", name: "Calico", category: "patterns", desc: "Tortie patches on white.", apply: setPattern("calico"), isOn: patternOn("calico"), tags: ["tricolor", "patches", "white"] },
  { id: "pat-bicolor", name: "Bicolor", category: "patterns", desc: "A dark saddle over lighter fur.", apply: setPattern("bicolor"), isOn: patternOn("bicolor"), tags: ["two color", "saddle"] },
  { id: "pat-masked", name: "Masked", category: "patterns", desc: "A darker face mask.", apply: setPattern("masked"), isOn: patternOn("masked"), tags: ["face", "dark"] },
  { id: "pat-colorpoint", name: "Colorpoint", category: "patterns", desc: "Dark ears, legs and tail.", apply: setPattern("colorpoint"), isOn: patternOn("colorpoint"), tags: ["siamese", "dark points"] },

  // --- WHITE MARKINGS (multi-select) ---------------------------------------
  { id: "mk-muzzle", name: "White Muzzle", category: "markings", desc: "A pale muzzle.", ...toggleMark("muzzle"), tags: ["white", "face"] },
  { id: "mk-chin", name: "White Chin", category: "markings", desc: "A small white chin.", ...toggleMark("chin"), tags: ["white", "face"] },
  { id: "mk-chest", name: "White Chest", category: "markings", desc: "A bright chest patch.", ...toggleMark("chest"), tags: ["white", "throat"] },
  { id: "mk-belly", name: "White Belly", category: "markings", desc: "A pale underside.", ...toggleMark("belly"), tags: ["white"] },
  { id: "mk-paws", name: "White Paws", category: "markings", desc: "Mittens! Front and back.", ...toggleMark("paws"), tags: ["white", "socks", "feet"] },
  { id: "mk-socks", name: "White Socks", category: "markings", desc: "Socks that reach up the leg.", ...toggleMark("socks"), tags: ["white", "legs"] },
  { id: "mk-tailtip", name: "White Tail Tip", category: "markings", desc: "A pale tail tip.", ...toggleMark("tailtip"), tags: ["white", "tail"] },
  { id: "mk-ears", name: "White Ear Edges", category: "markings", desc: "Pale ear rims.", ...toggleMark("ears"), tags: ["white", "ears"] },
  { id: "mk-blaze", name: "Forehead Blaze", category: "markings", desc: "A stripe up the nose bridge.", ...toggleMark("blaze"), tags: ["white", "face", "stripe"] },
  { id: "mk-nose", name: "Nose Stripe", category: "markings", desc: "A thin pale nose line.", ...toggleMark("nose"), tags: ["white", "face", "stripe"] },

  // --- EYES ----------------------------------------------------------------
  ...EYE_COLORS.map((c) => ({
    id: `eye-${c.name.toLowerCase().replace(/\s+/g, "-")}`,
    name: c.name,
    category: "eyes" as ItemCategory,
    desc: `${c.name} eyes.`,
    apply: (s: CustomSkin) => { s.eye = c.hex; },
    isOn: (s: CustomSkin) => s.eye === c.hex,
    tags: [c.name.toLowerCase(), "eyes"],
  })),
  {
    id: "eye-hetero-blue", name: "Heterochromia (Blue)", category: "eyes", desc: "One pale blue eye.",
    apply: (s: CustomSkin) => { s.eye2 = "#9cc2ea"; },
    isOn: (s: CustomSkin) => s.eye2 === "#9cc2ea",
    tags: ["heterochromia", "two colors", "odd eyes"],
  },
  {
    id: "eye-hetero-gold", name: "Heterochromia (Gold)", category: "eyes", desc: "One golden eye.",
    apply: (s: CustomSkin) => { s.eye2 = "#d9a83a"; },
    isOn: (s: CustomSkin) => s.eye2 === "#d9a83a",
    tags: ["heterochromia", "two colors", "odd eyes"],
  },
  { id: "eye-none", name: "Matching Eyes", category: "eyes", desc: "Remove heterochromia.", apply: (s: CustomSkin) => { delete s.eye2; }, isOn: (s: CustomSkin) => !s.eye2, tags: ["same eyes"] },

  // --- FACE (forehead/cheek markings + nose color) --------------------------
  { id: "face-default", name: "Natural Face", category: "face", desc: "No extra facial markings.", apply: (s: CustomSkin) => { delete s.face; }, isOn: (s: CustomSkin) => !s.face || s.face === "default", tags: ["plain", "none"] },
  { id: "face-forehead-tabby", name: "Tabby M", category: "face", desc: "The classic tabby M above the eyes.", apply: (s: CustomSkin) => { s.face = "forehead-tabby"; }, isOn: (s: CustomSkin) => s.face === "forehead-tabby", tags: ["forehead", "tabby", "stripe"] },
  { id: "face-forehead-dot", name: "Forehead Spot", category: "face", desc: "A small dark forehead spot.", apply: (s: CustomSkin) => { s.face = "forehead-dot"; }, isOn: (s: CustomSkin) => s.face === "forehead-dot", tags: ["forehead", "spot"] },
  { id: "face-cheek-ruff", name: "Pale Cheek Ruff", category: "face", desc: "Pale fur sweeping down the cheek.", apply: (s: CustomSkin) => { s.face = "cheek-ruff"; }, isOn: (s: CustomSkin) => s.face === "cheek-ruff", tags: ["cheek", "pale", "ruff"] },
  { id: "face-cheek-patch", name: "Dark Cheek Patch", category: "face", desc: "A darker patch on the cheek.", apply: (s: CustomSkin) => { s.face = "cheek-patch"; }, isOn: (s: CustomSkin) => s.face === "cheek-patch", tags: ["cheek", "dark", "patch"] },
  { id: "face-eyeshadow", name: "Dark Eye Rims", category: "face", desc: "Kohl-dark rims around the eyes.", apply: (s: CustomSkin) => { s.face = "eyeshadow"; }, isOn: (s: CustomSkin) => s.face === "eyeshadow", tags: ["eyes", "rim", "dark"] },
  { id: "face-brows", name: "Pale Brows", category: "face", desc: "Two pale brow dots.", apply: (s: CustomSkin) => { s.face = "brows"; }, isOn: (s: CustomSkin) => s.face === "brows", tags: ["brow", "pale"] },
  { id: "nose-default", name: "Natural Nose", category: "face", desc: "A warm pink nose.", apply: (s: CustomSkin) => { delete s.nose; }, isOn: (s: CustomSkin) => !s.nose, tags: ["nose", "pink"] },
  { id: "nose-black", name: "Black Nose", category: "face", desc: "A jet-black nose.", apply: (s: CustomSkin) => { s.nose = "black"; }, isOn: (s: CustomSkin) => s.nose === "black", tags: ["nose", "black"] },
  { id: "nose-liver", name: "Liver Nose", category: "face", desc: "A warm brown nose.", apply: (s: CustomSkin) => { s.nose = "liver"; }, isOn: (s: CustomSkin) => s.nose === "liver", tags: ["nose", "brown"] },
  { id: "nose-gray", name: "Slate Nose", category: "face", desc: "A cool gray nose.", apply: (s: CustomSkin) => { s.nose = "gray"; }, isOn: (s: CustomSkin) => s.nose === "gray", tags: ["nose", "gray"] },
  { id: "nose-orange", name: "Ginger Nose", category: "face", desc: "A bright orange nose.", apply: (s: CustomSkin) => { s.nose = "orange"; }, isOn: (s: CustomSkin) => s.nose === "orange", tags: ["nose", "orange"] },

  // --- EARS ----------------------------------------------------------------
  { id: "ear-normal", name: "Normal Ears", category: "ears", desc: "Classic pointed ears.", apply: setEars("normal"), isOn: earsOn("normal"), tags: ["pointed"] },
  { id: "ear-tall", name: "Tall Ears", category: "ears", desc: "Long, alert ears.", apply: setEars("tall"), isOn: earsOn("tall"), tags: ["large", "big"] },
  { id: "ear-fold", name: "Folded Ears", category: "ears", desc: "Softly folded ear tips.", apply: setEars("fold"), isOn: earsOn("fold"), tags: ["fold", "small"] },
  { id: "ear-rounded", name: "Rounded Ears", category: "ears", desc: "Gently rounded tips.", apply: setEars("rounded"), isOn: earsOn("rounded"), tags: ["round", "curved"] },
  { id: "ear-tufted", name: "Tufted Ears", category: "ears", desc: "Lynx-like ear tufts.", apply: setEars("tufted"), isOn: earsOn("tufted"), tags: ["tuft", "lynx", "fluff"] },

  // --- TAILS ---------------------------------------------------------------
  { id: "tail-normal", name: "Normal Tail", category: "tail", desc: "A standard warrior tail.", apply: setTail("normal"), isOn: tailOn("normal"), tags: ["medium"] },
  { id: "tail-short", name: "Short Tail", category: "tail", desc: "Bobbed and brave (like Redtail's).", apply: setTail("short"), isOn: tailOn("short"), tags: ["short", "bob"] },
  { id: "tail-fluffy", name: "Fluffy Tail", category: "tail", desc: "A plume of fur.", apply: setTail("fluffy"), isOn: tailOn("fluffy"), tags: ["fluffy", "bushy", "thick"] },
  { id: "tail-slim", name: "Slim Tail", category: "tail", desc: "Thin and whip-like.", apply: setTail("slim"), isOn: tailOn("slim"), tags: ["thin", "slender"] },
  { id: "tail-long", name: "Long Tail", category: "tail", desc: "Extra length for balance.", apply: setTail("long"), isOn: tailOn("long"), tags: ["long"] },

  // --- SCARS (multi-select) ------------------------------------------------
  { id: "sc-cheek", name: "Cheek Scar", category: "scars", desc: "A small cheek scratch.", ...toggleScar("cheek"), tags: ["face", "battle"] },
  { id: "sc-brow", name: "Brow Scar", category: "scars", desc: "A mark over the eye.", ...toggleScar("brow"), tags: ["face", "battle"] },
  { id: "sc-nose", name: "Nose Scar", category: "scars", desc: "A nick across the nose.", ...toggleScar("nose"), tags: ["face", "battle"] },
  { id: "sc-ear", name: "Ear Notch", category: "scars", desc: "A torn ear edge.", ...toggleScar("ear"), tags: ["ear", "battle"] },
  { id: "sc-shoulder", name: "Shoulder Scar", category: "scars", desc: "An old shoulder wound.", ...toggleScar("shoulder"), tags: ["body", "battle"] },
  { id: "sc-side", name: "Side Scar", category: "scars", desc: "A healed flank mark.", ...toggleScar("side"), tags: ["body", "battle"] },

  // --- HEAD ACCESSORIES ----------------------------------------------------
  { id: "hd-flower", name: "Small Flower", category: "head", desc: "A single blossom behind the ear.", ...equipAcc("head", "flower"), tags: ["flower", "nature", "greenleaf"] },
  { id: "hd-flowercrown", name: "Flower Crown", category: "head", desc: "A woven crown of flowers.", ...equipAcc("head", "flowercrown"), tags: ["flower", "crown", "nature"] },
  { id: "hd-leaf", name: "Leaf", category: "head", desc: "One stubborn oak leaf.", ...equipAcc("head", "leaf"), tags: ["leaf", "nature", "leaf-fall"] },
  { id: "hd-feather", name: "Feather", category: "head", desc: "A songbird feather.", ...equipAcc("head", "feather"), tags: ["feather", "bird"] },
  { id: "hd-leafcrown", name: "Leaf Crown", category: "head", desc: "A braided ring of leaves.", ...equipAcc("head", "leafcrown"), tags: ["leaf", "crown", "nature"] },
  { id: "hd-berries", name: "Berry Sprig", category: "head", desc: "A sprig of bright berries.", ...equipAcc("head", "berries"), tags: ["berry", "nature", "newleaf", "seasonal"] },
  { id: "hd-moth", name: "Perched Moth", category: "head", desc: "A dusty moth rests on your head.", ...equipAcc("head", "moth"), tags: ["moth", "fun", "cute", "insect"] },
  { id: "hd-acorn", name: "Acorn Cap", category: "head", desc: "A tiny acorn, leaf-fall's treasure.", ...equipAcc("head", "acorn"), tags: ["acorn", "seasonal", "leaf-fall"] },
  { id: "hd-holly", name: "Holly Sprig", category: "head", desc: "Glossy leaves and red berries.", ...equipAcc("head", "holly"), tags: ["holly", "seasonal", "leaf-bare", "berry"] },
  { id: "hd-butterfly", name: "Resting Butterfly", category: "head", desc: "A butterfly with fluttering wings.", ...equipAcc("head", "butterfly"), tags: ["butterfly", "fun", "cute", "greenleaf"] },
  { id: "hd-dandelion", name: "Dandelion", category: "head", desc: "A puff of ready seeds.", ...equipAcc("head", "dandelion"), tags: ["dandelion", "nature", "newleaf"] },
  { id: "hd-mushroom", name: "Mushroom Cap", category: "head", desc: "A spotted toadstool hat.", ...equipAcc("head", "mushroom"), tags: ["mushroom", "fun", "forest"] },
  { id: "hd-juniper", name: "Juniper Berries", category: "head", desc: "Frost-blue berries behind the ear.", ...equipAcc("head", "juniper"), tags: ["juniper", "berry", "herb", "seasonal"] },
  { id: "hd-starflower", name: "Starflower", category: "head", desc: "A pale bloom that shines at dusk.", ...equipAcc("head", "starflower"), tags: ["star", "flower", "nature", "night"] },

  // --- EAR ACCESSORIES -----------------------------------------------------
  { id: "er-flower", name: "Ear Flower", category: "ear", desc: "A tiny bloom on one ear.", ...equipAcc("ear", "flower"), tags: ["flower", "nature"] },
  { id: "er-feather", name: "Ear Feather", category: "ear", desc: "A feather tucked at the ear.", ...equipAcc("ear", "feather"), tags: ["feather"] },
  { id: "er-leaf", name: "Ear Leaf", category: "ear", desc: "A small leaf tucked in.", ...equipAcc("ear", "leaf"), tags: ["leaf", "nature"] },
  { id: "er-berry", name: "Ear Berries", category: "ear", desc: "Two tiny red berries.", ...equipAcc("ear", "berry"), tags: ["berry", "nature", "seasonal"] },
  { id: "er-ribbon", name: "Ear Ribbon", category: "ear", desc: "A little bow for one ear.", ...equipAcc("ear", "ribbon"), tags: ["ribbon", "bow", "fun", "cute"] },
  { id: "er-wrap", name: "Ear Wrap", category: "ear", desc: "A fine gold band at the ear base.", ...equipAcc("ear", "wrap"), tags: ["wrap", "gold", "fun"] },
  { id: "er-daisy", name: "Ear Daisy", category: "ear", desc: "A tiny white daisy.", ...equipAcc("ear", "daisy"), tags: ["daisy", "flower", "nature"] },

  // --- COLLARS (dedicated category, §16) — every one renders at the neck ---
  { id: "nk-collar-red", name: "Red Collar", category: "collars", desc: "A kittypet's red collar.", ...equipAcc("neck", "collar-red"), tags: ["collar", "kittypet"] },
  { id: "nk-collar-blue", name: "Blue Collar", category: "collars", desc: "A bluecloth collar.", ...equipAcc("neck", "collar-blue"), tags: ["collar"] },
  { id: "nk-collar-brown", name: "Leather Collar", category: "collars", desc: "Worn brown leather.", ...equipAcc("neck", "collar-brown"), tags: ["collar", "leather"] },
  { id: "nk-collar-yellow", name: "Yellow Collar", category: "collars", desc: "A sunny yellow collar.", ...equipAcc("neck", "collar-yellow"), tags: ["collar"] },
  { id: "nk-collar-purple", name: "Purple Collar", category: "collars", desc: "A deep violet collar.", ...equipAcc("neck", "collar-purple"), tags: ["collar"] },
  { id: "nk-collar-green", name: "Green Collar", category: "collars", desc: "A moss-green cloth collar.", ...equipAcc("neck", "collar-green"), tags: ["collar"] },
  { id: "nk-collar-woven", name: "Woven Collar", category: "collars", desc: "Two threads woven tight.", ...equipAcc("neck", "collar-woven"), tags: ["collar", "woven"] },
  { id: "nk-collar-braided", name: "Braided Collar", category: "collars", desc: "A braided rope band.", ...equipAcc("neck", "collar-braided"), tags: ["collar", "braided", "rope"] },
  { id: "nk-collar-stud", name: "Studded Collar", category: "collars", desc: "Dark leather with metal studs.", ...equipAcc("neck", "collar-stud"), tags: ["collar", "studs", "rogue"] },
  { id: "nk-collar-cloth", name: "Cloth Collar", category: "collars", desc: "A wide, soft cloth band.", ...equipAcc("neck", "collar-cloth"), tags: ["collar", "cloth"] },
  { id: "nk-collar-pattern", name: "Patterned Collar", category: "collars", desc: "Stitched with a dashed pattern.", ...equipAcc("neck", "collar-pattern"), tags: ["collar", "pattern", "stitched"] },
  { id: "nk-collar-nature", name: "Nature Collar", category: "collars", desc: "A pliable vine with leaves.", ...equipAcc("neck", "collar-nature"), tags: ["collar", "nature", "vine", "leaf"] },
  { id: "nk-collar-flower", name: "Blossom Collar", category: "collars", desc: "A collar strung with blossoms.", ...equipAcc("neck", "collar-flower"), tags: ["collar", "flower", "nature"] },
  { id: "nk-collar-holly", name: "Holly Collar", category: "collars", desc: "Winter holly worked into a band.", ...equipAcc("neck", "collar-holly"), tags: ["collar", "holly", "seasonal", "leaf-bare"] },
  { id: "nk-collar-kittypet", name: "Kittypet Collar", category: "collars", desc: "A bright Twolegplace collar with a tag.", ...equipAcc("neck", "collar-kittypet"), tags: ["collar", "kittypet", "tag"] },
  { id: "nk-collar-festival", name: "Festival Collar", category: "collars", desc: "Set with tiny colored gems.", ...equipAcc("neck", "collar-festival"), tags: ["collar", "gems", "fun", "festival"] },
  { id: "nk-bell", name: "Collar with Bell", category: "collars", desc: "A collar with a tiny brass bell.", ...equipAcc("neck", "bell"), tags: ["collar", "bell", "kittypet"] },
  { id: "nk-tag", name: "Collar with Tag", category: "collars", desc: "A collar with a small name-tag.", ...equipAcc("neck", "tag"), tags: ["collar", "tag", "kittypet"] },
  { id: "nk-charm", name: "Charm Collar", category: "collars", desc: "A collar with a swinging charm.", ...equipAcc("neck", "charm"), tags: ["collar", "charm", "fun"] },
  // --- NECK ACCESSORIES (non-collar pieces) ---------------------------------
  { id: "nk-ribbon", name: "Neck Ribbon", category: "neck", desc: "A soft cloth ribbon.", ...equipAcc("neck", "ribbon"), tags: ["ribbon", "bow"] },
  { id: "nk-scarf", name: "Leaf Scarf", category: "neck", desc: "A wrap of broad leaves.", ...equipAcc("neck", "scarf"), tags: ["scarf", "wrap", "nature"] },
  { id: "nk-garland", name: "Flower Garland", category: "neck", desc: "A garland of tiny blooms.", ...equipAcc("neck", "garland"), tags: ["flower", "garland", "greenleaf", "fun"] },
  { id: "nk-bandana", name: "Bandana", category: "neck", desc: "A soft cloth bandana.", ...equipAcc("neck", "bandana"), tags: ["bandana", "cloth", "roleplay"] },

  // --- BODY ACCESSORIES ----------------------------------------------------
  { id: "bd-herbs", name: "Herb Bundle", category: "body", desc: "Carried for the medicine cat.", ...equipAcc("body", "herbs"), tags: ["herbs", "medicine", "roleplay"] },
  { id: "bd-leaves", name: "Leaf Bundle", category: "body", desc: "A bundle of fresh leaves.", ...equipAcc("body", "leaves"), tags: ["leaf", "nature"] },
  { id: "bd-moss", name: "Moss Patch", category: "body", desc: "Soft moss clings to the back.", ...equipAcc("body", "moss"), tags: ["moss", "nature"] },
  { id: "bd-satchel", name: "Herb Satchel", category: "body", desc: "A strapped pouch for herbs.", ...equipAcc("body", "satchel"), tags: ["satchel", "bag", "roleplay", "medicine"] },
  { id: "bd-flowers", name: "Flower Trail", category: "body", desc: "Little blossoms line the back.", ...equipAcc("body", "flowers"), tags: ["flower", "nature", "fun", "newleaf"] },
  { id: "bd-garland", name: "Back Garland", category: "body", desc: "A garland draped across the back.", ...equipAcc("body", "garland"), tags: ["garland", "flower", "nature", "greenleaf"] },
  { id: "bd-vine", name: "Ivy Drape", category: "body", desc: "Trailing ivy along the flank.", ...equipAcc("body", "vine"), tags: ["ivy", "vine", "nature", "leaf"] },
  { id: "bd-pouch", name: "Traveler's Pouch", category: "body", desc: "A small pouch for long journeys.", ...equipAcc("body", "pouch"), tags: ["pouch", "bag", "roleplay", "travel"] },

  // --- PAW/LEG ACCESSORIES -------------------------------------------------
  { id: "pw-band-red", name: "Red Leg Band", category: "paw", desc: "A woven red band.", ...equipAcc("paw", "band-red"), tags: ["band", "leg", "red"] },
  { id: "pw-band-blue", name: "Blue Leg Band", category: "paw", desc: "A woven blue band.", ...equipAcc("paw", "band-blue"), tags: ["band", "leg", "blue"] },
  { id: "pw-wrap", name: "Paw Wraps", category: "paw", desc: "Cloth wraps for long patrols.", ...equipAcc("paw", "wrap"), tags: ["wrap", "bandage", "roleplay"] },
  { id: "pw-bracelet", name: "Leg Bracelet", category: "paw", desc: "A thin woven bracelet.", ...equipAcc("paw", "bracelet"), tags: ["bracelet", "band", "fun", "cute"] },
  { id: "pw-band-gold", name: "Gold Leg Band", category: "paw", desc: "A polished gold band.", ...equipAcc("paw", "band-gold"), tags: ["band", "gold", "fun"] },
  { id: "pw-ribbon", name: "Leg Ribbon", category: "paw", desc: "A tiny bow tied at the leg.", ...equipAcc("paw", "ribbon"), tags: ["ribbon", "bow", "fun", "cute"] },
  { id: "pw-leaf", name: "Leaf Leg Band", category: "paw", desc: "A fresh leaf folded into a band.", ...equipAcc("paw", "leaf"), tags: ["leaf", "nature", "band"] },

  // --- TAIL ACCESSORIES ----------------------------------------------------
  TACC({ id: "tl-band", name: "Tail Band", desc: "A woven band at the tail base.", ...equipAcc("tail", "band"), tags: ["band", "tail"] }),
  TACC({ id: "tl-ribbon", name: "Tail Ribbon", desc: "A bright ribbon tied on.", ...equipAcc("tail", "ribbon"), tags: ["ribbon", "tail", "bow"] }),
  TACC({ id: "tl-tuft", name: "Tail Tuft Tie", desc: "A tuft of feathers tied on.", ...equipAcc("tail", "tuft"), tags: ["feather", "tail"] }),
  TACC({ id: "tl-flower", name: "Tail Flower", desc: "A bloom tied at the tail base.", ...equipAcc("tail", "flower"), tags: ["flower", "tail", "nature"] }),
  TACC({ id: "tl-leaf", name: "Tail Leaves", desc: "Leaves tucked at the tail base.", ...equipAcc("tail", "leaf"), tags: ["leaf", "tail", "nature"] }),
  TACC({ id: "tl-bow", name: "Tail Bow", desc: "A plump bow for the tail.", ...equipAcc("tail", "bow"), tags: ["bow", "tail", "fun", "cute"] }),
  TACC({ id: "tl-feather", name: "Tail Feather", desc: "A long feather tied at the base.", ...equipAcc("tail", "feather"), tags: ["feather", "tail", "bird"] }),
  TACC({ id: "tl-berries", name: "Tail Berries", desc: "A sprig of red berries on the tail.", ...equipAcc("tail", "berries"), tags: ["berry", "tail", "seasonal"] }),
  TACC({ id: "tl-wrap", name: "Tail Wrap", desc: "A cloth wrap near the tail base.", ...equipAcc("tail", "wrap"), tags: ["wrap", "cloth", "tail"] }),
];

/** Item color for accessories that honor the accessory tint. */
export const ACCESSORY_COLORS: string[] = [
  "#d95f5f", "#5b8fd6", "#d9a83a", "#7fae4e", "#b07ad9", "#f0a05a", "#e8e6e0", "#2c2c30",
];

/** §21: pools for the per-slot tint swatches shown in the customizer. */
export const SLOT_COLORS: Partial<Record<AccessorySlot, string[]>> = {
  head: ["#d95f5f", "#f0a05a", "#d9a83a", "#e8e6e0", "#b07ad9", "#7fae4e"],
  ear: ["#d95f5f", "#e8e6e0", "#b07ad9", "#d9a83a"],
  neck: ["#d95f5f", "#3a6ac2", "#4a8a5c", "#d9b23a", "#8a4ac2", "#2c2c30", "#7a5230"],
  body: ["#7fae4e", "#d9a83a", "#e8e6e0", "#b07ad9"],
  paw: ["#d95f5f", "#5b8fd6", "#d9b23a", "#e8e6e0"],
  tail: ["#d95f5f", "#5b8fd6", "#d9a83a", "#b07ad9", "#e8e6e0"],
};

/** The tint that renders a slot's accessory: per-slot override, else shared. */
export function accTint(skin: CustomSkin, slot: AccessorySlot): string {
  return skin.accColors?.[slot] ?? skin.accColor ?? "#d95f5f";
}

export function shade(hex: string, f: number): string {
  const n = hex.replace("#", "");
  if (n.length !== 6) return "#5a3a20";
  const r = Math.round(parseInt(n.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(n.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(n.slice(4, 6), 16) * f);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function itemById(id: string): CatItem | undefined {
  return CAT_ITEMS.find((i) => i.id === id);
}

/** Search: name + tags + category name. */
export function searchItems(query: string, category: ItemCategory | "all" | "favorites"): CatItem[] {
  const q = query.trim().toLowerCase();
  let pool = CAT_ITEMS;
  if (category !== "all" && category !== "favorites") pool = pool.filter((i) => i.category === category);
  if (!q) return pool;
  return pool.filter(
    (i) =>
      i.name.toLowerCase().includes(q) ||
      i.desc.toLowerCase().includes(q) ||
      (i.tags ?? []).some((t) => t.includes(q) || t === q), // exact tag match covers color words
  );
}

// ---------------------------------------------------------------------------
// Accessory browsing: slot membership, theme filters, randomizer
// ---------------------------------------------------------------------------

export type AccTheme = "nature" | "seasonal" | "roleplay" | "fun";

export const ACC_THEMES: { id: AccTheme; name: string }[] = [
  { id: "nature", name: "Nature" },
  { id: "seasonal", name: "Seasonal" },
  { id: "roleplay", name: "Roleplay" },
  { id: "fun", name: "Fun" },
];

/** Which catalog category holds each accessory slot's items. */
export const ACC_SLOT_CATS: Record<AccessorySlot, ItemCategory> = {
  head: "head",
  ear: "ear",
  neck: "neck",
  body: "body",
  paw: "paw",
  tail: "tailAcc",
};

/** Extra catalog categories that also belong to a slot (collars → neck). */
const ACC_SLOT_EXTRA_CATS: Partial<Record<AccessorySlot, ItemCategory[]>> = {
  neck: ["collars"],
};

/** True when a catalog item equips into the given accessory slot. */
function itemInSlot(category: ItemCategory, slot: AccessorySlot): boolean {
  return category === ACC_SLOT_CATS[slot] || (ACC_SLOT_EXTRA_CATS[slot] ?? []).includes(category);
}

const THEME_TAGS: Record<AccTheme, string[]> = {
  nature: ["nature", "leaf", "flower", "herbs", "moss", "berry"],
  seasonal: ["seasonal", "holly", "acorn", "newleaf", "leaf-fall", "leaf-bare"],
  roleplay: ["roleplay", "medicine", "kittypet", "bandage", "wrap", "tag", "cloth"],
  fun: ["fun", "bow", "ribbon", "moth", "cute", "garland", "bracelet"],
};

/** All accessory items, optionally narrowed to one slot and/or theme. */
export function accessoriesFor(slot: AccessorySlot | "all", theme?: AccTheme): CatItem[] {
  const accCats = Object.values(ACC_SLOT_CATS) as ItemCategory[];
  let pool =
    slot === "all"
      ? CAT_ITEMS.filter(
          (i) => accCats.includes(i.category) || i.category === "collars",
        )
      : CAT_ITEMS.filter((i) => itemInSlot(i.category, slot));
  if (theme) pool = pool.filter((i) => (i.tags ?? []).some((t) => THEME_TAGS[theme].includes(t)));
  return pool;
}

/** The catalog prefix each accessory slot uses for its item ids. */
const ACC_PREFIX: Record<AccessorySlot, string> = {
  head: "hd-",
  ear: "er-",
  neck: "nk-",
  body: "bd-",
  paw: "pw-",
  tail: "tl-",
};

/**
 * Build a complete, valid randomized appearance. Never produces invalid
 * combinations: accessories come from the real catalog, only one per slot,
 * and every id matches what the renderer understands.
 */
export function randomSkin(prev?: CustomSkin): CustomSkin {
  const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
  const s: CustomSkin = { ...(prev ?? { fur: "#d96b2f", furDark: "#8a4a20", eye: "#4fae6e" }) };
  const color = pick(COAT_COLORS);
  s.fur = color.hex;
  s.furDark = shade(color.hex, 0.62);
  s.pattern = Math.random() < 0.7 ? pick(CAT_ITEMS.filter((i) => i.category === "patterns")).id.replace("pat-", "") : "solid";
  s.patternIntensity = 0.5 + Math.random() * 0.5;
  pick(CAT_ITEMS.filter((i) => i.category === "fur")).apply(s);
  s.eye = pick(EYE_COLORS).hex;
  // heterochromia only when the second eye actually differs from the first
  if (Math.random() < 0.12) {
    const h = pick(["#9cc2ea", "#d9a83a"]);
    if (h !== s.eye) s.eye2 = h;
  }
  if (!s.eye2) delete s.eye2;
  pick(CAT_ITEMS.filter((i) => i.category === "ears")).apply(s);
  pick(CAT_ITEMS.filter((i) => i.category === "tail")).apply(s);
  if (Math.random() < 0.2) s.nose = pick(["black", "liver", "gray", "orange"]);
  else delete s.nose;
  if (Math.random() < 0.25) s.face = pick(["forehead-tabby", "forehead-dot", "cheek-ruff", "cheek-patch", "eyeshadow", "brows"]);
  else delete s.face;
  s.markings = CAT_ITEMS.filter((i) => i.category === "markings")
    .filter(() => Math.random() < 0.28)
    .map((i) => i.id.replace("mk-", ""));
  s.scars = Math.random() < 0.12 ? [pick(CAT_ITEMS.filter((i) => i.category === "scars")).id.replace("sc-", "")] : [];
  s.acc = {};
  s.accColors = {};
  const accPool = accessoriesFor("all");
  const n = Math.random() < 0.45 ? (Math.random() < 0.3 ? 2 : 1) : 0;
  const usedSlots: AccessorySlot[] = [];
  for (let i = 0; i < n; i++) {
    const it = pick(accPool);
    const slot = (Object.keys(ACC_SLOT_CATS) as AccessorySlot[]).find((sl) => itemInSlot(it.category, sl));
    if (!slot || usedSlots.includes(slot)) continue;
    usedSlots.push(slot);
    const prefix = ACC_PREFIX[slot];
    s.acc[slot] = it.id.startsWith(prefix) ? it.id.slice(prefix.length) : it.id;
    if (Math.random() < 0.6) s.accColors[slot] = pick(SLOT_COLORS[slot] ?? ACCESSORY_COLORS);
  }
  s.accColor = pick(ACCESSORY_COLORS);
  return s;
}
