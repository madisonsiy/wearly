"use client";

import { useMemo, useState } from "react";
import type { ClothingItem, Forecast, Profile } from "@/lib/types";
import { detectGaps, evaluateWish } from "@/lib/gaps";
import { planPurchases, type PlannedPurchase } from "@/lib/shop";
import { findPreset, itemFromPreset } from "@/lib/garments";

function Purchase({ p, rank }: { p: PlannedPurchase; rank?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fix" style={{ display: "block" }}>
      <div className="spread">
        <b className="small">{rank ? `${rank}. ` : ""}{p.gap.label}</b>
        <b>~${p.product.priceCad}</b>
      </div>
      <div className="small">
        <a href={p.product.url} target="_blank" rel="noreferrer">{p.product.name}</a> · {p.product.retailer}
      </div>
      <div className="small muted">{p.reason}</div>
      {p.options.length > 1 && (
        <button className="link small" onClick={() => setOpen(!open)}>{open ? "Hide" : "Compare"} {p.options.length} options</button>
      )}
      {open && (
        <ul className="clean small" style={{ marginTop: 4 }}>
          {p.options.map((o) => (
            <li key={o.id} style={{ padding: "3px 0", fontWeight: o.id === p.product.id ? 700 : 400 }}>
              <a href={o.url} target="_blank" rel="noreferrer">{o.name}</a> ({o.retailer}) · ${o.priceCad} · {"★".repeat(o.suitability)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PlanView({ profile, wardrobe, forecast, onProfile, onLearn, aiOnline }: {
  profile: Profile;
  wardrobe: ClothingItem[];
  forecast: Forecast | null;
  onProfile: (p: Profile) => void;
  onLearn: (k: string) => void;
  aiOnline: boolean;
}) {
  const gaps = useMemo(() => detectGaps(wardrobe, profile, forecast ?? undefined), [wardrobe, profile, forecast]);
  const plan = useMemo(() => planPurchases(gaps, profile.budgetCad), [gaps, profile.budgetCad]);
  const open = gaps.filter((g) => g.status !== "covered");
  const [wish, setWish] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toItem = (w: string) => {
    const p = findPreset(w);
    return p ? itemFromPreset(p, { name: w }) : undefined;
  };

  const explain = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "gaps",
          facts: {
            city: profile.city,
            budgetCad: profile.budgetCad,
            gaps: open.slice(0, 6).map((g) => ({ item: g.label, importance: g.importance, status: g.status, why: g.why, stopgap: g.workaround, neededThisWeek: g.neededThisWeek })),
            buyFirst: plan.buyNow.map((b) => `${b.product.name} ($${b.product.priceCad})`),
            owns: wardrobe.map((i) => i.name),
          },
        }),
      });
      const json = await res.json();
      setExplanation(res.ok ? json.text : `Couldn't reach the model: ${json.error}`);
    } catch {
      setExplanation("Couldn't reach the model right now.");
    }
    setBusy(false);
  };

  const shown = showAll ? open : open.slice(0, 4);

  return (
    <div>
      <h2>Shop smart</h2>
      <p className="small muted">Only what your closet can&apos;t already cover, for every season.</p>

      <div className="section-title">Want something?</div>
      <div className="card">
        <div className="row">
          <input value={wish} onChange={(e) => setWish(e.target.value)} placeholder="e.g. puffer jacket, sun hat" list="garment-types" style={{ flex: 1, minWidth: 140 }}
            onKeyDown={(e) => e.key === "Enter" && wish.trim() && (onProfile({ ...profile, wishlist: [...profile.wishlist, wish.trim()] }), setWish(""))} />
          <button disabled={!wish.trim()} onClick={() => (onProfile({ ...profile, wishlist: [...profile.wishlist, wish.trim()] }), setWish(""))}>Add</button>
        </div>
        {profile.wishlist.map((w, i) => {
          const v = evaluateWish(w, gaps, toItem);
          return (
            <div key={`${w}-${i}`} className="fix">
              <span className={`dot ${v.verdict === "fills-gap" ? "" : "caution"}`} style={v.verdict === "fills-gap" ? { background: "var(--good)" } : undefined} />
              <div className="small" style={{ flex: 1 }}>
                <b>{w}</b>
                <div>{v.note}</div>
              </div>
              <button className="link small" onClick={() => onProfile({ ...profile, wishlist: profile.wishlist.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          );
        })}
      </div>

      <div className="section-title">Missing from your closet</div>
      <div className="card">
        {open.length === 0 && <p className="small">Your closet covers everything we check for.</p>}
        {shown.map((g) => (
          <details key={g.key} className="fix" style={{ display: "block" }}>
            <summary style={{ color: "var(--text)" }}>
              <div className="row">
                <b className="small">{g.label}</b>
                <span className={`pill ${g.importance}`}>{g.importance[0].toUpperCase() + g.importance.slice(1)}</span>
                {g.neededThisWeek && <span className="pill warning">This week</span>}
              </div>
            </summary>
            <div className="small" style={{ marginTop: 4 }}>
              {g.why}
              {g.workaround && <div className="muted">For now: {g.workaround}</div>}
            </div>
          </details>
        ))}
        {open.length > 4 && <button className="link small" onClick={() => setShowAll(!showAll)}>{showAll ? "Show less" : `Show all ${open.length}`}</button>}
        <div className="row" style={{ marginTop: 8 }}>
          {aiOnline && open.length > 0 && <button className="small" onClick={explain} disabled={busy}>{busy ? "Thinking…" : "What matters most?"}</button>}
          <button className="link small" onClick={() => onLearn("insulation")}>How to judge clothing</button>
        </div>
        {explanation && <p className="small card soft" style={{ marginTop: 8 }}>{explanation}</p>}
      </div>

      <div className="section-title">Buy first</div>
      <div className="card">
        <div className="spread">
          <label htmlFor="budget" style={{ margin: 0 }}>Budget (CAD)</label>
          <input id="budget" type="number" inputMode="numeric" min={0} step={10} value={profile.budgetCad} onChange={(e) => onProfile({ ...profile, budgetCad: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 110 }} />
        </div>
        <p className="small muted">${plan.spentCad} of ${plan.budgetCad} · typical prices, check before buying</p>
        {plan.buyNow.length === 0 && open.length > 0 && <p className="small">Nothing fits this budget yet.</p>}
        {plan.buyNow.map((p, i) => <Purchase key={p.gap.key} p={p} rank={i + 1} />)}
        {plan.notes.map((n) => <p key={n} className="small alert">{n}</p>)}
        {plan.buyLater.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary>Later, when budget allows ({plan.buyLater.length})</summary>
            {plan.buyLater.map((p) => <Purchase key={p.gap.key} p={p} />)}
          </details>
        )}
      </div>
    </div>
  );
}
