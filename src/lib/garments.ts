// Library of common garments with sensible default properties.
// Used for quick manual entry and to normalise what the vision model returns,
// so warmth / water / wind values come from explicit rules, not model guesses.

import type { Category, ClothingItem } from "./types";

export interface GarmentPreset {
  subtype: string;
  category: Category;
  warmth: number;
  waterResistance: 0 | 1 | 2;
  windResistance: 0 | 1 | 2;
  layerable: boolean;
  /** Extra words that should map to this preset. */
  aliases?: string[];
}

export const GARMENT_PRESETS: GarmentPreset[] = [
  // Torso base layers
  { subtype: "t-shirt", category: "base", warmth: 1, waterResistance: 0, windResistance: 0, layerable: true, aliases: ["tee", "tshirt", "top", "tank top"] },
  { subtype: "long-sleeve shirt", category: "base", warmth: 1, waterResistance: 0, windResistance: 0, layerable: true, aliases: ["long sleeve", "blouse", "button-up shirt", "dress shirt", "shirt", "polo"] },
  { subtype: "thermal top", category: "base", warmth: 2, waterResistance: 0, windResistance: 0, layerable: true, aliases: ["thermal", "base layer", "heattech", "merino top", "long underwear top"] },
  // Mid layers
  { subtype: "sweater", category: "mid", warmth: 2, waterResistance: 0, windResistance: 0, layerable: true, aliases: ["jumper", "pullover", "knit", "turtleneck"] },
  { subtype: "wool sweater", category: "mid", warmth: 3, waterResistance: 0, windResistance: 0, layerable: true, aliases: ["merino sweater", "cashmere sweater"] },
  { subtype: "hoodie", category: "mid", warmth: 2, waterResistance: 0, windResistance: 0, layerable: true, aliases: ["hooded sweatshirt", "zip hoodie"] },
  { subtype: "sweatshirt", category: "mid", warmth: 2, waterResistance: 0, windResistance: 0, layerable: true, aliases: ["crewneck"] },
  { subtype: "cardigan", category: "mid", warmth: 2, waterResistance: 0, windResistance: 0, layerable: true },
  { subtype: "fleece", category: "mid", warmth: 3, waterResistance: 0, windResistance: 0, layerable: true, aliases: ["fleece jacket", "polar fleece"] },
  { subtype: "down vest", category: "mid", warmth: 3, waterResistance: 0, windResistance: 1, layerable: true, aliases: ["vest", "puffer vest"] },
  // Outer layers
  { subtype: "denim jacket", category: "outer", warmth: 2, waterResistance: 0, windResistance: 1, layerable: true, aliases: ["jean jacket"] },
  { subtype: "light jacket", category: "outer", warmth: 2, waterResistance: 0, windResistance: 1, layerable: true, aliases: ["bomber", "bomber jacket", "blazer", "jacket"] },
  { subtype: "windbreaker", category: "outer", warmth: 1, waterResistance: 1, windResistance: 2, layerable: true, aliases: ["wind jacket", "shell"] },
  { subtype: "rain jacket", category: "outer", warmth: 1, waterResistance: 2, windResistance: 2, layerable: true, aliases: ["raincoat", "rain coat", "waterproof jacket", "hardshell"] },
  { subtype: "trench coat", category: "outer", warmth: 2, waterResistance: 1, windResistance: 1, layerable: true, aliases: ["trench"] },
  { subtype: "wool coat", category: "outer", warmth: 4, waterResistance: 0, windResistance: 1, layerable: true, aliases: ["peacoat", "overcoat"] },
  { subtype: "puffer jacket", category: "outer", warmth: 4, waterResistance: 1, windResistance: 2, layerable: true, aliases: ["puffer", "down jacket", "insulated jacket", "quilted jacket"] },
  { subtype: "winter parka", category: "outer", warmth: 5, waterResistance: 1, windResistance: 2, layerable: true, aliases: ["parka", "winter coat", "winter jacket", "long puffer"] },
  // Bottoms
  { subtype: "shorts", category: "bottom", warmth: 0, waterResistance: 0, windResistance: 0, layerable: false },
  { subtype: "skirt", category: "bottom", warmth: 0, waterResistance: 0, windResistance: 0, layerable: false, aliases: ["dress"] },
  { subtype: "jeans", category: "bottom", warmth: 1, waterResistance: 0, windResistance: 1, layerable: false, aliases: ["denim"] },
  { subtype: "trousers", category: "bottom", warmth: 1, waterResistance: 0, windResistance: 0, layerable: false, aliases: ["pants", "chinos", "slacks", "dress pants"] },
  { subtype: "sweatpants", category: "bottom", warmth: 2, waterResistance: 0, windResistance: 0, layerable: false, aliases: ["joggers", "track pants"] },
  { subtype: "lined pants", category: "bottom", warmth: 2, waterResistance: 1, windResistance: 1, layerable: false, aliases: ["fleece-lined pants", "flannel-lined jeans"] },
  { subtype: "snow pants", category: "bottom", warmth: 3, waterResistance: 2, windResistance: 2, layerable: false, aliases: ["ski pants"] },
  { subtype: "leggings", category: "bottom", warmth: 1, waterResistance: 0, windResistance: 0, layerable: true, aliases: ["tights"] },
  { subtype: "thermal leggings", category: "bottom", warmth: 2, waterResistance: 0, windResistance: 0, layerable: true, aliases: ["long johns", "thermal bottoms", "long underwear"] },
  // Footwear
  { subtype: "sandals", category: "footwear", warmth: 0, waterResistance: 0, windResistance: 0, layerable: false, aliases: ["flip flops", "slides"] },
  { subtype: "sneakers", category: "footwear", warmth: 1, waterResistance: 0, windResistance: 0, layerable: false, aliases: ["running shoes", "trainers", "shoes", "canvas shoes"] },
  { subtype: "leather shoes", category: "footwear", warmth: 1, waterResistance: 1, windResistance: 1, layerable: false, aliases: ["loafers", "dress shoes", "oxfords"] },
  { subtype: "ankle boots", category: "footwear", warmth: 2, waterResistance: 1, windResistance: 1, layerable: false, aliases: ["boots", "chelsea boots", "leather boots"] },
  { subtype: "rain boots", category: "footwear", warmth: 1, waterResistance: 2, windResistance: 2, layerable: false, aliases: ["rubber boots", "wellies"] },
  { subtype: "winter boots", category: "footwear", warmth: 4, waterResistance: 2, windResistance: 2, layerable: false, aliases: ["snow boots", "insulated boots"] },
  // Head / hands / neck
  { subtype: "cap", category: "head", warmth: 0, waterResistance: 0, windResistance: 0, layerable: false, aliases: ["baseball cap", "sun hat"] },
  { subtype: "toque", category: "head", warmth: 2, waterResistance: 0, windResistance: 1, layerable: false, aliases: ["beanie", "winter hat", "knit hat", "tuque"] },
  { subtype: "gloves", category: "hands", warmth: 2, waterResistance: 0, windResistance: 1, layerable: false, aliases: ["knit gloves"] },
  { subtype: "insulated mittens", category: "hands", warmth: 4, waterResistance: 1, windResistance: 2, layerable: false, aliases: ["mittens", "mitts", "winter gloves", "ski gloves"] },
  { subtype: "scarf", category: "neck", warmth: 2, waterResistance: 0, windResistance: 1, layerable: false },
  { subtype: "neck warmer", category: "neck", warmth: 2, waterResistance: 0, windResistance: 2, layerable: false, aliases: ["neck gaiter", "balaclava"] },
  // Accessories
  { subtype: "wool socks", category: "accessory", warmth: 2, waterResistance: 0, windResistance: 0, layerable: false, aliases: ["thermal socks", "warm socks"] },
  { subtype: "umbrella", category: "accessory", warmth: 0, waterResistance: 2, windResistance: 0, layerable: false },
  { subtype: "sunglasses", category: "accessory", warmth: 0, waterResistance: 0, windResistance: 0, layerable: false },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Find the preset that best matches a free-text garment name. */
export function findPreset(text: string): GarmentPreset | undefined {
  const t = norm(text);
  if (!t) return undefined;
  // Exact subtype or alias match first, then longest substring match.
  for (const p of GARMENT_PRESETS) {
    if (norm(p.subtype) === t || p.aliases?.some((a) => norm(a) === t)) return p;
  }
  let best: GarmentPreset | undefined;
  let bestLen = 0;
  for (const p of GARMENT_PRESETS) {
    for (const name of [p.subtype, ...(p.aliases ?? [])]) {
      const n = norm(name);
      if (n.length > bestLen && (t.includes(n) || (n.includes(t) && t.length >= 4))) {
        best = p;
        bestLen = n.length;
      }
    }
  }
  return best;
}

let counter = 0;
export function newId(): string {
  counter += 1;
  return `item_${Date.now().toString(36)}_${counter}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Create a wardrobe item from a preset, with optional overrides. */
export function itemFromPreset(preset: GarmentPreset, overrides: Partial<ClothingItem> = {}): ClothingItem {
  return {
    id: newId(),
    name: overrides.name ?? preset.subtype,
    category: preset.category,
    subtype: preset.subtype,
    warmth: preset.warmth,
    waterResistance: preset.waterResistance,
    windResistance: preset.windResistance,
    layerable: preset.layerable,
    available: true,
    source: "manual",
    ...overrides,
  };
}

const CATEGORIES: Category[] = ["base", "mid", "outer", "bottom", "footwear", "head", "hands", "neck", "accessory"];

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as string[]).includes(v);
}

export const CATEGORY_LABELS: Record<Category, string> = {
  base: "Base layer (top)",
  mid: "Mid layer",
  outer: "Outer layer",
  bottom: "Bottoms",
  footwear: "Footwear",
  head: "Head",
  hands: "Hands",
  neck: "Neck",
  accessory: "Accessory",
};

export const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};
