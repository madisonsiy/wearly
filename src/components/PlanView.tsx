"use client";

import { useMemo, useState } from "react";
import type { ClothingItem, Forecast, Profile } from "@/lib/types";
import { detectGaps } from "@/lib/gaps";
import { planPurchases, type PlannedPurchase } from "@/lib/shop";

function Purchase({ p, rank }: { p: PlannedPurchase; rank?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card soft">
      <div className="spread">
        <b>
          {rank ? `${rank}. ` : ""}
          {p.gap.label}
        </b>
        <span className={`pill ${p.gap.importance}`}>{p.gap.importance}</span>
      </div>
      <p className="small muted" style={{ margin: "4px 0 8px" }}>{p.reason}</p>
      <div className="spread">
        <div>
          <a href={p.product.url} target="_blank" rel="noreferrer">{p.product.name}</a> at {p.product.retailer}
          <div className="small muted">{p.product.features.join(" · ")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <b>~${p.product.priceCad}</b>
          <div className="small muted">{p.product.priceCheckedOn ? `checked ${p.product.priceCheckedOn}` : "typical price"}</div>
        </div>
      </div>
      {p.product.secondHandTip && <p className="small" style={{ marginTop: 6 }}>💡 {p.product.secondHandTip}</p>}
      {p.options.length > 1 && (
        <>
          <button className="link small" onClick={() => setOpen(!open)}>{open ? "Hide" : "Compare"} {p.options.length} options</button>
          {open && (
            <table className="small" style={{ width: "100%", marginTop: 6, borderCollapse: "collapse" }}>
              <thead>
                <tr className="muted" style={{ textAlign: "left" }}>
                  <th>Option</th><th>Price</th><th>Protection</th><th>Versatility</th>
                </tr>
              </thead>
              <tbody>
                {p.options.map((o) => (
                  <tr key={o.id} style={{ fontWeight: o.id === p.product.id ? 700 : 400 }}>
                    <td><a href={o.url} target="_blank" rel="noreferrer">{o.name}</a> ({o.retailer})</td>
                    <td>${o.priceCad}</td>
                    <td>{"★".repeat(o.suitability)}{"☆".repeat(5 - o.suitability)}</td>
                    <td>{Math.round(o.versatility * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

export default function PlanView({ profile, wardrobe, forecast, onBudget, onLearn, aiOnline }: {
  profile: Profile;
  wardrobe: ClothingItem[];
  forecast: Forecast | null;
  onBudget: (b: number) => void;
  onLearn: (k: string) => void;
  aiOnline: boolean;
}) {
  const gaps = useMemo(() => detectGaps(wardrobe, profile, forecast ?? undefined), [wardrobe, profile, forecast]);
  const plan = useMemo(() => planPurchases(gaps, profile.budgetCad), [gaps, profile.budgetCad]);
  const open = gaps.filter((g) => g.status !== "covered");
  const [explanation, setExplanation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
            routine: profile.routine,
            coldExperience: profile.coldExperience,
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

  return (
    <div>
      <div className="card">
        <h2>What&apos;s missing for a Canadian year</h2>
        <p className="small muted">
          Based on your routine ({profile.routine.commuteMode === "none" ? "mostly at home" : `${profile.routine.commuteOutdoorMinutes} min outside each way by ${profile.routine.commuteMode}`}) and what you own.
          We only suggest buying something when nothing you have can do the job.
        </p>
        {open.length === 0 && <p>Your wardrobe covers everything we check for. Nothing to buy.</p>}
        {open.map((g) => (
          <div key={g.key} className="pick" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div className="row">
                <b>{g.label}</b>
                <span className={`pill ${g.importance}`}>{g.importance}</span>
                {g.status === "partial" && <span className="pill">partly covered</span>}
                {g.neededThisWeek && <span className="pill warning">needed this week</span>}
              </div>
              <div className="small">{g.why}</div>
              {g.workaround && <div className="small muted">For now: {g.workaround}</div>}
              <div className="small muted">When: {g.season}</div>
            </div>
          </div>
        ))}
        {gaps.some((g) => g.status === "covered") && (
          <p className="small muted" style={{ marginTop: 10 }}>
            Already covered: {gaps.filter((g) => g.status === "covered").map((g) => `${g.label} (your ${g.coveredBy[0]})`).join("; ")}.
          </p>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={explain} disabled={busy || !aiOnline || open.length === 0}>{busy ? "Thinking…" : "Explain my priorities"}</button>
          <button className="link small" onClick={() => onLearn("insulation")}>How to judge warm clothing</button>
        </div>
        {explanation && <div className="card soft small" style={{ marginTop: 10 }}>{explanation}<div className="ai-note">Written by the open-weight model from the gap list above.</div></div>}
      </div>

      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>What to buy first</h2>
          <div className="row">
            <label htmlFor="budget" style={{ margin: 0 }}>Budget (CAD)</label>
            <input id="budget" type="number" min={0} step={10} value={profile.budgetCad} onChange={(e) => onBudget(Math.max(0, Number(e.target.value) || 0))} style={{ width: 110 }} />
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>
          Spending ${plan.spentCad} of ${plan.budgetCad}, ${plan.remainingCad} left. Essentials come first, then the best value for money. Prices are typical prices, so check the link before you buy.
        </p>
        {plan.buyNow.length === 0 && open.length > 0 && <p>Nothing fits this budget yet. See the options below for what to save up for.</p>}
        {plan.buyNow.map((p, i) => <Purchase key={p.gap.key} p={p} rank={i + 1} />)}
        {plan.notes.map((n) => <div key={n} className="alert">{n}</div>)}
        {plan.buyLater.length > 0 && (
          <>
            <h3 style={{ marginTop: 14 }}>Later, when budget allows</h3>
            {plan.buyLater.map((p) => <Purchase key={p.gap.key} p={p} />)}
          </>
        )}
      </div>
    </div>
  );
}
