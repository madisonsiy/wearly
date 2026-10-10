import { describe, expect, it } from "vitest";
import { analyzeDay, windChill, frostbiteRisk, parseOpenMeteo, activePlan } from "@/lib/weather";
import { recommendOutfits, torsoTarget } from "@/lib/outfit";
import { detectGaps, evaluateWish } from "@/lib/gaps";
import { planPurchases, PRODUCTS } from "@/lib/shop";
import { DEFAULT_PROFILE, DEFAULT_ROUTINE, sampleWardrobe, syntheticForecast, winterPreview, summerPreview, rainyPreview } from "@/lib/sample";
import { findPreset, itemFromPreset } from "@/lib/garments";
import { normalizeRecognition } from "@/lib/ai";
import type { ClothingItem, Profile } from "@/lib/types";

const profile: Profile = { ...DEFAULT_PROFILE, onboarded: true, preferences: { ...DEFAULT_PROFILE.preferences, coldSensitivity: 1 } };
const prefs = profile.preferences;
const routine = DEFAULT_ROUTINE;
const item = (subtype: string, name = subtype): ClothingItem => itemFromPreset(findPreset(subtype)!, { name });

describe("weather rules", () => {
  it("computes Environment Canada wind chill", () => {
    expect(windChill(-20, 30)).toBeCloseTo(-32.6, 0);
    expect(windChill(15, 30)).toBe(15);
  });

  it("maps wind chill to frostbite risk", () => {
    expect(frostbiteRisk(-5).level).toBe("low");
    expect(frostbiteRisk(-30).level).toBe("high");
    expect(frostbiteRisk(-45).minutes).toBe(10);
  });

  it("parses an Open-Meteo response", () => {
    const f = parseOpenMeteo({
      latitude: 43.7, longitude: -79.4, timezone: "America/Toronto",
      current: { time: "2026-10-10T13:00", temperature_2m: 12, apparent_temperature: 9, wind_speed_10m: 20 },
      hourly: { time: ["2026-10-10T13:00"], temperature_2m: [12], apparent_temperature: [9], precipitation_probability: [30], uv_index: [3] },
      daily: { time: ["2026-10-10"], temperature_2m_max: [14], temperature_2m_min: [5] },
    });
    expect(f.current.feelsLike).toBe(9);
    expect(f.current.precipitationProbability).toBe(30);
    expect(f.daily[0].tempMin).toBe(5);
  });

  it("uses the routine to decide what part of the day matters", () => {
    // Cold morning, warm afternoon.
    const f = syntheticForecast({ date: "2026-10-10", temp: (h) => (h < 10 ? 2 : 16), wind: 5 });
    const a = analyzeDay(f, prefs, routine);
    expect(a.segments.map((s) => s.label)).toContain("Heading out");
    expect(a.coldestFeelsLike).toBeLessThan(5);
    expect(a.warmestFeelsLike).toBeGreaterThan(10);
  });

  it("flags rain, snow and frostbite", () => {
    const a = analyzeDay(winterPreview(), prefs, routine);
    const ids = a.alerts.map((x) => x.id);
    expect(ids).toContain("snow");
    expect(a.needsRainProtection).toBe(true);
  });

  it("cold sensitivity lowers the dressing temperature", () => {
    const f = syntheticForecast({ temp: () => 5, wind: 3 });
    const warm = analyzeDay(f, { ...prefs, coldSensitivity: -2 }, routine);
    const cold = analyzeDay(f, { ...prefs, coldSensitivity: 2 }, routine);
    expect(cold.dressingTemp).toBeLessThan(warm.dressingTemp);
  });
});

describe("outfit engine", () => {
  it("uses only owned, available items", () => {
    const w = sampleWardrobe();
    w[3].available = false; // hoodie in the wash
    const a = analyzeDay(syntheticForecast({ temp: () => 8 }), prefs, routine);
    const r = recommendOutfits(w, a, prefs, routine)!;
    const ids = new Set(w.filter((i) => i.available).map((i) => i.id));
    for (const p of r.primary.picks) expect(ids.has(p.item.id)).toBe(true);
  });

  it("keeps it light on a warm day", () => {
    const a = analyzeDay(syntheticForecast({ temp: () => 25, wind: 3, uv: 7 }), { ...prefs, coldSensitivity: 0 }, routine);
    const r = recommendOutfits(sampleWardrobe(), a, prefs, routine)!;
    expect(r.primary.status).toBe("good");
    expect(r.primary.picks.some((p) => p.item.category === "outer")).toBe(false);
  });

  it("improvises in winter without a coat and is honest about it", () => {
    const a = analyzeDay(winterPreview(), prefs, routine);
    const r = recommendOutfits(sampleWardrobe(), a, prefs, routine)!;
    expect(["limited", "needs-gear"]).toContain(r.primary.status);
    expect(r.primary.limitations.some((l) => l.gapKey === "winter-coat")).toBe(true);
    // Should wear the windproof shell over insulating layers rather than skipping it.
    expect(r.primary.picks.some((p) => p.item.name === "Light windbreaker")).toBe(true);
    expect(r.primary.limitations.every((l) => l.workaround)).toBe(true);
  });

  it("requires proper gear in frostbite conditions regardless of layering", () => {
    const f = syntheticForecast({ temp: () => -25, wind: 30 });
    const a = analyzeDay(f, prefs, routine);
    const w = [...sampleWardrobe(), item("fleece"), item("thermal top")];
    const r = recommendOutfits(w, a, prefs, routine)!;
    expect(r.primary.status).toBe("needs-gear");
    expect(r.primary.limitations[0].severity).toBe("danger");
  });

  it("is happy with a proper winter wardrobe", () => {
    const f = syntheticForecast({ temp: () => -10, wind: 15, snow: true, precipProb: 60 });
    const a = analyzeDay(f, prefs, routine);
    const w = [item("t-shirt"), item("thermal top"), item("fleece"), item("winter parka"), item("jeans"), item("thermal leggings"), item("winter boots"), item("toque"), item("insulated mittens"), item("scarf"), item("wool socks")];
    const r = recommendOutfits(w, a, prefs, routine)!;
    expect(["good", "workaround"]).toContain(r.primary.status);
    expect(r.primary.picks.some((p) => p.item.subtype === "winter boots")).toBe(true);
    expect(r.primary.picks.some((p) => p.item.subtype === "toque")).toBe(true);
  });

  it("offers alternatives", () => {
    const w = [...sampleWardrobe(), item("fleece", "Blue fleece")];
    const a = analyzeDay(syntheticForecast({ temp: () => 6 }), prefs, routine);
    const r = recommendOutfits(w, a, prefs, routine)!;
    expect(r.alternatives.length).toBeGreaterThan(0);
  });

  it("targets more warmth as it gets colder", () => {
    expect(torsoTarget(-15)).toBeGreaterThan(torsoTarget(0));
    expect(torsoTarget(0)).toBeGreaterThan(torsoTarget(20));
  });
});

describe("all seasons and personalization", () => {
  it("defaults to the whole day when there is no plan", () => {
    const a = analyzeDay(syntheticForecast({ temp: () => 10 }), prefs);
    expect(a.personalized).toBe(false);
    expect(a.segments.map((s) => s.label)).toEqual(["Morning", "Afternoon", "Evening"]);
  });

  it("picks a date plan over a weekly one, and matches weekdays", () => {
    const p: Profile = {
      ...profile,
      plans: [
        { ...routine, id: "a", label: "Class", schedule: { kind: "weekly", days: [1, 3, 5] }, leaveHour: 7 },
        { ...routine, id: "b", label: "Interview", schedule: { kind: "date", date: "2027-01-15" }, leaveHour: 10 },
      ],
    };
    expect(activePlan(p, "2027-01-15")?.leaveHour).toBe(10); // Friday, but the date plan wins
    expect(activePlan(p, "2027-01-18")?.label).toBe("Class"); // Monday
    expect(activePlan(p, "2027-01-19")).toBeUndefined(); // Tuesday
  });

  it("dresses light for a hot humid day and flags heat and sun", () => {
    const a = analyzeDay(summerPreview(), { ...prefs, coldSensitivity: 0 });
    expect(a.alerts.some((x) => x.id.startsWith("heat"))).toBe(true);
    const r = recommendOutfits(sampleWardrobe(), a, prefs)!;
    const names = r.primary.picks.map((p) => p.item.name);
    expect(names).toContain("Khaki shorts");
    expect(names).toContain("Baseball cap");
    expect(r.primary.picks.some((p) => p.item.category === "outer" || p.item.category === "mid")).toBe(false);
  });

  it("handles a cold rainy spring day with an umbrella or rain layer", () => {
    const a = analyzeDay(rainyPreview(), prefs);
    expect(a.needsRainProtection).toBe(true);
    const r = recommendOutfits(sampleWardrobe(), a, prefs)!;
    const hasRain = r.primary.picks.some((p) => p.item.waterResistance > 0 && (p.item.category === "outer" || p.item.category === "accessory"));
    expect(hasRain).toBe(true);
  });

  it("builds the outfit around a pinned item", () => {
    const w = sampleWardrobe();
    const denim = w.find((i) => i.name === "Denim jacket")!;
    const a = analyzeDay(syntheticForecast({ temp: () => 20, wind: 3 }), prefs);
    const r = recommendOutfits(w, a, prefs, undefined, denim.id)!;
    expect(r.primary.picks.some((p) => p.item.id === denim.id)).toBe(true);
  });

  it("checks wishes against what you own", () => {
    const toItem = (w: string) => itemFromPreset(findPreset(w)!, { name: w });
    const gaps = detectGaps(sampleWardrobe(), profile);
    expect(evaluateWish("puffer jacket", gaps, toItem).verdict).toBe("fills-gap");
    expect(evaluateWish("umbrella", detectGaps([...sampleWardrobe(), item("rain jacket")], profile), toItem).verdict).not.toBe("fills-gap");
  });
});

describe("gaps and budget", () => {
  it("finds winter essentials missing from a newcomer wardrobe and ranks them first", () => {
    const gaps = detectGaps(sampleWardrobe(), profile, winterPreview());
    const open = gaps.filter((g) => g.status !== "covered");
    expect(open[0].importance).toBe("essential");
    expect(open.map((g) => g.key)).toEqual(expect.arrayContaining(["winter-coat", "winter-boots", "toque", "mittens"]));
  });

  it("does not shop for what you already own", () => {
    const w = [...sampleWardrobe(), item("winter parka"), item("toque")];
    const gaps = detectGaps(w, profile);
    expect(gaps.find((g) => g.key === "winter-coat")!.status).toBe("covered");
    const plan = planPurchases(gaps, 500);
    expect(plan.buyNow.some((p) => p.gap.key === "winter-coat" || p.gap.key === "toque")).toBe(false);
  });

  it("never exceeds the budget and buys essentials first", () => {
    const gaps = detectGaps(sampleWardrobe(), profile, winterPreview());
    for (const budget of [0, 40, 150, 400]) {
      const plan = planPurchases(gaps, budget);
      expect(plan.spentCad).toBeLessThanOrEqual(budget);
      const total = plan.buyNow.reduce((s, p) => s + p.product.priceCad, 0);
      expect(total).toBeCloseTo(plan.spentCad, 5);
    }
    const plan = planPurchases(gaps, 150);
    expect(plan.buyNow[0].gap.importance).toBe("essential");
  });

  it("every product has a link and a gap", () => {
    for (const p of PRODUCTS) {
      expect(p.url).toMatch(/^https:\/\//);
      expect(p.priceCad).toBeGreaterThan(0);
    }
  });
});

describe("AI output normalisation", () => {
  it("validates model output against explicit rules", () => {
    const items = normalizeRecognition({
      items: [
        { name: "black puffer", category: "outer", subtype: "puffer jacket", warmth: 9, waterResistance: 2, confidence: 0.9 },
        { name: "mystery", category: "spaceship" },
        { name: "red hoodie", category: "base", subtype: "hoodie", warmth: 2, confidence: 0.4 },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[0].warmth).toBe(4); // clamped to preset
    expect(items[0].waterResistance).toBe(1); // preset wins over model guess
    expect(items[1].category).toBe("mid"); // low-confidence category corrected by preset
  });

  it("handles garbage", () => {
    expect(normalizeRecognition(null)).toEqual([]);
    expect(normalizeRecognition({ items: "nope" })).toEqual([]);
  });
});

describe("seasons", () => {
  it("maps dates to Canadian seasons for the theme and splash art", async () => {
    const { seasonFor } = await import("@/lib/season");
    expect(seasonFor("2027-01-10")).toBe("winter");
    expect(seasonFor("2027-04-10")).toBe("spring");
    expect(seasonFor("2027-07-10")).toBe("summer");
    expect(seasonFor("2026-10-10")).toBe("fall");
    expect(seasonFor("2026-12-01")).toBe("winter");
  });
});

describe("flexible plans", () => {
  const base = { ...DEFAULT_ROUTINE, label: "Gym" };
  it("repeats on any chosen days, every N weeks, between start and end dates", () => {
    const p = { plans: [{ ...base, id: "g", schedule: { kind: "weekly" as const, days: [1, 2], every: 2, start: "2026-10-12", until: "2026-11-30" } }] };
    expect(activePlan(p, "2026-10-12")?.label).toBe("Gym"); // Monday, week 0
    expect(activePlan(p, "2026-10-13")?.label).toBe("Gym"); // Tuesday, week 0
    expect(activePlan(p, "2026-10-14")).toBeUndefined(); // Wednesday
    expect(activePlan(p, "2026-10-19")).toBeUndefined(); // Monday, off week
    expect(activePlan(p, "2026-10-26")?.label).toBe("Gym"); // Monday, week 2
    expect(activePlan(p, "2026-10-05")).toBeUndefined(); // before start
    expect(activePlan(p, "2026-12-07")).toBeUndefined(); // after end
  });
});
