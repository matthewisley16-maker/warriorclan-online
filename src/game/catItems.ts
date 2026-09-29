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
  | "fur" | "colors" | "patterns" | "markings" | "eyes" | "ears" | "tail" | "tailAcc" | "scars"
  | AccessorySlot;

export const CATEGORIES: { id: ItemCategory | "all" | "favorites"; name: string }[] = [
  { id: "fur", name: "Fur" },
  { id: "colors", name: "Colors" },
  { id: "patterns", name: "Patterns" },
  { id: "markings", name: "Markings" },
  { id: "eyes", name: "Eyes" },
  { id: "ears", name: "Ears" },
  { id: "tail", name: "Tail" },
  { id: "tailAcc", name: "Tail Items" },
  { id: "scars", name: "Scars" },
  { id: "head", name: "Head" },
  { id: "ear", name: "Ear Items" },
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
  furLength?: number; // 0.6 short .. 1.6 fluffy
  tail?: string; // extended tail id
  ears?: string; // extended ear id
  size?: number;
  scar?: boolean;
  // --- markings (multi-select, white overlay) ---
  markings?: string[]; // ids from MARKING_ITEMS
  // --- scars (multi-select) ---
  scars?: string[]; // ids from SCAR_ITEMS
  // --- accessories: one item per slot ---
  acc?: Partial<Record<AccessorySlot, string>>;
  accColor?: string; // shared accessory tint (flowers/ribbons/bands)
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

const setFurLen = (v: number): ((s: CustomSkin) => void) => (s) => { s.furLength = v; };
const furLenOn = (v: number) => (s: CustomSkin) => (s.furLength ?? 1) === v;

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
  // --- FUR LENGTH ----------------------------------------------------------
  { id: "fur-short", name: "Short Fur", category: "fur", desc: "Sleek and close to the body.", apply: setFurLen(0.7), isOn: furLenOn(0.7), tags: ["short", "sleek"] },
  { id: "fur-medium", name: "Medium Fur", category: "fur", desc: "The classic forest cat coat.", apply: setFurLen(1), isOn: furLenOn(1), tags: ["medium", "normal"] },
  { id: "fur-long", name: "Long Fur", category: "fur", desc: "Extra fluff around the chest and tail.", apply: setFurLen(1.3), isOn: furLenOn(1.3), tags: ["long", "fluffy"] },
  { id: "fur-fluffy", name: "Fluffy Fur", category: "fur", desc: "Maximum floof. Built for leaf-bare.", apply: setFurLen(1.6), isOn: furLenOn(1.6), tags: ["fluffy", "thick", "long"] },
  { id: "fur-sleek", name: "Sleek Fur", category: "fur", desc: "RiverClan-swimmer smooth.", apply: setFurLen(0.55), isOn: furLenOn(0.55), tags: ["sleek", "smooth", "short"] },

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
  { id: "hd-berries", name: "Berry Sprig", category: "head", desc: "A sprig of bright berries.", ...equipAcc("head", "berries"), tags: ["berry", "nature", "newleaf"] },

  // --- EAR ACCESSORIES -----------------------------------------------------
  { id: "er-flower", name: "Ear Flower", category: "ear", desc: "A tiny bloom on one ear.", ...equipAcc("ear", "flower"), tags: ["flower", "nature"] },
  { id: "er-feather", name: "Ear Feather", category: "ear", desc: "A feather tucked at the ear.", ...equipAcc("ear", "feather"), tags: ["feather"] },
  { id: "er-leaf", name: "Ear Leaf", category: "ear", desc: "A small leaf tucked in.", ...equipAcc("ear", "leaf"), tags: ["leaf", "nature"] },

  // --- NECK ACCESSORIES ----------------------------------------------------
  { id: "nk-collar-red", name: "Red Collar", category: "neck", desc: "A kittypet's red collar.", ...equipAcc("neck", "collar-red"), tags: ["collar", "kittypet"] },
  { id: "nk-collar-blue", name: "Blue Collar", category: "neck", desc: "A bluecloth collar.", ...equipAcc("neck", "collar-blue"), tags: ["collar"] },
  { id: "nk-collar-brown", name: "Leather Collar", category: "neck", desc: "Worn brown leather.", ...equipAcc("neck", "collar-brown"), tags: ["collar", "leather"] },
  { id: "nk-collar-yellow", name: "Yellow Collar", category: "neck", desc: "A sunny yellow collar.", ...equipAcc("neck", "collar-yellow"), tags: ["collar"] },
  { id: "nk-collar-purple", name: "Purple Collar", category: "neck", desc: "A deep violet collar.", ...equipAcc("neck", "collar-purple"), tags: ["collar"] },
  { id: "nk-collar-green", name: "Green Collar", category: "neck", desc: "A moss-green cloth collar.", ...equipAcc("neck", "collar-green"), tags: ["collar"] },
  { id: "nk-bell", name: "Collar with Bell", category: "neck", desc: "A collar with a tiny brass bell.", ...equipAcc("neck", "bell"), tags: ["collar", "bell", "kittypet"] },
  { id: "nk-tag", name: "Collar with Tag", category: "neck", desc: "A collar with a small name-tag.", ...equipAcc("neck", "tag"), tags: ["collar", "tag", "kittypet"] },
  { id: "nk-ribbon", name: "Neck Ribbon", category: "neck", desc: "A soft cloth ribbon.", ...equipAcc("neck", "ribbon"), tags: ["ribbon", "bow"] },
  { id: "nk-scarf", name: "Leaf Scarf", category: "neck", desc: "A wrap of broad leaves.", ...equipAcc("neck", "scarf"), tags: ["scarf", "wrap", "nature"] },
  { id: "nk-garland", name: "Flower Garland", category: "neck", desc: "A garland of tiny blooms.", ...equipAcc("neck", "garland"), tags: ["flower", "garland", "greenleaf"] },

  // --- BODY ACCESSORIES ----------------------------------------------------
  { id: "bd-herbs", name: "Herb Bundle", category: "body", desc: "Carried for the medicine cat.", ...equipAcc("body", "herbs"), tags: ["herbs", "medicine", "roleplay"] },
  { id: "bd-leaves", name: "Leaf Bundle", category: "body", desc: "A bundle of fresh leaves.", ...equipAcc("body", "leaves"), tags: ["leaf", "nature"] },
  { id: "bd-moss", name: "Moss Patch", category: "body", desc: "Soft moss clings to the back.", ...equipAcc("body", "moss"), tags: ["moss", "nature"] },

  // --- PAW/LEG ACCESSORIES -------------------------------------------------
  { id: "pw-band-red", name: "Red Leg Band", category: "paw", desc: "A woven red band.", ...equipAcc("paw", "band-red"), tags: ["band", "leg", "red"] },
  { id: "pw-band-blue", name: "Blue Leg Band", category: "paw", desc: "A woven blue band.", ...equipAcc("paw", "band-blue"), tags: ["band", "leg", "blue"] },
  { id: "pw-wrap", name: "Paw Wraps", category: "paw", desc: "Cloth wraps for long patrols.", ...equipAcc("paw", "wrap"), tags: ["wrap", "bandage"] },

  // --- TAIL ACCESSORIES ----------------------------------------------------
  TACC({ id: "tl-band", name: "Tail Band", desc: "A woven band at the tail base.", ...equipAcc("tail", "band"), tags: ["band", "tail"] }),
  TACC({ id: "tl-ribbon", name: "Tail Ribbon", desc: "A bright ribbon tied on.", ...equipAcc("tail", "ribbon"), tags: ["ribbon", "tail", "bow"] }),
  TACC({ id: "tl-tuft", name: "Tail Tuft Tie", desc: "A tuft of feathers tied on.", ...equipAcc("tail", "tuft"), tags: ["feather", "tail"] }),
];

/** Item color for accessories that honor the accessory tint. */
export const ACCESSORY_COLORS: string[] = [
  "#d95f5f", "#5b8fd6", "#d9a83a", "#7fae4e", "#b07ad9", "#f0a05a", "#e8e6e0", "#2c2c30",
];

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
