// Rule-based outfit engine. It only ever picks clothes the user owns and has marked
// available, scores every sensible layering combination against the day's needs,
// and states plainly when the best available combination falls short.

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
  text: string;
  /** Wardrobe gap this limitation points to (see gaps.ts). */
  gapKey?: string;
}

export interface OutfitRecommendation {
  title: string;
  picks: OutfitPick[];
  torsoWarmth: number;
  torsoTarget: number;
  status: OutfitStatus;
  limitations: Limitation[];
  improvisations: string[];
  dayPlan: string[];
  summary: string;
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

function combos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  const out: T[][] = [];
  arr.forEach((x, i) => {
    for (const rest of combos(arr.slice(i + 1), k - 1)) out.push([x, ...rest]);
  });
  return out;
}

interface TorsoCombo {
  layers: ClothingItem[];
  effective: number;
  raw: number;
  score: number;
  deficit: number;
}

function evaluateTorso(
  layers: ClothingItem[],
  target: number,
  a: DayAnalysis,
  prefs: Preferences,
  routine: Routine,
  umbrella: boolean,
): TorsoCombo {
  const raw = layers.reduce((s, i) => s + i.warmth, 0);
  const maxWind = Math.max(0, ...layers.map((i) => i.windResistance));
  const outerWater = Math.max(0, ...layers.filter((i) => i.category === "outer").map((i) => i.waterResistance));
  let penalty = 0;
  if (a.needsWindProtection || a.maxWind >= 20) {
    if (maxWind === 0) penalty += a.maxWind >= 40 ? 2 : 1;
    else if (maxWind === 1 && a.maxWind >= 40) penalty += 1;
  }
  // Rain soaking through non-water-resistant layers removes insulation.
  if (a.needsRainProtection && outerWater === 0 && !umbrella && target >= 3) penalty += 1;
  const effective = Math.max(0, raw - penalty);
  const deficit = Math.max(0, target - effective);
  const surplus = Math.max(0, effective - target);
  const bulk = prefs.dislikesBulk ? 2 : 1;

  let score = -5 * deficit - surplus * (prefs.dislikesBulk ? 1.5 : 1) - (layers.length - 1) * 0.35 * bulk;
  if ((a.needsWindProtection || a.coldestFeelsLike < 0) && maxWind === 2) score += 1.5;
  if (a.needsRainProtection && outerWater >= 1) score += 2;
  if (a.needsRainProtection && outerWater === 2) score += 0.5;
  // In heated buildings, warmth should live in layers you take off at the door.
  const base = layers.filter((i) => i.category === "base");
  if (routine.indoorEnvironment === "heated" && base.some(isThermal) && target < 8) score -= 1;
  if (base.length === 0) score -= 3;
  if (base.length === 2 && !base.some(isThermal)) score -= 2;
  return { layers, effective, raw, score, deficit };
}

function bestTorso(
  wardrobe: ClothingItem[],
  target: number,
  a: DayAnalysis,
  prefs: Preferences,
  routine: Routine,
  umbrella: boolean,
  exclude: Set<string>,
): TorsoCombo | undefined {
  const pool = wardrobe.filter((i) => !exclude.has(i.id));
  const bases = pool.filter((i) => i.category === "base");
  const mids = pool.filter((i) => i.category === "mid");
  const outers = pool.filter((i) => i.category === "outer");

  const baseSets: ClothingItem[][] = [...combos(bases, 1), ...combos(bases, 2).filter((c) => c.some(isThermal))];
  if (baseSets.length === 0) baseSets.push([]);
  const midSets = [[], ...combos(mids, 1), ...combos(mids, 2).filter((c) => c.every((i) => i.layerable))];
  const outerSets: ClothingItem[][] = [[], ...combos(outers, 1)];
  // A thin windproof shell over another jacket is a legitimate improvised layer.
  for (const pair of combos(outers, 2)) if (pair.some(isShell)) outerSets.push(pair);

  let best: TorsoCombo | undefined;
  for (const b of baseSets)
    for (const m of midSets)
      for (const o of outerSets) {
        const c = evaluateTorso([...b, ...m, ...o], target, a, prefs, routine, umbrella);
        if (!best || c.score > best.score || (c.score === best.score && c.layers.length < best.layers.length)) best = c;
      }
  return best;
}

function pickBest(items: ClothingItem[], score: (i: ClothingItem) => number): ClothingItem | undefined {
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

const slotFor = (i: ClothingItem, outerCount: number, idx: number): string => {
  switch (i.category) {
    case "base": return isThermal(i) ? "Base layer (thermal)" : "Base layer";
    case "mid": return "Mid layer";
    case "outer": return outerCount > 1 ? (isShell(i) ? "Outer shell" : "Insulating jacket") : idx >= 0 ? "Outer layer" : "Outer layer";
    default: return i.category;
  }
};

const fmt = (n: number) => `${Math.round(n)}°C`;
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Build one recommendation, excluding some items (used for alternatives). */
function buildOutfit(
  wardrobeAll: ClothingItem[],
  a: DayAnalysis,
  prefs: Preferences,
  routine: Routine,
  exclude: Set<string>,
  title: string,
): OutfitRecommendation | undefined {
  const wardrobe = wardrobeAll.filter((i) => i.available);
  const t = a.dressingTemp;
  const target = torsoTarget(t);
  const picks: OutfitPick[] = [];
  const limitations: Limitation[] = [];
  const improvisations: string[] = [];

  const umbrella = wardrobe.find((i) => i.category === "accessory" && has(i, "umbrella"));
  const torso = bestTorso(wardrobe, target, a, prefs, routine, Boolean(umbrella), exclude);
  if (!torso) return undefined;
  const outers = torso.layers.filter((i) => i.category === "outer");
  for (const i of torso.layers) {
    let reason = `Warmth ${i.warmth}/5`;
    if (i.category === "outer" && i.windResistance === 2) reason += ", blocks wind";
    if (i.category === "outer" && i.waterResistance >= 1) reason += i.waterResistance === 2 ? ", waterproof" : ", sheds light rain";
    if (i.category === "base" && isThermal(i)) reason = "Thin thermal traps heat without bulk";
    if (i.category === "mid") reason = `Insulation you can take off indoors (warmth ${i.warmth}/5)`;
    picks.push({ slot: slotFor(i, outers.length, 0), item: i, reason });
  }

  // Legs
  const lt = legsTarget(t);
  const bottoms = wardrobe.filter((i) => i.category === "bottom");
  const outerBottoms = bottoms.filter((i) => !i.layerable || !has(i, "legging", "thermal", "tights", "long john"));
  const underBottoms = bottoms.filter((i) => i.layerable && has(i, "legging", "thermal", "tights", "long john"));
  const mainBottom = pickBest(outerBottoms.length ? outerBottoms : bottoms, (i) => {
    const d = Math.abs(i.warmth - lt) * 2 + (i.warmth < lt ? 2 : 0);
    let s = -d;
    if (a.needsRainProtection && i.waterResistance > 0) s += 0.5;
    if (t >= 20 && has(i, "shorts", "skirt")) s += 1;
    return s;
  });
  let legWarmth = 0;
  if (mainBottom) {
    picks.push({ slot: "Bottoms", item: mainBottom, reason: `Warmth ${mainBottom.warmth}/5 for legs` });
    legWarmth = mainBottom.warmth;
    if (legWarmth < lt) {
      const under = pickBest(underBottoms.filter((i) => i.id !== mainBottom.id), (i) => i.warmth);
      if (under) {
        picks.push({ slot: "Under layer (legs)", item: under, reason: `Worn underneath ${mainBottom.name} for extra warmth` });
        legWarmth += under.warmth;
      }
    }
    if (legWarmth < lt) {
      limitations.push({
        severity: lt - legWarmth >= 2 ? "warning" : "caution",
        text: `Your legs will feel the cold: best available leg warmth is ${legWarmth} vs ${lt} recommended.`,
        gapKey: "thermal-bottoms",
      });
      improvisations.push(
        has(mainBottom, "skirt", "dress", "shorts")
          ? "Swap to long pants if you can, or add tights/leggings underneath."
          : "Leggings or pyjama-style pants under your regular pants add a surprising amount of warmth.",
      );
    }
  } else {
    limitations.push({ severity: "caution", text: "No bottoms marked available in your wardrobe." });
  }

  // Feet
  const ft = feetTarget(t);
  const needWaterFeet = a.snowExpected ? 2 : a.needsRainProtection ? 1 : 0;
  const shoes = wardrobe.filter((i) => i.category === "footwear");
  const socks = wardrobe.filter((i) => i.category === "accessory" && has(i, "sock"));
  const warmSocks = pickBest(socks, (i) => i.warmth);
  const shoe = pickBest(shoes, (i) => {
    let s = -Math.abs(i.warmth - ft) * 1.5 - (i.warmth < ft ? 2 : 0);
    if (i.waterResistance >= needWaterFeet) s += 2;
    else s -= (needWaterFeet - i.waterResistance) * 2;
    if (t > 22 && has(i, "sandal")) s += 1;
    if (t < 10 && has(i, "sandal")) s -= 5;
    return s;
  });
  if (shoe) {
    picks.push({ slot: "Footwear", item: shoe, reason: shoe.waterResistance >= 2 ? "Waterproof, keeps feet dry" : `Warmth ${shoe.warmth}/5` });
    let feetWarmth = shoe.warmth;
    if (warmSocks && ft >= 1) {
      picks.push({ slot: "Socks", item: warmSocks, reason: "Warm socks make a big difference in cold shoes" });
      feetWarmth += 1;
    }
    if (feetWarmth < ft) {
      limitations.push({
        severity: ft - feetWarmth >= 2 ? "warning" : "caution",
        text: `${shoe.name} won't keep your feet very warm today (feels like ${fmt(a.coldestFeelsLike)}).`,
        gapKey: "winter-boots",
      });
      improvisations.push("Wear two pairs of socks if your shoes fit, ideally wool or a thick pair on the outside.");
    }
    if (shoe.waterResistance < needWaterFeet) {
      limitations.push({
        severity: a.snowExpected && t < 0 ? "warning" : "caution",
        text: a.snowExpected
          ? `${shoe.name} will let in snow and slush. Wet feet get cold fast.`
          : `${shoe.name} aren't water resistant, so puddles will soak through.`,
        gapKey: a.snowExpected ? "winter-boots" : "rain-jacket",
      });
      improvisations.push("Pack a dry pair of socks in your bag to change into once you're indoors.");
    }
  } else {
    limitations.push({ severity: "caution", text: "No footwear marked available in your wardrobe." });
  }

  // Head, hands, neck
  const windyCold = t <= 3 && a.needsWindProtection;
  const needHead = t <= 0 || windyCold;
  const needHands = t <= 0 || windyCold;
  const needNeck = t <= -8;
  const hoodAvailable = torso.layers.find(hasHood);
  const hats = wardrobe.filter((i) => i.category === "head");
  const warmHat = pickBest(hats.filter((i) => i.warmth >= 1), (i) => i.warmth);
  if (needHead) {
    if (warmHat) picks.push({ slot: "Head", item: warmHat, reason: "You lose a lot of heat through your head" });
    else {
      limitations.push({
        severity: t <= -15 ? "warning" : "caution",
        text: hoodAvailable ? `No warm hat. Use the hood on your ${hoodAvailable.name} instead.` : "No warm hat, and nothing with a hood today. Your ears are at risk in the cold.",
        gapKey: "toque",
      });
      if (hoodAvailable) improvisations.push(`Put up the hood on your ${hoodAvailable.name} and pull it snug.`);
      else improvisations.push("If you have a hoodie, wear it as your mid layer so you have a hood.");
    }
  } else if (a.needsSunProtection) {
    const cap = hats.find((i) => has(i, "cap", "sun hat"));
    if (cap) picks.push({ slot: "Head", item: cap, reason: "Shade from strong UV" });
  }
  const gloves = pickBest(wardrobe.filter((i) => i.category === "hands"), (i) => i.warmth);
  if (needHands) {
    if (gloves) {
      picks.push({ slot: "Hands", item: gloves, reason: gloves.warmth >= 3 ? "Insulated, good for long waits" : "Keeps hands covered" });
      if (t <= -15 && gloves.warmth < 3) {
        limitations.push({ severity: "caution", text: `${gloves.name} are thin for this cold. Fingers may go numb on long waits.`, gapKey: "mittens" });
        improvisations.push("Keep your hands in your pockets with your gloves on, and make fists inside the gloves to warm your fingers.");
      }
    } else {
      limitations.push({ severity: t <= -15 ? "warning" : "caution", text: "No gloves or mittens. Hands get painfully cold quickly below 0°C.", gapKey: "mittens" });
      improvisations.push("Pull your sleeves over your hands and keep them in your pockets. A pair of socks over your hands works in a pinch.");
    }
  }
  if (needNeck) {
    const scarf = pickBest(wardrobe.filter((i) => i.category === "neck"), (i) => i.warmth + i.windResistance);
    if (scarf) picks.push({ slot: "Neck", item: scarf, reason: "Seals the gap at your collar and can cover your face" });
    else {
      limitations.push({ severity: "info", text: "No scarf. Cold air gets in at your collar.", gapKey: "scarf" });
      improvisations.push("Zip your jacket all the way up, or wear a turtleneck or hoodie so your neck is covered.");
    }
  }
  if (a.needsRainProtection && umbrella && !outers.some((o) => o.waterResistance >= 1) && !a.needsWindProtection) {
    picks.push({ slot: "Carry", item: umbrella, reason: `${Math.round(a.maxPrecipProbability)}% chance of rain` });
  }
  if (a.needsSunProtection) {
    const glasses = wardrobe.find((i) => has(i, "sunglass"));
    if (glasses) picks.push({ slot: "Carry", item: glasses, reason: `UV index up to ${Math.round(a.maxUv)}` });
  }

  // Torso shortfall and improvisation.
  const deficit = torso.deficit;
  const warmestOuter = Math.max(0, ...wardrobe.filter((i) => i.category === "outer").map((i) => i.warmth));
  const hasWindproof = torso.layers.some((i) => i.windResistance === 2);
  if (deficit > 0) {
    limitations.unshift({
      severity: deficit >= 4 ? "danger" : deficit >= 2 ? "warning" : "caution",
      text: `This is the warmest combination you have, but it's still about ${deficit} level${deficit > 1 ? "s" : ""} short of what feels-like ${fmt(a.coldestFeelsLike)} calls for${a.longestExposureMinutes >= 15 ? ` over ${a.longestExposureMinutes} minutes outside` : ""}.`,
      gapKey: warmestOuter < 4 ? "winter-coat" : "warm-mid",
    });
    if (!hasWindproof && a.coldestFeelsLike < 5) {
      improvisations.push("Wind is what makes cold unbearable. If you have any rain jacket or windbreaker, wear it as your top layer over your sweaters.");
    }
    improvisations.push("Layer several thin tops instead of one thick one. Trapped air between layers is what keeps you warm.");
    if (a.segments.some((s) => s.label.includes("commute")) && routine.commuteMode === "transit") {
      improvisations.push("Check the transit app and wait inside a shelter or nearby building until your bus is close.");
    }
  } else if (target >= 6 && torso.layers.some(isShell)) {
    improvisations.push("Your shell is doing the job of a winter coat's outer fabric here: it blocks the wind so your sweater layers can hold heat.");
  }

  let status: OutfitStatus = "good";
  if (deficit >= 4) status = "needs-gear";
  else if (deficit >= 2) status = "limited";
  else if (deficit === 1 || limitations.some((l) => l.severity === "warning" || l.severity === "caution")) status = "workaround";
  // Explicit safety rule: in severe cold, improvisation is not a substitute for proper winter gear.
  const severeCold = a.coldestFeelsLike <= -27;
  const missingCore = warmestOuter < 4 || !gloves || !warmHat;
  if (severeCold && missingCore) {
    status = "needs-gear";
    limitations.unshift({
      severity: "danger",
      text: `Feels like ${fmt(a.coldestFeelsLike)} is frostbite weather. Improvised layers aren't enough here: keep outdoor time very short, cover all skin, and treat an insulated coat, hat and mitts as essential.`,
      gapKey: warmestOuter < 4 ? "winter-coat" : !gloves ? "mittens" : "toque",
    });
  }

  // Day plan: transitions between indoor and outdoor parts of the day.
  const dayPlan: string[] = [];
  const removable = torso.layers.filter((i) => i.category === "outer" || i.category === "mid").map((i) => i.name);
  for (const s of a.segments) {
    dayPlan.push(`${s.label} (${String(s.hour).padStart(2, "0")}:00, ~${s.minutes} min): feels like ${fmt(s.effectiveFeelsLike)}${s.weather.precipitationProbability >= 40 ? `, ${Math.round(s.weather.precipitationProbability)}% chance of ${s.weather.snowfall > 0 ? "snow" : "rain"}` : ""}.`);
  }
  if (routine.indoorEnvironment === "heated" && removable.length) {
    dayPlan.push(`Indoors: take off your ${listJoin(removable)} so you don't overheat, then put ${removable.length > 1 ? "them" : "it"} back on before heading out.`);
  } else if (routine.indoorEnvironment === "air-conditioned") {
    const mid = torso.layers.find((i) => i.category === "mid");
    dayPlan.push(mid ? `Indoors: keep your ${mid.name} handy, air conditioning can feel chilly.` : "Indoors: air conditioning can be chilly; a light sweater in your bag helps.");
  }
  const carry = [...torso.layers]
    .filter((i) => i.category === "mid" || (i.category === "outer" && !(a.needsRainProtection && i.waterResistance > 0)))
    .sort((x, y) => y.warmth - x.warmth)[0];
  if (a.warmestFeelsLike - a.coldestFeelsLike >= 6 && carry) {
    dayPlan.push(`It warms up by about ${Math.round(a.warmestFeelsLike - a.coldestFeelsLike)}° between your coldest and warmest time outside, so you can take off your ${carry.name} and carry it later in the day.`);
  }

  const statusText: Record<OutfitStatus, string> = {
    good: "This outfit covers today's conditions.",
    workaround: "This works with a few compromises.",
    limited: "This is your best option, but it has real limitations today.",
    "needs-gear": "Your current wardrobe can't safely cover these conditions.",
  };
  const pieces = picks.map((p) => p.item.name);
  const summary = `${statusText[status]} Dressing for feels-like ${fmt(a.coldestFeelsLike)}${a.longestExposureMinutes ? ` with up to ${a.longestExposureMinutes} minutes outside at once` : ""}: ${pieces.join(", ")}. Torso warmth ${torso.effective} vs ${target} recommended${torso.effective !== torso.raw ? ` (reduced from ${torso.raw} for wind or rain)` : ""}.`;

  return { title, picks, torsoWarmth: torso.effective, torsoTarget: target, status, limitations, improvisations: [...new Set(improvisations)], dayPlan, summary };
}

/** Recommend today's outfit plus up to two alternatives from the user's own wardrobe. */
export function recommendOutfits(wardrobe: ClothingItem[], a: DayAnalysis, prefs: Preferences, routine: Routine): OutfitResult | undefined {
  const primary = buildOutfit(wardrobe, a, prefs, routine, new Set(), "Today's best outfit");
  if (!primary) return undefined;
  const alternatives: OutfitRecommendation[] = [];
  // Compare by garment type so swapping a white t-shirt for a black one is not an "alternative".
  const signature = (r: OutfitRecommendation) => r.picks.map((p) => `${p.item.category}:${p.item.subtype}`).sort().join("|");
  const seen = new Set([signature(primary)]);
  const primaryOuter = primary.picks.filter((p) => p.item.category === "outer").map((p) => p.item);
  const primaryMid = primary.picks.filter((p) => p.item.category === "mid").map((p) => p.item);
  const tries: [Set<string>, string][] = [];
  if (primaryOuter.length) tries.push([new Set(primaryOuter.map((i) => i.id)), `Without your ${primaryOuter.map((i) => i.name).join(" + ")}`]);
  if (primaryMid.length) tries.push([new Set(primaryMid.map((i) => i.id)), `Swap the ${primaryMid.map((i) => i.name).join(" + ")}`]);
  const primaryBase = primary.picks.filter((p) => p.item.category === "base").map((p) => p.item);
  if (primaryBase.length) tries.push([new Set(primaryBase.map((i) => i.id)), "Different base layer"]);
  for (const [ex, title] of tries) {
    if (alternatives.length >= 2) break;
    const alt = buildOutfit(wardrobe, a, prefs, routine, ex, title);
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
