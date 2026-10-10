// Rule-based outfit engine for every season. It only picks clothes the user owns
// and has marked available, scores every sensible layering combination against
// the day's cold, heat, rain, wind and sun, and states plainly when the best
// available combination falls short, with a workaround for each gap.

import type { ClothingItem, Preferences, Routine } from "./types";
import type { DayAnalysis } from "./weather";

export type OutfitStatus = "good" | "workaround" | "limited" | "needs-gear";

export interface OutfitPick {
  slot: string;
  item: ClothingItem;
  reason: string;
}

export interface Limitation {
  severity: "info" | "caution" | "warning" | "danger";
  /** What's missing or not ideal, in a few words. */
  text: string;
  /** How to make do with what the user owns. */
  workaround?: string;
  /** Wardrobe gap this limitation points to (see gaps.ts). */
  gapKey?: string;
}

export interface OutfitRecommendation {
  title: string;
  picks: OutfitPick[];
  torsoWarmth: number;
  torsoTarget: number;
  status: OutfitStatus;
  /** One short sentence for the dashboard. */
  headline: string;
  /** Short reasons this outfit works (shown on demand). */
  why: string[];
  limitations: Limitation[];
  /** Short tips for changes through the day. */
  dayPlan: string[];
}

export interface OutfitResult {
  primary: OutfitRecommendation;
  alternatives: OutfitRecommendation[];
}

/** Torso insulation target (sum of layer warmth) for a personal dressing temperature. */
export function torsoTarget(dressingTemp: number): number {
  const steps: [number, number][] = [
    [22, 1], [17, 2], [12, 3], [7, 4], [2, 5], [-3, 6], [-8, 7], [-13, 8], [-20, 9], [-28, 10],
  ];
  for (const [t, w] of steps) if (dressingTemp >= t) return w;
  return 11;
}

export function legsTarget(t: number): number {
  if (t >= 15) return 0;
  if (t >= -8) return 1;
  if (t >= -18) return 2;
  return 3;
}

export function feetTarget(t: number): number {
  if (t >= 10) return 0;
  if (t >= -5) return 1;
  if (t >= -15) return 2;
  return 3;
}

const has = (i: ClothingItem, ...words: string[]) => {
  const s = `${i.subtype} ${i.name}`.toLowerCase();
  return words.some((w) => s.includes(w));
};
const isThermal = (i: ClothingItem) => has(i, "thermal", "base layer", "merino", "heattech", "long john", "long underwear");
const isShell = (i: ClothingItem) => i.category === "outer" && i.windResistance === 2 && i.warmth <= 1;
const hasHood = (i: ClothingItem) => has(i, "hood", "parka", "rain jacket", "raincoat");
const isLightBottom = (i: ClothingItem) => has(i, "short", "skirt", "dress", "linen");
const isShortSleeve = (i: ClothingItem) => has(i, "t-shirt", "tee", "tank", "short sleeve", "polo");
const TORSO = new Set(["base", "mid", "outer"]);

function combos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  const out: T[][] = [];
  arr.forEach((x, i) => {
    for (const rest of combos(arr.slice(i + 1), k - 1)) out.push([x, ...rest]);
  });
  return out;
}

interface Ctx {
  a: DayAnalysis;
  prefs: Preferences;
  routine?: Routine;
  umbrella: boolean;
  hot: boolean; // hottest part of the day calls for light clothing
  warm: boolean;
}

interface TorsoCombo {
  layers: ClothingItem[];
  effective: number;
  raw: number;
  score: number;
  deficit: number;
}

function evaluateTorso(layers: ClothingItem[], target: number, c: Ctx): TorsoCombo {
  const { a, prefs } = c;
  const raw = layers.reduce((s, i) => s + i.warmth, 0);
  const maxWind = Math.max(0, ...layers.map((i) => i.windResistance));
  const outerWater = Math.max(0, ...layers.filter((i) => i.category === "outer").map((i) => i.waterResistance));
  let penalty = 0;
  if (a.coldestFeelsLike < 15 && (a.needsWindProtection || a.maxWind >= 20)) {
    if (maxWind === 0) penalty += a.maxWind >= 40 ? 2 : 1;
    else if (maxWind === 1 && a.maxWind >= 40) penalty += 1;
  }
  // Rain soaking through non-water-resistant layers removes insulation.
  if (a.needsRainProtection && outerWater === 0 && !c.umbrella && target >= 3) penalty += 1;
  const effective = Math.max(0, raw - penalty);
  const deficit = Math.max(0, target - effective);
  const surplus = Math.max(0, effective - target);
  const bulk = prefs.dislikesBulk ? 2 : 1;
  const base = layers.filter((i) => i.category === "base");

  let score = -5 * deficit - surplus * (prefs.dislikesBulk || prefs.sweatsEasily ? 1.5 : 1) - (layers.length - 1) * 0.35 * bulk;
  if ((a.needsWindProtection || a.coldestFeelsLike < 0) && maxWind === 2) score += 1.5;
  if (a.needsRainProtection && outerWater >= 1) score += 2;
  if (a.needsRainProtection && outerWater === 2) score += 0.5;
  // Heat: the base layer stays on all day, so keep it light.
  if (c.hot) {
    for (const b of base) score += isShortSleeve(b) ? 1 : -1 - b.warmth;
  } else if (c.warm) {
    for (const b of base) if (isThermal(b)) score -= 2;
  }
  // In heated buildings, warmth should live in layers you take off at the door.
  if (c.routine?.indoorEnvironment === "heated" && base.some(isThermal) && target < 8) score -= 1;
  if (base.length === 0) score -= 3;
  if (base.length === 2 && !base.some(isThermal)) score -= 2;
  return { layers, effective, raw, score, deficit };
}

function bestTorso(wardrobe: ClothingItem[], target: number, c: Ctx, exclude: Set<string>, pinned?: ClothingItem): TorsoCombo | undefined {
  const pool = wardrobe.filter((i) => !exclude.has(i.id) || i.id === pinned?.id);
  const bases = pool.filter((i) => i.category === "base");
  const mids = pool.filter((i) => i.category === "mid");
  const outers = pool.filter((i) => i.category === "outer");

  const baseSets: ClothingItem[][] = [...combos(bases, 1), ...combos(bases, 2).filter((s) => s.some(isThermal))];
  if (baseSets.length === 0) baseSets.push([]);
  const midSets = [[], ...combos(mids, 1), ...combos(mids, 2).filter((s) => s.every((i) => i.layerable))];
  const outerSets: ClothingItem[][] = [[], ...combos(outers, 1)];
  // A thin windproof shell over another jacket is a legitimate improvised layer.
  for (const pair of combos(outers, 2)) if (pair.some(isShell)) outerSets.push(pair);

  let best: TorsoCombo | undefined;
  for (const b of baseSets)
    for (const m of midSets)
      for (const o of outerSets) {
        const layers = [...b, ...m, ...o];
        if (pinned && TORSO.has(pinned.category) && !layers.some((l) => l.id === pinned.id)) continue;
        const r = evaluateTorso(layers, target, c);
        if (!best || r.score > best.score || (r.score === best.score && r.layers.length < best.layers.length)) best = r;
      }
  return best;
}

function pickBest(items: ClothingItem[], score: (i: ClothingItem) => number, pinned?: ClothingItem): ClothingItem | undefined {
  if (pinned && items.some((i) => i.id === pinned.id)) return pinned;
  let best: ClothingItem | undefined;
  let bs = -Infinity;
  for (const i of items) {
    const s = score(i);
    if (s > bs) {
      bs = s;
      best = i;
    }
  }
  return best;
}

const fmt = (n: number) => `${Math.round(n)}°C`;
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function buildOutfit(
  wardrobeAll: ClothingItem[],
  a: DayAnalysis,
  prefs: Preferences,
  routine: Routine | undefined,
  exclude: Set<string>,
  title: string,
  pinnedId?: string,
): OutfitRecommendation | undefined {
  const wardrobe = wardrobeAll.filter((i) => i.available);
  const pinned = wardrobe.find((i) => i.id === pinnedId);
  const t = a.dressingTemp;
  const hot = a.heatTemp >= 27;
  const warm = a.heatTemp >= 22;
  // On a hot day with a mild morning, a single light top is enough; extra layers just get carried.
  const target = hot && t >= 17 ? 1 : torsoTarget(t);
  const picks: OutfitPick[] = [];
  const limitations: Limitation[] = [];
  const why: string[] = [];

  const umbrella = wardrobe.find((i) => i.category === "accessory" && has(i, "umbrella"));
  const c: Ctx = { a, prefs, routine, umbrella: Boolean(umbrella), hot, warm };
  const torso = bestTorso(wardrobe, target, c, exclude, pinned);
  if (!torso) return undefined;
  const outers = torso.layers.filter((i) => i.category === "outer");
  for (const i of torso.layers) {
    let reason = `Warmth ${i.warmth}/5`;
    let slot = i.category === "base" ? "Top" : i.category === "mid" ? "Layer" : "Jacket";
    if (i.category === "base" && isThermal(i)) reason = "Thin thermal, warm without bulk";
    else if (i.category === "base" && hot) reason = "Light and breathable";
    if (i.category === "mid") reason = "Easy to take off when it warms up";
    if (i.category === "outer") {
      const bits = [i.windResistance === 2 && "blocks wind", i.waterResistance === 2 ? "waterproof" : i.waterResistance === 1 && "sheds light rain"].filter(Boolean);
      reason = bits.length ? `Warmth ${i.warmth}/5, ${bits.join(", ")}` : reason;
      if (outers.length > 1) slot = isShell(i) ? "Shell" : "Jacket";
    }
    picks.push({ slot, item: i, reason });
  }

  // Legs
  const lt = legsTarget(t);
  const bottoms = wardrobe.filter((i) => i.category === "bottom");
  const isUnder = (i: ClothingItem) => i.layerable && has(i, "legging", "thermal", "tights", "long john");
  const outerBottoms = bottoms.filter((i) => !isUnder(i));
  const mainBottom = pickBest(outerBottoms.length ? outerBottoms : bottoms, (i) => {
    let s = -Math.abs(i.warmth - lt) * 2 - (i.warmth < lt ? 2 : 0);
    if (a.needsRainProtection && i.waterResistance > 0) s += 0.5;
    if (hot && isLightBottom(i)) s += 3;
    if (hot && i.warmth >= 2) s -= 2;
    return s;
  }, pinned);
  if (mainBottom) {
    picks.push({ slot: "Bottoms", item: mainBottom, reason: hot && isLightBottom(mainBottom) ? "Cool for the heat" : `Warmth ${mainBottom.warmth}/5` });
    let legWarmth = mainBottom.warmth;
    if (legWarmth < lt) {
      const under = pickBest(bottoms.filter((i) => isUnder(i) && i.id !== mainBottom.id), (i) => i.warmth);
      if (under) {
        picks.push({ slot: "Under", item: under, reason: `Under your ${mainBottom.name} for warmth` });
        legWarmth += under.warmth;
      }
    }
    if (legWarmth < lt) {
      limitations.push({
        severity: lt - legWarmth >= 2 ? "warning" : "caution",
        text: "Legs will be cold",
        workaround: isLightBottom(mainBottom) ? "Add tights or leggings underneath." : "Wear leggings or pyjama pants under your pants.",
        gapKey: "thermal-bottoms",
      });
    }
    if (hot && !isLightBottom(mainBottom) && mainBottom.warmth >= 1) {
      limitations.push({ severity: "info", text: `${mainBottom.name} will feel hot`, workaround: "Pick your thinnest, loosest pants and roll up the legs.", gapKey: "summer-bottoms" });
    }
  } else {
    limitations.push({ severity: "caution", text: "No bottoms available", workaround: "Add some to your closet or mark them available." });
  }

  // Feet
  const ft = feetTarget(t);
  const needWaterFeet = a.snowExpected ? 2 : a.needsRainProtection ? 1 : 0;
  const shoes = wardrobe.filter((i) => i.category === "footwear");
  const socks = wardrobe.filter((i) => i.category === "accessory" && has(i, "sock"));
  const shoe = pickBest(shoes, (i) => {
    let s = -Math.abs(i.warmth - ft) * 1.5 - (i.warmth < ft ? 2 : 0);
    if (i.waterResistance >= needWaterFeet) s += 2;
    else s -= (needWaterFeet - i.waterResistance) * 2;
    if (hot && has(i, "sandal")) s += a.needsRainProtection ? 0 : 1.5;
    if (hot && i.warmth >= 3) s -= 3;
    if (t < 12 && has(i, "sandal")) s -= 5;
    return s;
  }, pinned);
  if (shoe) {
    picks.push({ slot: "Shoes", item: shoe, reason: shoe.waterResistance >= 2 && needWaterFeet ? "Keeps feet dry" : hot && has(shoe, "sandal") ? "Cool and airy" : `Warmth ${shoe.warmth}/5` });
    let feetWarmth = shoe.warmth;
    const warmSocks = pickBest(socks, (i) => i.warmth);
    if (warmSocks && ft >= 1) {
      picks.push({ slot: "Socks", item: warmSocks, reason: "Warm feet in cold shoes" });
      feetWarmth += 1;
    }
    if (feetWarmth < ft) {
      limitations.push({ severity: ft - feetWarmth >= 2 ? "warning" : "caution", text: `${shoe.name} are cold for ${fmt(a.coldestFeelsLike)}`, workaround: "Wear two pairs of socks, thick ones on the outside.", gapKey: "winter-boots" });
    }
    if (shoe.waterResistance < needWaterFeet) {
      limitations.push({
        severity: a.snowExpected && t < 0 ? "warning" : "caution",
        text: a.snowExpected ? `${shoe.name} will let in snow and slush` : `${shoe.name} will get wet in puddles`,
        workaround: "Pack a dry pair of socks to change into indoors.",
        gapKey: a.snowExpected ? "winter-boots" : "rain-footwear",
      });
    }
  } else {
    limitations.push({ severity: "caution", text: "No shoes available", workaround: "Add some to your closet or mark them available." });
  }

  // Head, hands, neck
  const windyCold = t <= 3 && a.needsWindProtection;
  const needHead = t <= 0 || windyCold;
  const needHands = t <= 0 || windyCold;
  const needNeck = t <= -8;
  const hoodAvailable = torso.layers.find(hasHood);
  const hats = wardrobe.filter((i) => i.category === "head");
  if (needHead) {
    const warmHat = pickBest(hats.filter((i) => i.warmth >= 1), (i) => i.warmth, pinned);
    if (warmHat) picks.push({ slot: "Hat", item: warmHat, reason: "Keeps your ears warm" });
    else
      limitations.push({
        severity: t <= -15 ? "warning" : "caution",
        text: "No warm hat",
        workaround: hoodAvailable ? `Put up the hood on your ${hoodAvailable.name}.` : "Wear a hoodie as your layer so you have a hood.",
        gapKey: "toque",
      });
  } else if (a.needsSunProtection) {
    const sunHat = pickBest(hats.filter((i) => has(i, "cap", "sun hat", "bucket")), (i) => (has(i, "sun hat", "bucket") ? 1 : 0), pinned);
    if (sunHat) picks.push({ slot: "Hat", item: sunHat, reason: `Shade from UV ${Math.round(a.maxUv)}` });
    else limitations.push({ severity: "info", text: "No sun hat", workaround: "Sunscreen on your face and ears, and stick to shady routes.", gapKey: "sun-hat" });
  }
  if (needHands) {
    const gloves = pickBest(wardrobe.filter((i) => i.category === "hands"), (i) => i.warmth, pinned);
    if (gloves) {
      picks.push({ slot: "Gloves", item: gloves, reason: gloves.warmth >= 3 ? "Insulated for long waits" : "Keeps hands covered" });
      if (t <= -15 && gloves.warmth < 3) limitations.push({ severity: "caution", text: `${gloves.name} are thin for this cold`, workaround: "Keep gloved hands in your pockets.", gapKey: "mittens" });
    } else {
      limitations.push({ severity: t <= -15 ? "warning" : "caution", text: "No gloves", workaround: "Sleeves over your hands, hands in pockets. Socks work as mitts in a pinch.", gapKey: "mittens" });
    }
  }
  if (needNeck) {
    const scarf = pickBest(wardrobe.filter((i) => i.category === "neck"), (i) => i.warmth + i.windResistance, pinned);
    if (scarf) picks.push({ slot: "Scarf", item: scarf, reason: "Blocks cold air at your collar" });
    else limitations.push({ severity: "info", text: "No scarf", workaround: "Zip your jacket all the way up or wear a turtleneck.", gapKey: "scarf" });
  }

  // Rain gear
  const waterproofOuter = outers.some((o) => o.waterResistance >= 1);
  if (a.needsRainProtection && !waterproofOuter) {
    if (umbrella && a.maxGust < 50 && !a.thunder) picks.push({ slot: "Bring", item: umbrella, reason: `${Math.round(a.maxPrecipProbability)}% chance of rain` });
    else
      limitations.push({
        severity: "caution",
        text: umbrella ? "Too windy for an umbrella" : "Nothing waterproof",
        workaround: hoodAvailable ? `Use the hood on your ${hoodAvailable.name} and avoid suede or canvas shoes.` : "Wear quick-drying layers and pack a spare top.",
        gapKey: "rain-jacket",
      });
  }
  if (a.needsSunProtection) {
    const glasses = wardrobe.find((i) => has(i, "sunglass"));
    if (glasses) picks.push({ slot: "Bring", item: glasses, reason: `UV index ${Math.round(a.maxUv)}` });
  }

  // Pinned item sanity checks.
  if (pinned) {
    if (TORSO.has(pinned.category) && warm && pinned.warmth >= 3) {
      limitations.push({ severity: "info", text: `Your ${pinned.name} will be warm today`, workaround: "Wear it in the morning and carry it once it heats up." });
    }
    if (pinned.category === "footwear" && pinned.waterResistance < needWaterFeet) {
      // already covered by the footwear limitation above
    }
  }

  // Torso shortfall
  const deficit = torso.deficit;
  const warmestOuter = Math.max(0, ...wardrobe.filter((i) => i.category === "outer").map((i) => i.warmth));
  const hasWindproof = torso.layers.some((i) => i.windResistance === 2);
  if (deficit > 0) {
    limitations.unshift({
      severity: deficit >= 4 ? "danger" : deficit >= 2 ? "warning" : "caution",
      text: deficit === 1 ? "A little lighter than ideal" : `Not warm enough for ${fmt(a.coldestFeelsLike)}`,
      workaround: !hasWindproof && a.coldestFeelsLike < 5
        ? "Wear any windbreaker or rain jacket on top of your sweaters. Blocking wind matters most."
        : "Layer several thin tops instead of one thick one, and wait indoors when you can.",
      gapKey: warmestOuter < 4 ? "winter-coat" : "warm-mid",
    });
  } else if (target >= 6 && torso.layers.some(isShell)) {
    why.push("Your shell blocks the wind so the layers underneath stay warm.");
  }

  let status: OutfitStatus = "good";
  if (deficit >= 4) status = "needs-gear";
  else if (deficit >= 2) status = "limited";
  else if (deficit === 1 || limitations.some((l) => l.severity === "warning" || l.severity === "caution")) status = "workaround";
  // Explicit safety rule: in severe cold, improvisation is not a substitute for proper winter gear.
  const severeCold = a.coldestFeelsLike <= -27;
  const missingCore = warmestOuter < 4 || !wardrobe.some((i) => i.category === "hands") || !hats.some((i) => i.warmth >= 1);
  if (severeCold && missingCore) {
    status = "needs-gear";
    limitations.unshift({
      severity: "danger",
      text: `Frostbite weather (${fmt(a.coldestFeelsLike)})`,
      workaround: "Layering can't make up for missing winter gear here. Keep time outside very short and cover all skin.",
      gapKey: warmestOuter < 4 ? "winter-coat" : "mittens",
    });
  }
  // Extreme heat is a safety issue too, but the fix is behaviour, not clothing.
  if (a.hottestFeelsLike >= 40) {
    limitations.push({ severity: "warning", text: "Dangerous heat", workaround: "Stay in shade or indoors in the afternoon and drink water often." });
  }

  // Why it works
  if (hot) why.push(prefs.sweatsEasily ? "Loose, light layers so you don't overheat. A spare top in your bag helps." : "Light, breathable pieces for the heat.");
  else if (a.daySwing >= 6) why.push(`Layers for a ${Math.round(a.daySwing)}° swing between morning and afternoon.`);
  if (a.needsWindProtection && hasWindproof) why.push("Windproof outer layer for today's gusts.");
  if (a.needsRainProtection && waterproofOuter) why.push("Water-resistant on top for the rain.");
  if (why.length === 0) why.push(`Matched to feels-like ${fmt(a.coldestFeelsLike)}${a.hottestFeelsLike - a.coldestFeelsLike >= 3 ? ` to ${fmt(a.hottestFeelsLike)}` : ""}.`);

  // Day plan: transitions between indoor and outdoor parts of the day.
  const dayPlan: string[] = [];
  const removable = torso.layers.filter((i) => i.category === "outer" || i.category === "mid").map((i) => i.name);
  if (routine?.indoorEnvironment === "heated" && removable.length && a.coldestFeelsLike < 12) {
    dayPlan.push(`Take off your ${listJoin(removable)} indoors.`);
  } else if (routine?.indoorEnvironment === "air-conditioned" || (!routine && hot)) {
    const light = torso.layers.find((i) => i.category === "mid" || i.category === "outer");
    dayPlan.push(light ? `Keep your ${light.name} for air-conditioned places.` : "A light layer helps in air-conditioned places.");
  }
  const carry = [...torso.layers]
    .filter((i) => i.category === "mid" || (i.category === "outer" && !(a.needsRainProtection && i.waterResistance > 0)))
    .sort((x, y) => y.warmth - x.warmth)[0];
  if (a.warmestFeelsLike - a.coldestFeelsLike >= 6 && carry && !dayPlan.some((d) => d.includes(carry.name))) {
    dayPlan.push(`Carry your ${carry.name} once it warms up.`);
  }

  const HEADLINES: Record<OutfitStatus, string> = {
    good: "You're set for today.",
    workaround: "Works with a few tweaks.",
    limited: "Your best option, but not quite enough.",
    "needs-gear": "Not safe enough for this weather.",
  };

  return { title, picks, torsoWarmth: torso.effective, torsoTarget: target, status, headline: HEADLINES[status], why, limitations, dayPlan };
}

/** Recommend today's outfit plus up to two alternatives from the user's own wardrobe. */
export function recommendOutfits(
  wardrobe: ClothingItem[],
  a: DayAnalysis,
  prefs: Preferences,
  routine?: Routine,
  pinnedId?: string,
): OutfitResult | undefined {
  const primary = buildOutfit(wardrobe, a, prefs, routine, new Set(), "Best match", pinnedId);
  if (!primary) return undefined;
  const alternatives: OutfitRecommendation[] = [];
  // Compare by garment type so swapping a white t-shirt for a black one is not an "alternative".
  const signature = (r: OutfitRecommendation) => r.picks.map((p) => `${p.item.category}:${p.item.subtype}`).sort().join("|");
  const seen = new Set([signature(primary)]);
  const ofCat = (cat: string) => primary.picks.filter((p) => p.item.category === cat && p.item.id !== pinnedId).map((p) => p.item);
  const tries: [ClothingItem[], string][] = [
    [ofCat("outer"), "Different jacket"],
    [ofCat("mid"), "Different layer"],
    [ofCat("bottom"), "Different bottoms"],
    [ofCat("base"), "Different top"],
  ];
  for (const [items, title] of tries) {
    if (alternatives.length >= 2) break;
    if (!items.length) continue;
    const alt = buildOutfit(wardrobe, a, prefs, routine, new Set(items.map((i) => i.id)), title, pinnedId);
    if (!alt) continue;
    const key = signature(alt);
    if (seen.has(key)) continue;
    // Only offer alternatives that are nearly as warm as the primary.
    if (alt.torsoTarget - alt.torsoWarmth > primary.torsoTarget - primary.torsoWarmth + 1) continue;
    seen.add(key);
    alternatives.push(alt);
  }
  return { primary, alternatives };
}
