// Wardrobe gap detection: compares what the user owns against the needs of a
// Canadian year given their routine. Covered needs are reported as covered,
// so we never recommend buying something an existing item already handles.

import type { ClothingItem, Profile } from "./types";
import type { Forecast } from "./types";

export type GapImportance = "essential" | "recommended" | "optional";

export interface GapNeed {
  key: string;
  label: string;
  why: string;
  /** When this item matters (shown to the user). */
  season: string;
  baseImportance: GapImportance;
  covers: (i: ClothingItem) => boolean;
  /** Partial coverage: a workable but weaker substitute. */
  partial?: (i: ClothingItem) => boolean;
  /** Feels-like (°C) at or below which this item becomes needed. */
  neededBelow?: number;
  /** Feels-like (°C) at or above which this item becomes needed. */
  neededAbove?: number;
  /** UV index at or above which this item becomes needed. */
  uvAbove?: number;
  /** Needed when wet weather is expected. */
  wet?: boolean;
}

export interface WardrobeGap {
  key: string;
  label: string;
  why: string;
  season: string;
  importance: GapImportance;
  priority: number;
  status: "missing" | "partial" | "covered";
  coveredBy: string[];
  partialBy: string[];
  neededThisWeek: boolean;
  workaround?: string;
}

const txt = (i: ClothingItem) => `${i.subtype} ${i.name}`.toLowerCase();

export const NEEDS: GapNeed[] = [
  {
    key: "winter-coat", label: "Insulated winter coat", season: "Nov to Mar",
    why: "Your coat does most of the work against cold and wind. Layering can stretch a lighter jacket into early winter, but not into January.",
    baseImportance: "essential", neededBelow: -5,
    covers: (i) => i.category === "outer" && i.warmth >= 4,
    partial: (i) => i.category === "outer" && i.warmth >= 2,
  },
  {
    key: "winter-boots", label: "Waterproof winter boots", season: "Dec to Mar",
    why: "Snow and salty slush soak through sneakers in minutes, and wet feet get cold fast. Boots with grip also help on ice.",
    baseImportance: "essential", neededBelow: -3,
    covers: (i) => i.category === "footwear" && i.warmth >= 3 && i.waterResistance >= 1,
    partial: (i) => i.category === "footwear" && (i.waterResistance >= 2 || i.warmth >= 2),
  },
  {
    key: "toque", label: "Warm hat (toque)", season: "Nov to Mar",
    why: "Covers your ears, which get frostbite quickly. Cheap and makes a big difference.",
    baseImportance: "essential", neededBelow: 0,
    covers: (i) => i.category === "head" && i.warmth >= 2,
    partial: (i) => (i.category === "mid" || i.category === "outer") && /hood|parka/.test(txt(i)),
  },
  {
    key: "mittens", label: "Insulated gloves or mittens", season: "Nov to Mar",
    why: "Hands go numb fast below 0°C, especially waiting for transit. Mittens are warmer than gloves.",
    baseImportance: "essential", neededBelow: 0,
    covers: (i) => i.category === "hands" && i.warmth >= 3,
    partial: (i) => i.category === "hands",
  },
  {
    key: "scarf", label: "Scarf or neck warmer", season: "Dec to Feb",
    why: "Seals the gap at your collar and can cover your face on the coldest days.",
    baseImportance: "recommended", neededBelow: -8,
    covers: (i) => i.category === "neck",
    partial: (i) => /turtleneck|hood/.test(txt(i)),
  },
  {
    key: "warm-mid", label: "Warm mid layer (fleece or wool sweater)", season: "Oct to Apr",
    why: "A warm layer under your coat that you can take off in heated buildings.",
    baseImportance: "recommended", neededBelow: 8,
    covers: (i) => i.category === "mid" && i.warmth >= 3,
    partial: (i) => i.category === "mid",
  },
  {
    key: "thermal-top", label: "Thermal base layer (top)", season: "Dec to Feb",
    why: "Thin and light, adds real warmth without bulk. Great if you feel cold easily or wait outside a lot.",
    baseImportance: "optional", neededBelow: -12,
    covers: (i) => i.category === "base" && (i.warmth >= 2 || /thermal|merino|heattech/.test(txt(i))),
  },
  {
    key: "thermal-bottoms", label: "Thermal leggings / long underwear", season: "Dec to Feb",
    why: "Jeans alone are cold in wind. A thin layer underneath helps a lot on long commutes.",
    baseImportance: "optional", neededBelow: -12,
    covers: (i) => i.category === "bottom" && i.layerable && i.warmth >= 1,
    partial: (i) => i.category === "bottom" && i.warmth >= 2,
  },
  {
    key: "rain-jacket", label: "Waterproof rain jacket", season: "Apr to Jun, Sep to Nov",
    why: "Spring and fall bring cold rain. A waterproof shell also blocks wind and can go over sweaters in winter.",
    baseImportance: "recommended", wet: true,
    covers: (i) => i.category === "outer" && i.waterResistance >= 2,
    partial: (i) => (i.category === "outer" && i.waterResistance >= 1) || /umbrella/.test(txt(i)),
  },
  {
    key: "wool-socks", label: "Warm wool socks", season: "Nov to Mar",
    why: "Cheap and very effective. Wool stays warm even when a little damp.",
    baseImportance: "recommended", neededBelow: 0,
    covers: (i) => i.category === "accessory" && /sock/.test(txt(i)) && i.warmth >= 2,
  },
  {
    key: "rain-footwear", label: "Water-resistant shoes", season: "Spring and fall",
    why: "Canvas sneakers soak through in rain and puddles. Leather or rubber shoes keep feet dry year-round.",
    baseImportance: "recommended", wet: true,
    covers: (i) => i.category === "footwear" && i.waterResistance >= 1,
  },
  {
    key: "light-layer", label: "Light layer (cardigan or light jacket)", season: "Year-round",
    why: "Spring and fall mornings are cool, and summer air conditioning can be chilly. A light layer covers both.",
    baseImportance: "recommended",
    covers: (i) => (i.category === "mid" || i.category === "outer") && i.warmth <= 2 && i.layerable,
  },
  {
    key: "summer-bottoms", label: "Shorts, skirt or light pants", season: "Jun to Aug",
    why: "Summer in most Canadian cities is hot and humid. Jeans get uncomfortable above about 28°C.",
    baseImportance: "recommended", neededAbove: 26,
    covers: (i) => i.category === "bottom" && /short|skirt|dress|linen/.test(txt(i)),
  },
  {
    key: "sun-hat", label: "Sun hat or cap", season: "May to Sep",
    why: "Summer UV is often 7 or higher. A hat shades your face and keeps you cooler.",
    baseImportance: "optional", uvAbove: 6,
    covers: (i) => i.category === "head" && /cap|sun hat|bucket/.test(txt(i)),
  },
  {
    key: "sunglasses", label: "Sunglasses", season: "Year-round",
    why: "Summer UV is strong, and sun on snow is very bright in winter.",
    baseImportance: "optional",
    covers: (i) => /sunglass/.test(txt(i)),
  },
];

const IMPORTANCE_SCORE: Record<GapImportance, number> = { essential: 60, recommended: 35, optional: 15 };

/** Detect wardrobe gaps, prioritised by importance, exposure and this week's forecast. */
export function detectGaps(wardrobe: ClothingItem[], profile: Profile, forecast?: Forecast): WardrobeGap[] {
  // Without a weekly plan, assume a typical day out on foot or transit (about an hour outside).
  const r = (profile.plans ?? []).find((p) => p.schedule.kind === "weekly");
  const dailyOutdoor = r ? (r.commuteMode === "none" ? 0 : r.commuteOutdoorMinutes * 2) + r.middayOutdoorMinutes + (r.indoorEnvironment === "outdoors-job" ? 240 : 0) : 60;
  const exposedCommute = !r || r.commuteMode === "walk" || r.commuteMode === "transit" || r.commuteMode === "bike";
  const weekMinFeels = forecast ? Math.min(...forecast.daily.map((d) => d.feelsLikeMin)) : Infinity;
  const weekWet = forecast ? forecast.daily.some((d) => d.precipitationProbabilityMax >= 50) : false;
  const weekMaxFeels = forecast ? Math.max(...forecast.daily.map((d) => d.feelsLikeMax)) : -Infinity;
  const weekMaxUv = forecast ? Math.max(...forecast.daily.map((d) => d.uvIndexMax)) : 0;

  const gaps = NEEDS.map((need): WardrobeGap => {
    const coveredBy = wardrobe.filter(need.covers).map((i) => i.name);
    const partialBy = need.partial ? wardrobe.filter((i) => !need.covers(i) && need.partial!(i)).map((i) => i.name) : [];
    const status = coveredBy.length ? "covered" : partialBy.length ? "partial" : "missing";

    let importance = need.baseImportance;
    // Lifestyle adjustments: lots of time outside makes extras essential; driving makes some optional.
    if (need.key === "thermal-top" || need.key === "thermal-bottoms") {
      if (profile.preferences.coldSensitivity >= 1 || dailyOutdoor >= 60) importance = "recommended";
    }
    if (need.key === "winter-boots" && r?.commuteMode === "car" && dailyOutdoor < 20) importance = "recommended";
    if (need.key === "scarf" && (dailyOutdoor >= 40 || profile.preferences.coldSensitivity >= 1)) importance = "essential";

    const neededThisWeek = Boolean(
      (need.neededBelow !== undefined && weekMinFeels <= need.neededBelow) ||
      (need.neededAbove !== undefined && weekMaxFeels >= need.neededAbove) ||
      (need.uvAbove !== undefined && weekMaxUv >= need.uvAbove) ||
      (need.wet && weekWet),
    );
    if (need.key === "sun-hat" && profile.preferences.sunSensitive) importance = "recommended";

    let priority = IMPORTANCE_SCORE[importance];
    priority += Math.min(20, dailyOutdoor / 6);
    if (exposedCommute && ["winter-coat", "winter-boots", "mittens", "toque"].includes(need.key)) priority += 8;
    if (neededThisWeek) priority += 15;
    if (status === "partial") priority -= 12;
    priority += profile.preferences.coldSensitivity * 2;
    if (status === "covered") priority = 0;

    let workaround: string | undefined;
    if (status === "partial") workaround = `You can get by for now with your ${partialBy.slice(0, 2).join(" or ")}.`;
    else if (status === "missing") {
      const wk: Record<string, string> = {
        "winter-coat": "Until then, wear your warmest sweater under a windproof jacket. This is fine into late fall, but not for deep winter.",
        "winter-boots": "Wear wool socks and pack a dry pair. This won't keep slush out.",
        toque: "Use a hood if you have one.",
        mittens: "Keep hands in pockets and pull sleeves over them.",
        scarf: "Zip your jacket all the way up or wear a hoodie.",
        "warm-mid": "Layer two thinner tops instead.",
        "rain-jacket": "Use an umbrella when it isn't windy.",
        "rain-footwear": "Pack dry socks on rainy days.",
        "summer-bottoms": "Wear your thinnest pants and roll them up.",
        "sun-hat": "Sunscreen and shady routes.",
        "light-layer": "Carry a long-sleeve shirt.",
      };
      workaround = wk[need.key];
    }

    return { key: need.key, label: need.label, why: need.why, season: need.season, importance, priority: Math.round(priority), status, coveredBy, partialBy, neededThisWeek, workaround };
  });

  return gaps.sort((a, b) => b.priority - a.priority);
}

export interface WishlistVerdict {
  wish: string;
  gap?: WardrobeGap;
  verdict: "fills-gap" | "already-covered" | "nice-to-have";
  note: string;
}

/** Check a wished-for item against the wardrobe: does it fill a real gap, or do you already own something that does the job? */
export function evaluateWish(wish: string, gaps: WardrobeGap[], toItem: (w: string) => ClothingItem | undefined): WishlistVerdict {
  const item = toItem(wish);
  const need = item ? NEEDS.find((n) => n.covers(item)) : undefined;
  const gap = need ? gaps.find((g) => g.key === need.key) : undefined;
  if (!gap) return { wish, verdict: "nice-to-have", note: "Doesn't fill a weather gap, so buy it whenever you like." };
  if (gap.status === "covered") return { wish, gap, verdict: "already-covered", note: `Your ${gap.coveredBy[0]} already does this job.` };
  return { wish, gap, verdict: "fills-gap", note: `Fills ${gap.importance === "essential" ? "an" : "a"} ${gap.importance} gap: ${gap.label.toLowerCase()}.` };
}
