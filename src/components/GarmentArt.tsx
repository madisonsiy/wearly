"use client";

import type { ClothingItem } from "@/lib/types";

// Shows the user's real photo of an item. Without one, draws a clean illustration
// of that garment type in the item's colour, so the closet never shows bare icons.

const COLORS: Record<string, string> = {
  black: "#3a3d44", white: "#f4f4f2", grey: "#a9adb5", gray: "#a9adb5", charcoal: "#5b5f66", navy: "#33456b", blue: "#6f93c9",
  "light blue": "#a9c6e8", denim: "#5f7fa8", red: "#d0605e", burgundy: "#8c3b4a", pink: "#eeb3c3", purple: "#9b86c2",
  lavender: "#c7b8e6", green: "#7aa37a", olive: "#8a8f5a", khaki: "#c9b58f", beige: "#e3d3b8", cream: "#f3ead6",
  brown: "#9a6f52", tan: "#c99c72", camel: "#c4935c", yellow: "#f0cf6b", orange: "#eb9a5e", teal: "#5fa9a6",
};

const DEFAULT_BY_CAT: Record<string, string> = {
  base: "#e8e2d6", mid: "#b9c7d9", outer: "#8fa3bf", bottom: "#6f88ad", footwear: "#c9b7a6", head: "#d9a5a5", hands: "#a5b8a0", neck: "#d7b48c", accessory: "#b7a9c9",
};

export function colorFromText(text: string): string | undefined {
  const t = text.toLowerCase();
  const keys = Object.keys(COLORS).sort((a, b) => b.length - a.length);
  return keys.find((k) => t.includes(k));
}

function fillFor(item: ClothingItem): string {
  const fromColor = item.color ? colorFromText(item.color) : undefined;
  if (fromColor) return COLORS[fromColor];
  const fromName = colorFromText(item.name);
  if (fromName) return COLORS[fromName];
  if (/jean|denim/.test(`${item.subtype} ${item.name}`.toLowerCase())) return COLORS.denim;
  return DEFAULT_BY_CAT[item.category] ?? "#c8c8c8";
}

type Shape =
  | "tee" | "longsleeve" | "sweater" | "hoodie" | "jacket" | "coat" | "pants" | "shorts" | "skirt" | "dress"
  | "sneaker" | "boot" | "sandal" | "toque" | "cap" | "glove" | "scarf" | "sock" | "umbrella" | "sunglasses" | "generic";

function shapeFor(item: ClothingItem): Shape {
  const s = `${item.subtype} ${item.name}`.toLowerCase();
  const m: [RegExp, Shape][] = [
    [/umbrella/, "umbrella"], [/sunglass/, "sunglasses"], [/sock/, "sock"], [/scarf|neck/, "scarf"], [/glove|mitt/, "glove"],
    [/toque|beanie|tuque|knit hat/, "toque"], [/cap|sun hat|bucket|hat/, "cap"], [/sandal|slide|flip/, "sandal"], [/boot/, "boot"],
    [/shoe|sneaker|loafer|trainer|oxford/, "sneaker"], [/dress/, "dress"], [/skirt/, "skirt"], [/short/, "shorts"],
    [/jean|pant|trouser|chino|legging|jogger|tights|long john|slack/, "pants"], [/parka|puffer|coat|trench/, "coat"],
    [/jacket|windbreaker|shell|blazer|bomber|vest/, "jacket"], [/hood/, "hoodie"], [/sweater|cardigan|fleece|jumper|pullover|sweatshirt|knit/, "sweater"],
    [/t-shirt|tee\b|tank|polo/, "tee"], [/long|thermal|button|blouse|shirt/, "longsleeve"], [/top/, "tee"],
  ];
  for (const [re, shape] of m) if (re.test(s)) return shape;
  const byCat: Record<string, Shape> = { base: "tee", mid: "sweater", outer: "jacket", bottom: "pants", footwear: "sneaker", head: "cap", hands: "glove", neck: "scarf", accessory: "generic" };
  return byCat[item.category] ?? "generic";
}

const STROKE = "rgba(40,40,50,0.35)";

function Art({ shape, fill }: { shape: Shape; fill: string }) {
  const p = { fill, stroke: STROKE, strokeWidth: 1.2, strokeLinejoin: "round" as const };
  const detail = { fill: "none", stroke: STROKE, strokeWidth: 1.2, strokeLinecap: "round" as const };
  switch (shape) {
    case "tee":
      return <><path {...p} d="M22 12 L14 16 L8 26 L15 30 L18 25 L18 54 L46 54 L46 25 L49 30 L56 26 L50 16 L42 12 Q32 19 22 12Z" /><path {...detail} d="M24 13 Q32 18 40 13" /></>;
    case "longsleeve":
      return <><path {...p} d="M22 12 L13 16 L6 48 L12 50 L18 28 L18 55 L46 55 L46 28 L52 50 L58 48 L51 16 L42 12 Q32 18 22 12Z" /><path {...detail} d="M32 16 V55 M29 24 h0 M29 32 h0" /></>;
    case "sweater":
      return <><path {...p} d="M21 12 L12 17 L6 50 L13 52 L18 30 L18 55 L46 55 L46 30 L51 52 L58 50 L52 17 L43 12 Q32 20 21 12Z" /><path {...detail} d="M18 51 H46 M8 46 L13 47 M56 46 L51 47 M25 14 Q32 19 39 14" /></>;
    case "hoodie":
      return <><path {...p} d="M22 14 L12 18 L6 50 L13 52 L18 30 L18 55 L46 55 L46 30 L51 52 L58 50 L52 18 L42 14 Q42 4 32 4 Q22 4 22 14Z" /><path {...detail} d="M26 14 Q32 22 38 14 M29 18 V28 M35 18 V28 M24 40 H40 V48 H24Z" /></>;
    case "jacket":
      return <><path {...p} d="M22 10 L12 15 L6 50 L13 52 L18 30 L18 56 L46 56 L46 30 L51 52 L58 50 L52 15 L42 10 L32 18Z" /><path {...detail} d="M32 18 V56 M22 10 L28 22 M42 10 L36 22 M22 42 H28 M36 42 H42" /></>;
    case "coat":
      return <><path {...p} d="M22 8 L11 14 L6 52 L13 54 L17 32 L16 60 L48 60 L47 32 L51 54 L58 52 L53 14 L42 8 Q32 2 22 8Z" /><path {...detail} d="M32 12 V60 M17 22 H47 M17 32 H47 M17 42 H47 M17 51 H47" /></>;
    case "pants":
      return <><path {...p} d="M18 8 H46 L50 58 H37 L32 24 L27 58 H14Z" /><path {...detail} d="M18 14 H46 M32 14 V24 M22 14 Q24 20 20 22 M42 14 Q40 20 44 22" /></>;
    case "shorts":
      return <><path {...p} d="M16 14 H48 L52 44 H36 L32 28 L28 44 H12Z" /><path {...detail} d="M16 20 H48 M32 20 V28" /></>;
    case "skirt":
      return <><path {...p} d="M22 12 H42 L54 52 Q32 58 10 52Z" /><path {...detail} d="M22 18 H42 M26 18 L20 54 M38 18 L44 54 M32 18 V56" /></>;
    case "dress":
      return <><path {...p} d="M25 6 L22 18 L26 24 L12 58 Q32 62 52 58 L38 24 L42 18 L39 6 Q32 12 25 6Z" /><path {...detail} d="M26 24 H38" /></>;
    case "sneaker":
      return <><path {...p} d="M8 40 L10 28 Q18 30 24 24 L30 26 Q40 34 54 36 Q58 38 57 44 H8Z" /><path {...detail} d="M8 44 H57 M24 26 L22 32 M28 28 L26 34 M32 30 L30 35" /><path fill="#fafafa" stroke={STROKE} strokeWidth="1.2" d="M8 44 H57 V48 H8Z" /></>;
    case "boot":
      return <><path {...p} d="M16 8 H34 L34 34 Q50 36 54 42 V50 H14Z" /><path {...detail} d="M16 14 H34 M14 50 H54 M20 22 L30 22 M20 28 L30 28" /><path fill="#6b5a50" d="M14 50 H54 V55 H14Z" /></>;
    case "sandal":
      return <><path {...p} d="M8 46 Q8 40 16 40 H52 Q58 40 58 46 Q58 50 52 50 H14 Q8 50 8 46Z" /><path {...detail} d="M22 40 Q28 28 36 40 M40 40 Q44 32 48 40" /></>;
    case "toque":
      return <><path {...p} d="M14 42 Q14 14 32 14 Q50 14 50 42Z" /><path {...p} d="M12 42 H52 V52 H12Z" /><circle {...p} cx="32" cy="11" r="5" /><path {...detail} d="M18 42 V52 M24 42 V52 M30 42 V52 M36 42 V52 M42 42 V52 M48 42 V52" /></>;
    case "cap":
      return <><path {...p} d="M12 40 Q12 18 32 18 Q50 18 52 38 Z" /><path {...p} d="M30 38 Q46 36 60 44 Q46 46 30 42Z" /><path {...detail} d="M32 18 V38" /><circle fill={STROKE} cx="32" cy="18" r="1.6" /></>;
    case "glove":
      return <><path {...p} d="M18 58 V34 Q14 30 12 24 Q11 20 15 20 Q18 22 20 28 V12 Q20 8 24 8 Q28 8 28 12 V10 Q28 6 32 6 Q36 6 36 10 V12 Q36 8 40 8 Q44 8 44 12 V40 Q44 50 40 58Z" /><path {...detail} d="M18 50 H40" /></>;
    case "scarf":
      return <><path {...p} d="M14 16 Q32 26 50 16 L52 24 Q32 34 12 24Z" /><path {...p} d="M36 26 L40 58 L30 58 L28 28Z" /><path {...detail} d="M30 54 V60 M33 54 V60 M36 54 V60 M39 54 V60" /></>;
    case "sock":
      return <><path {...p} d="M22 6 H38 V34 L50 44 Q54 50 48 54 Q44 56 38 52 L24 42 Q22 40 22 36Z" /><path {...detail} d="M22 12 H38 M22 16 H38" /></>;
    case "umbrella":
      return <><path {...p} d="M6 32 Q8 10 32 8 Q56 10 58 32 Q52 28 45 32 Q39 28 32 32 Q25 28 19 32 Q12 28 6 32Z" /><path {...detail} d="M32 8 V52 Q32 58 26 56" /></>;
    case "sunglasses":
      return <><path {...p} d="M8 26 H28 Q28 40 18 40 Q8 40 8 26Z" /><path {...p} d="M36 26 H56 Q56 40 46 40 Q36 40 36 26Z" /><path {...detail} d="M28 28 Q32 25 36 28 M8 26 L4 22 M56 26 L60 22" /></>;
    default:
      return <rect {...p} x="14" y="14" width="36" height="36" rx="8" />;
  }
}

export default function GarmentArt({ item, size = 64 }: { item: ClothingItem; size?: number }) {
  if (item.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="garment-photo" src={item.photo} alt={item.name} style={{ width: size, height: size }} />;
  }
  return (
    <svg className="garment-art" viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={item.name}>
      <Art shape={shapeFor(item)} fill={fillFor(item)} />
    </svg>
  );
}
