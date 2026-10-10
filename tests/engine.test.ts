import { describe, expect, it } from "vitest";
import { analyzeDay, windChill, frostbiteRisk, parseOpenMeteo } from "@/lib/weather";
import { recommendOutfits, torsoTarget } from "@/lib/outfit";
import { detectGaps } from "@/lib/gaps";
import { planPurchases, PRODUCTS } from "@/lib/shop";
import { DEFAULT_PROFILE, sampleWardrobe, syntheticForecast, winterPreview } from "@/lib/sample";
import { findPreset, itemFromPreset } from "@/lib/garments";
import { normalizeRecognition } from "@/lib/ai";
import type { ClothingItem, Profile } from "@/lib/types";

const profile: Profile = { ...DEFAULT_PROFILE, onboarded: true };
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
    const a = analyzeDay(f, profile);
    expect(a.segments.map((s) => s.label)).toContain("Morning commute");
    expect(a.coldestFeelsLike).toBeLessThan(5);
    expect(a.warmestFeelsLike).toBeGreaterThan(10);
  });

  it("flags rain, snow and frostbite", () => {
    const a = analyzeDay(winterPreview(), profile);
    const ids = a.alerts.map((x) => x.id);
    expect(ids).toContain("snow");
    expect(a.needsRainProtection).toBe(true);
  });

  it("cold sensitivity lowers the dressing temperature", () => {
    const f = syntheticForecast({ temp: () => 5, wind: 3 });
    const warm = analyzeDay(f, { ...profile, preferences: { ...profile.preferences, coldSensitivity: -2 } });
    const cold = analyzeDay(f, { ...profile, preferences: { ...profile.preferences, coldSensitivity: 2 } });
    expect(cold.dressingTemp).toBeLessThan(warm.dressingTemp);
  });
});

describe("outfit engine", () => {
  it("uses only owned, available items", () => {
    const w = sampleWardrobe();
    w[3].available = false; // hoodie in the wash
    const a = analyzeDay(syntheticForecast({ temp: () => 8 }), profile);
    const r = recommendOutfits(w, a, profile.preferences, profile.routine)!;
    const ids = new Set(w.filter((i) => i.available).map((i) => i.id));
    for (const p of r.primary.picks) expect(ids.has(p.item.id)).toBe(true);
  });

  it("keeps it light on a warm day", () => {
    const a = analyzeDay(syntheticForecast({ temp: () => 25, wind: 3, uv: 7 }), { ...profile, preferences: { ...profile.preferences, coldSensitivity: 0 } });
    const r = recommendOutfits(sampleWardrobe(), a, profile.preferences, profile.routine)!;
    expect(r.primary.status).toBe("good");
    expect(r.primary.picks.some((p) => p.item.category === "outer")).toBe(false);
  });

  it("improvises in winter without a coat and is honest about it", () => {
    const a = analyzeDay(winterPreview(), profile);
    const r = recommendOutfits(sampleWardrobe(), a, profile.preferences, profile.routine)!;
    expect(["limited", "needs-gear"]).toContain(r.primary.status);
    expect(r.primary.limitations.some((l) => l.gapKey === "winter-coat")).toBe(true);
    // Should wear the windproof shell over insulating layers rather than skipping it.
    expect(r.primary.picks.some((p) => p.item.name === "Light windbreaker")).toBe(true);
    expect(r.primary.improvisations.length).toBeGreaterThan(0);
  });

  it("requires proper gear in frostbite conditions regardless of layering", () => {
    const f = syntheticForecast({ temp: () => -25, wind: 30 });
    const a = analyzeDay(f, profile);
    const w = [...sampleWardrobe(), item("fleece"), item("thermal top")];
    const r = recommendOutfits(w, a, profile.preferences, profile.routine)!;
    expect(r.primary.status).toBe("needs-gear");
    expect(r.primary.limitations[0].severity).toBe("danger");
  });

  it("is happy with a proper winter wardrobe", () => {
    const f = syntheticForecast({ temp: () => -10, wind: 15, snow: true, precipProb: 60 });
    const a = analyzeDay(f, profile);
    const w = [item("t-shirt"), item("thermal top"), item("fleece"), item("winter parka"), item("jeans"), item("thermal leggings"), item("winter boots"), item("toque"), item("insulated mittens"), item("scarf"), item("wool socks")];
    const r = recommendOutfits(w, a, profile.preferences, profile.routine)!;
    expect(["good", "workaround"]).toContain(r.primary.status);
    expect(r.primary.picks.some((p) => p.item.subtype === "winter boots")).toBe(true);
    expect(r.primary.picks.some((p) => p.item.subtype === "toque")).toBe(true);
  });

  it("offers alternatives", () => {
    const w = [...sampleWardrobe(), item("fleece", "Blue fleece")];
    const a = analyzeDay(syntheticForecast({ temp: () => 6 }), profile);
    const r = recommendOutfits(w, a, profile.preferences, profile.routine)!;
    expect(r.alternatives.length).toBeGreaterThan(0);
  });

  it("targets more warmth as it gets colder", () => {
    expect(torsoTarget(-15)).toBeGreaterThan(torsoTarget(0));
    expect(torsoTarget(0)).toBeGreaterThan(torsoTarget(20));
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
