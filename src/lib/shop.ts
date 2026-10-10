// Budget-aware shopping. Product data lives in a small catalogue (src/data/products.json)
// so prices and links are explicit data, not model output. The planner is pure rules:
// it only suggests items for real gaps, never exceeds the budget, and buys the most
// important gaps first.

import catalogue from "../data/products.json";
import type { WardrobeGap } from "./gaps";

export interface Product {
  id: string;
  gapKey: string;
  name: string;
  retailer: string;
  priceCad: number;
  /** "budget", "value" or "premium". */
  tier: "budget" | "value" | "premium";
  /** 1-5: how much practical protection it gives. */
  suitability: number;
  /** 0-1: how many situations it's useful in. */
  versatility: number;
  features: string[];
  url: string;
  /** Date the price was last checked by a person, or null if it's an estimate. */
  priceCheckedOn: string | null;
  secondHandTip?: string;
}

export const PRODUCTS: Product[] = (catalogue as { products: Product[] }).products;

export interface PlannedPurchase {
  gap: WardrobeGap;
  product: Product;
  options: Product[];
  reason: string;
}

export interface ShoppingPlan {
  budgetCad: number;
  buyNow: PlannedPurchase[];
  buyLater: PlannedPurchase[];
  spentCad: number;
  remainingCad: number;
  skippedCovered: WardrobeGap[];
  notes: string[];
}

/** Value score: protection and versatility per dollar, used to rank options within a gap. */
export function valueScore(p: Product): number {
  return ((p.suitability * (0.6 + 0.4 * p.versatility)) / Math.max(5, p.priceCad)) * 100;
}

export function productsForGap(gapKey: string): Product[] {
  return PRODUCTS.filter((p) => p.gapKey === gapKey).sort((a, b) => a.priceCad - b.priceCad);
}

/**
 * Plan purchases within a budget. Rules:
 * 1. Covered gaps are never shopped for ("use what you have first").
 * 2. Essential gaps first, in priority order; partially covered ones after missing ones of the same importance.
 * 3. For each gap pick the best value option that fits the remaining budget, with suitability >= 3 for essentials.
 * 4. Whatever doesn't fit goes to "buy later" with the cheapest adequate option.
 */
export function planPurchases(gaps: WardrobeGap[], budgetCad: number): ShoppingPlan {
  const open = gaps.filter((g) => g.status !== "covered");
  const order = { essential: 0, recommended: 1, optional: 2 } as const;
  open.sort((a, b) => order[a.importance] - order[b.importance] || b.priority - a.priority);

  let remaining = Math.max(0, budgetCad);
  const buyNow: PlannedPurchase[] = [];
  const buyLater: PlannedPurchase[] = [];
  const notes: string[] = [];

  for (const gap of open) {
    const options = productsForGap(gap.key);
    if (options.length === 0) continue;
    const minSuit = gap.importance === "essential" ? 3 : 1;
    const adequate = options.filter((p) => p.suitability >= minSuit);
    const pool = adequate.length ? adequate : options;
    const affordable = pool.filter((p) => p.priceCad <= remaining);
    // Optional upgrades shouldn't eat into money while essentials are still unmet later in the list.
    const essentialsLeft = open.filter((g) => g !== gap && g.importance === "essential" && !buyNow.some((b) => b.gap === g) && !buyLater.some((b) => b.gap === g));
    const reserve = gap.importance === "essential" ? 0 : essentialsLeft.reduce((s, g) => s + (productsForGap(g.key)[0]?.priceCad ?? 0), 0);

    if (affordable.length && affordable.some((p) => p.priceCad <= remaining - reserve)) {
      const choices = affordable.filter((p) => p.priceCad <= remaining - reserve);
      const best = choices.reduce((a, b) => (valueScore(b) > valueScore(a) ? b : a));
      remaining -= best.priceCad;
      buyNow.push({
        gap, product: best, options,
        reason: gap.status === "partial"
          ? `Upgrade: you have a stand-in (${gap.partialBy[0]}), but it won't cover the coldest days.`
          : gap.neededThisWeek ? "Needed for this week's forecast." : `${gap.importance === "essential" ? "Essential" : "Useful"} for your routine.`,
      });
    } else {
      const cheapest = pool[0];
      buyLater.push({ gap, product: cheapest, options, reason: `Doesn't fit the remaining budget ($${remaining.toFixed(0)} left). Cheapest adequate option is $${cheapest.priceCad}.` });
    }
  }

  if (buyLater.some((p) => p.gap.importance === "essential")) {
    notes.push("Some essentials don't fit your budget yet. Thrift stores (Value Village, Salvation Army) and Facebook Marketplace often have winter coats and boots for $20 to $60, and many cities and campuses run free winter clothing drives for newcomers.");
  }
  if (buyNow.length === 0 && open.length === 0) notes.push("Your wardrobe already covers the essentials. No purchases needed.");

  return {
    budgetCad,
    buyNow,
    buyLater,
    spentCad: Math.round((budgetCad - remaining) * 100) / 100,
    remainingCad: Math.round(remaining * 100) / 100,
    skippedCovered: gaps.filter((g) => g.status === "covered"),
    notes,
  };
}
