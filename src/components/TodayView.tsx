"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClothingItem, Forecast, Plan, Profile } from "@/lib/types";
import { activePlan, analyzeDay, describeWeatherCode, weatherEmoji } from "@/lib/weather";
import { recommendOutfits, type OutfitRecommendation } from "@/lib/outfit";
import { PREVIEWS, type PreviewKind } from "@/lib/sample";
import type { Season } from "@/lib/season";
import { PlanEditor, describeSchedule, upsertPlan } from "./ProfileView";
import SeasonScene from "./SeasonScene";
import GarmentArt from "./GarmentArt";

export const STATUS_LABEL = {
  good: "Good to go",
  workaround: "Small tweaks",
  limited: "Limited",
  "needs-gear": "Needs proper gear",
} as const;

/** Current time, refreshed at the start of every minute. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);
  return now;
}

const timeIn = (now: Date, timeZone: string, opts: Intl.DateTimeFormatOptions) => {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-US", opts).format(now);
  }
};
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

function MiniOutfit({ rec }: { rec: OutfitRecommendation }) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="spread">
        <b>{rec.title}</b>
        <span className={`pill ${rec.status}`}>{STATUS_LABEL[rec.status]}</span>
      </div>
      <div className="row" style={{ marginTop: 8, gap: 4 }}>
        {rec.picks.slice(0, 6).map((p) => <GarmentArt key={p.item.id} item={p.item} size={40} />)}
      </div>
      <p className="small muted" style={{ margin: "6px 0 0" }}>{rec.picks.map((p) => p.item.name).join(", ")}</p>
    </div>
  );
}

export default function TodayView(props: {
  profile: Profile;
  wardrobe: ClothingItem[];
  forecast: Forecast | null;
  weatherError: string | null;
  preview: PreviewKind | null;
  season: Season;
  onPreview: (p: PreviewKind | null) => void;
  onRetry: () => void;
  onLearn: (k: string) => void;
  onGoCloset: () => void;
  onGoShop: () => void;
  onProfile: (p: Profile) => void;
  aiOnline: boolean;
}) {
  const { profile, wardrobe, forecast, weatherError, preview } = props;
  const now = useNow();
  const tz = forecast?.timezone ?? "America/Toronto";
  const firstDate = forecast?.daily[0]?.date ?? "";
  const [selected, setSelected] = useState(firstDate);
  useEffect(() => setSelected(firstDate), [firstDate]);
  const date = selected || firstDate;
  const isToday = date === firstDate;
  const day = forecast?.daily.find((d) => d.date === date);

  const plan = preview ? undefined : activePlan(profile, date);
  const pinnedId = profile.pinned?.date === date && !preview ? profile.pinned.itemId : undefined;
  const analysis = useMemo(() => (forecast ? analyzeDay(forecast, profile.preferences, plan, date) : null), [forecast, profile.preferences, plan, date]);
  const result = useMemo(
    () => (analysis ? recommendOutfits(wardrobe, analysis, profile.preferences, plan, pinnedId) : undefined),
    [analysis, wardrobe, profile.preferences, plan, pinnedId],
  );
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [editing, setEditing] = useState<null | "edit" | "new">(null);

  useEffect(() => setExplanation(null), [result]);

  const explain = async () => {
    if (!result || !analysis) return;
    setExplaining(true);
    try {
      const r = result.primary;
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "outfit",
          facts: {
            city: profile.city,
            plan: plan ?? "general day out",
            weather: { coldestFeelsLike: analysis.coldestFeelsLike, hottestFeelsLike: analysis.hottestFeelsLike, maxWindKmh: analysis.maxWind, rainChance: analysis.maxPrecipProbability, uv: analysis.maxUv, alerts: analysis.alerts.map((a) => a.title) },
            outfit: r.picks.map((p) => ({ slot: p.slot, item: p.item.name })),
            status: r.status,
            limitations: r.limitations.map((l) => `${l.text}${l.workaround ? ` (workaround: ${l.workaround})` : ""}`),
          },
        }),
      });
      const json = await res.json();
      setExplanation(res.ok ? json.text : `Couldn't reach the model: ${json.error ?? "unknown error"}`);
    } catch {
      setExplanation("Couldn't reach the model right now.");
    }
    setExplaining(false);
  };

  const nowHour = Number(timeIn(now, tz, { hour: "numeric", hourCycle: "h23" })) % 24;
  // Only outline outdoor hours when the user has a plan; otherwise the whole day counts.
  const outdoorHours = new Set(analysis?.personalized ? analysis.segments.map((s) => s.hour) : []);
  const startHour = isToday ? nowHour : 6;
  const dayHours = forecast && analysis ? forecast.hourly.filter((h) => h.time.startsWith(date) && Number(h.time.slice(11, 13)) >= startHour && Number(h.time.slice(11, 13)) <= 23) : [];
  const currentHour = forecast?.hourly.find((h) => h.time.startsWith(date) && Number(h.time.slice(11, 13)) === nowHour);
  const rec = result?.primary;
  const available = wardrobe.filter((i) => i.available);
  const pinnedItem = wardrobe.find((i) => i.id === pinnedId);
  const dayName = isToday ? "Today" : new Date(`${date}T12:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const shown = isToday && !preview ? forecast?.current : currentHour;

  return (
    <div>
      <div className="spread" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{profile.name ? `Hi, ${profile.name}` : "Hi there"}</h2>
        <select value={preview ?? ""} onChange={(e) => props.onPreview((e.target.value || null) as PreviewKind | null)} style={{ width: "auto", fontSize: "0.85rem", padding: "6px 10px" }} aria-label="Preview another season">
          <option value="">Live forecast</option>
          {(Object.keys(PREVIEWS) as PreviewKind[]).map((k) => <option key={k} value={k}>Preview: {PREVIEWS[k].label}</option>)}
        </select>
      </div>

      {weatherError && !preview && (
        <div className="alert">
          {weatherError} <button className="link" onClick={props.onRetry}>Try again</button>
        </div>
      )}
      {!forecast && !weatherError && <div className="card muted">Loading the forecast…</div>}

      {forecast && analysis && (
        <div className="card hero-card">
          <SeasonScene season={props.season} compact />
          <div className="content">
            <span className="clock">{dayName} · {timeIn(now, tz, { hour: "numeric", minute: "2-digit" })}</span>
            <div className="hero">
              <div className="emoji">{weatherEmoji(isToday ? forecast.current.weatherCode : day?.weatherCode ?? 0)}</div>
              <div style={{ flex: 1 }}>
                <div className="big">{Math.round(isToday && shown ? shown.temperature : day?.tempMax ?? 0)}°</div>
                <div className="small muted">
                  {isToday && shown ? `Feels like ${Math.round(shown.feelsLike)}°` : `Feels as low as ${Math.round(day?.feelsLikeMin ?? 0)}°`} · {describeWeatherCode(isToday ? forecast.current.weatherCode : day?.weatherCode ?? 0)}
                </div>
              </div>
              <div className="small muted" style={{ textAlign: "right" }}>
                H {Math.round(day?.tempMax ?? 0)}°
                <br />L {Math.round(day?.tempMin ?? 0)}°
              </div>
            </div>
            <div className="chips">
              <span className="chip">💧 {Math.round(day?.precipitationProbabilityMax ?? 0)}%</span>
              <span className="chip">💨 {Math.round(analysis.maxWind)} km/h</span>
              <span className="chip">☀️ UV {Math.round(analysis.maxUv)}</span>
              {(shown?.humidity ?? 0) >= 70 && <span className="chip">💦 {Math.round(shown!.humidity)}% humid</span>}
            </div>
            {analysis.alerts.length > 0 && (
              <div className="chips">
                {analysis.alerts.slice(0, showAlerts ? undefined : 3).map((a) => (
                  <button key={a.id} className={`chip ${a.severity === "info" ? "" : a.severity}`} onClick={() => setShowAlerts(!showAlerts)}>
                    {a.title}
                  </button>
                ))}
              </div>
            )}
            {showAlerts && (
              <div style={{ marginTop: 8 }}>
                {analysis.alerts.map((a) => (
                  <p key={a.id} className="small" style={{ margin: "4px 0" }}>
                    <b>{a.title}.</b> {a.detail} {a.learn && <button className="link small" onClick={() => props.onLearn(a.learn!)}>Learn more</button>}
                  </p>
                ))}
              </div>
            )}
            <div className="hours" style={{ marginTop: 12 }}>
              {dayHours.map((h) => {
                const hr = Number(h.time.slice(11, 13));
                return (
                  <div key={h.time} className={`hour ${isToday && hr === nowHour ? "now" : ""} ${outdoorHours.has(hr) ? "out" : ""}`}>
                    <div className="muted">{isToday && hr === nowHour ? "Now" : hourLabel(hr)}</div>
                    <div>{weatherEmoji(h.weatherCode)}</div>
                    <b>{Math.round(h.temperature)}°</b>
                    {h.precipitationProbability >= 30 && <div className="muted">{Math.round(h.precipitationProbability)}%</div>}
                  </div>
                );
              })}
            </div>
            {analysis.personalized && <p className="small muted" style={{ margin: "6px 0 0" }}>Outlined hours are when you&apos;ll be outside.</p>}
          </div>
        </div>
      )}

      {forecast && !preview && forecast.daily.length > 1 && (
        <div className="hours" style={{ marginBottom: 6 }}>
          {forecast.daily.map((d, i) => (
            <button key={d.date} className={`hour ${d.date === date ? "sel" : ""}`} onClick={() => setSelected(d.date)} style={{ minWidth: 64 }}>
              <div className="muted">{i === 0 ? "Today" : new Date(`${d.date}T12:00`).toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div style={{ fontSize: "1.2rem" }}>{weatherEmoji(d.weatherCode)}</div>
              <b>{Math.round(d.tempMax)}°</b>
              <div className="muted">{Math.round(d.tempMin)}°</div>
            </button>
          ))}
        </div>
      )}
      {preview && <p className="small muted">This is a preview, not a real forecast.</p>}

      {analysis && available.length === 0 && (
        <div className="card">
          <h3>Add your clothes</h3>
          <p className="small">Wearly builds outfits only from what you own. Add a few items to get started.</p>
          <button className="primary full" onClick={props.onGoCloset}>Open my closet</button>
        </div>
      )}

      {rec && available.length > 0 && (
        <>
          <div className="section-title">What to wear</div>
          <div className="card">
            <div className="spread">
              <b>{rec.headline}</b>
              <span className={`pill ${rec.status}`}>{STATUS_LABEL[rec.status]}</span>
            </div>
            <div className="outfit-grid">
              {rec.picks.map((p, i) => (
                <div key={`${p.slot}-${p.item.id}`} className={`tile ${p.item.id === pinnedId ? "pinned" : ""}`} title={p.reason} style={{ animationDelay: `${i * 50}ms` }}>
                  <GarmentArt item={p.item} size={60} />
                  <div>{p.item.name}</div>
                  <div className="slot">{p.slot}</div>
                </div>
              ))}
            </div>
            <details style={{ marginTop: 10 }}>
              <summary>Why this works</summary>
              <ul className="tight small" style={{ marginTop: 6 }}>
                {[...rec.why, ...rec.dayPlan].map((t) => <li key={t}>{t}</li>)}
              </ul>
              {explanation ? (
                <p className="small card soft" style={{ marginTop: 6 }}>
                  {explanation}
                  <span className="ai-note"> (Written by AI from the facts above.)</span>
                </p>
              ) : (
                props.aiOnline && <button className="small" onClick={explain} disabled={explaining}>{explaining ? "Thinking…" : "Explain in plain words"}</button>
              )}
            </details>
          </div>

          {result.alternatives.length > 0 && (
            <>
              <div className="section-title">Other options</div>
              <div className="hscroll">
                {result.alternatives.map((alt) => <MiniOutfit key={alt.title} rec={alt} />)}
              </div>
            </>
          )}

          {rec.limitations.length > 0 && (
            <>
              <div className="section-title">Missing something? Make it work</div>
              <div className="card">
                {rec.limitations.map((l, i) => (
                  <div key={i} className="fix">
                    <span className={`dot ${l.severity}`} />
                    <div className="small">
                      <b>{l.text}</b>
                      {l.workaround && <div>{l.workaround}</div>}
                    </div>
                  </div>
                ))}
                {rec.limitations.some((l) => l.gapKey) && (
                  <button className="link small" style={{ marginTop: 8 }} onClick={props.onGoShop}>See what&apos;s worth buying</button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {analysis && !preview && (
        <>
          <div className="section-title">Personalize {isToday ? "today" : "this day"}</div>
          <div className="card">
            <p className="small" style={{ marginTop: 0 }}>
              {plan ? <>Using <b>{plan.label}</b> ({describeSchedule(plan)}): out {plan.leaveHour}:00 to {plan.returnHour}:00.</> : "No plan, so this covers the whole day."}
            </p>
            {editing ? (
              <PlanEditor
                plan={editing === "edit" ? plan : undefined}
                defaultDate={date}
                onSave={(p: Plan) => props.onProfile(upsertPlan(profile, p))}
                onDelete={editing === "edit" && plan ? () => props.onProfile({ ...profile, plans: profile.plans.filter((x) => x.id !== plan.id) }) : undefined}
                onClose={() => setEditing(null)}
              />
            ) : (
              <div className="row">
                {plan && <button onClick={() => setEditing("edit")}>Edit {plan.label}</button>}
                <button className={plan ? "" : "full"} onClick={() => setEditing("new")}>📅 {plan ? "Change just this day" : "Plan this day"}</button>
              </div>
            )}
            <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
              <label>👕 Build around something I want to wear</label>
              <select value={pinnedId ?? ""} onChange={(e) => props.onProfile({ ...profile, pinned: e.target.value ? { itemId: e.target.value, date } : undefined })}>
                <option value="">No preference</option>
                {available.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              {pinnedItem && <p className="small muted" style={{ margin: "4px 0 0" }}>Outfits include your {pinnedItem.name}.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
