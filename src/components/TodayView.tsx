"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClothingItem, Forecast, Profile } from "@/lib/types";
import { analyzeDay, describeWeatherCode } from "@/lib/weather";
import { recommendOutfits, type OutfitRecommendation } from "@/lib/outfit";

const STATUS_LABEL = {
  good: "Good to go",
  workaround: "Works, with compromises",
  limited: "Limited protection",
  "needs-gear": "Needs proper winter gear",
} as const;

const EMOJI: Record<string, string> = { base: "👕", mid: "🧥", outer: "🧥", bottom: "👖", footwear: "👟", head: "🧢", hands: "🧤", neck: "🧣", accessory: "☂️" };

export function ItemThumb({ item }: { item: ClothingItem }) {
  // eslint-disable-next-line @next/next/no-img-element
  return item.photo ? <img className="thumb" src={item.photo} alt="" /> : <div className="thumb">{EMOJI[item.category] ?? "•"}</div>;
}

function OutfitCard({ rec, onLearn, onGoPlan, primary, explanation, onExplain, explaining, aiOnline }: {
  rec: OutfitRecommendation;
  onLearn: (k: string) => void;
  onGoPlan: () => void;
  primary?: boolean;
  explanation?: string | null;
  onExplain?: () => void;
  explaining?: boolean;
  aiOnline: boolean;
}) {
  const pct = Math.min(100, (rec.torsoWarmth / Math.max(1, rec.torsoTarget)) * 100);
  return (
    <div className="card">
      <div className="spread">
        <h2 style={{ margin: 0 }}>{rec.title}</h2>
        <span className={`pill ${rec.status}`}>{STATUS_LABEL[rec.status]}</span>
      </div>
      <p className="small muted" style={{ marginTop: 6 }}>{rec.summary}</p>
      <div className="small muted">Torso warmth {rec.torsoWarmth} of {rec.torsoTarget} needed</div>
      <div className="meter" style={{ marginBottom: 10 }}>
        <div style={{ width: `${pct}%`, background: pct >= 100 ? "var(--good)" : pct >= 75 ? "var(--caution)" : "var(--danger)" }} />
      </div>
      <div>
        {rec.picks.map((p) => (
          <div className="pick" key={`${p.slot}-${p.item.id}`}>
            <div className="slot">{p.slot}</div>
            <ItemThumb item={p.item} />
            <div>
              <div>{p.item.name}</div>
              <div className="small muted">{p.reason}</div>
            </div>
          </div>
        ))}
      </div>

      {primary && (
        <div style={{ marginTop: 10 }}>
          {explanation ? (
            <div className="card soft small">
              {explanation}
              <div className="ai-note" style={{ marginTop: 6 }}>Written by the open-weight model from the facts above. Safety status always comes from the rules.</div>
            </div>
          ) : (
            onExplain && (
              <button onClick={onExplain} disabled={explaining || !aiOnline} title={aiOnline ? "" : "Start the model server to enable explanations"}>
                {explaining ? "Thinking…" : "Explain this outfit in plain words"}
              </button>
            )
          )}
        </div>
      )}

      {rec.limitations.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h3>Limitations</h3>
          {rec.limitations.map((l, i) => (
            <div key={i} className={`alert ${l.severity}`}>
              {l.text}
              {l.gapKey && (
                <>
                  {" "}
                  <button className="link small" onClick={onGoPlan}>See what would fix this</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {rec.improvisations.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h3>Make it work with what you have</h3>
          <ul className="tight">
            {rec.improvisations.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      )}
      {primary && rec.dayPlan.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h3>Your day</h3>
          <ul className="tight">
            {rec.dayPlan.map((t) => <li key={t}>{t}</li>)}
          </ul>
          <button className="link small" onClick={() => onLearn("layering")}>Why layers?</button>
        </div>
      )}
    </div>
  );
}

export default function TodayView(props: {
  profile: Profile;
  wardrobe: ClothingItem[];
  forecast: Forecast | null;
  weatherError: string | null;
  preview: boolean;
  onTogglePreview: () => void;
  onRetry: () => void;
  onLearn: (k: string) => void;
  onGoWardrobe: () => void;
  onGoPlan: () => void;
  aiOnline: boolean;
}) {
  const { profile, wardrobe, forecast, weatherError, preview } = props;
  const analysis = useMemo(() => (forecast ? analyzeDay(forecast, profile) : null), [forecast, profile]);
  const result = useMemo(() => (analysis ? recommendOutfits(wardrobe, analysis, profile.preferences, profile.routine) : undefined), [analysis, wardrobe, profile]);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);

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
            homeClimate: profile.homeClimate,
            coldExperience: profile.coldExperience,
            routine: profile.routine,
            weather: { coldestFeelsLike: analysis.coldestFeelsLike, warmestFeelsLike: analysis.warmestFeelsLike, maxWindKmh: analysis.maxWind, rainChance: analysis.maxPrecipProbability, snow: analysis.snowExpected, alerts: analysis.alerts.map((a) => a.title) },
            outdoorSegments: analysis.segments.map((s) => ({ label: s.label, minutes: s.minutes, feelsLike: s.effectiveFeelsLike })),
            outfit: r.picks.map((p) => ({ slot: p.slot, item: p.item.name, warmth: p.item.warmth })),
            status: r.status,
            limitations: r.limitations.map((l) => l.text),
            improvisations: r.improvisations,
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

  const outdoorHours = new Set(analysis?.segments.map((s) => s.hour));
  const dayHours = forecast && analysis ? forecast.hourly.filter((h) => h.time.startsWith(analysis.date) && Number(h.time.slice(11, 13)) >= 6 && Number(h.time.slice(11, 13)) <= 22) : [];

  return (
    <div>
      <div className="spread" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{profile.name ? `Hi ${profile.name}, here's your day` : "Here's your day"}</h2>
        <button onClick={props.onTogglePreview}>{preview ? "Back to today's real forecast" : "Preview a January day"}</button>
      </div>
      {preview && <div className="alert caution">Showing a sample cold, snowy January day so you can see how your wardrobe would hold up. This is not a real forecast.</div>}

      {weatherError && !preview && (
        <div className="alert warning">
          {weatherError} <button className="link" onClick={props.onRetry}>Try again</button>
        </div>
      )}
      {!forecast && !weatherError && <div className="card muted">Loading forecast…</div>}

      {forecast && analysis && (
        <div className="card">
          <div className="spread">
            <div>
              <div className="big">{Math.round(forecast.current.temperature)}°C</div>
              <div className="muted">
                Feels like {Math.round(forecast.current.feelsLike)}°C · {describeWeatherCode(forecast.current.weatherCode)}
              </div>
            </div>
            <div className="small muted" style={{ textAlign: "right" }}>
              Wind {Math.round(forecast.current.windSpeed)} km/h · Humidity {Math.round(forecast.current.humidity)}%
              <br />
              Today {Math.round(forecast.daily[0]?.tempMin ?? 0)}° to {Math.round(forecast.daily[0]?.tempMax ?? 0)}° · UV up to {Math.round(analysis.maxUv)}
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            Hourly (outlined = when you&apos;re outside). <button className="link small" onClick={() => props.onLearn("feels-like")}>What is &quot;feels like&quot;?</button>
          </p>
          <div className="hours">
            {dayHours.map((h) => {
              const hr = Number(h.time.slice(11, 13));
              return (
                <div key={h.time} className={`hour ${outdoorHours.has(hr) ? "out" : ""}`}>
                  <div className="muted">{hr}:00</div>
                  <b>{Math.round(h.temperature)}°</b>
                  <div className="muted">feels {Math.round(h.feelsLike)}°</div>
                  {h.precipitationProbability >= 20 && <div>💧{Math.round(h.precipitationProbability)}%</div>}
                  {h.windSpeed >= 20 && <div>💨{Math.round(h.windSpeed)}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {analysis && analysis.alerts.length > 0 && (
        <div className="card">
          <h2>Heads up</h2>
          {analysis.alerts.map((a) => (
            <div key={a.id} className={`alert ${a.severity === "info" ? "" : a.severity}`}>
              <strong>{a.title}</strong>
              {a.detail}{" "}
              {a.learn && <button className="link small" onClick={() => props.onLearn(a.learn!)}>Learn more</button>}
            </div>
          ))}
        </div>
      )}

      {analysis && wardrobe.filter((i) => i.available).length === 0 && (
        <div className="card">
          <h2>Add your clothes to get an outfit</h2>
          <p>Wearly builds outfits only from what you own. Add a few items (photos or by name) to get started.</p>
          <button className="primary" onClick={props.onGoWardrobe}>Go to my wardrobe</button>
        </div>
      )}

      {result && wardrobe.some((i) => i.available) && (
        <>
          <OutfitCard rec={result.primary} primary onLearn={props.onLearn} onGoPlan={props.onGoPlan} explanation={explanation} onExplain={explain} explaining={explaining} aiOnline={props.aiOnline} />
          {result.alternatives.length > 0 && <h2>Alternatives</h2>}
          {result.alternatives.map((alt) => (
            <OutfitCard key={alt.title} rec={alt} onLearn={props.onLearn} onGoPlan={props.onGoPlan} aiOnline={props.aiOnline} />
          ))}
        </>
      )}

      {forecast && !preview && forecast.daily.length > 1 && (
        <div className="card">
          <h2>This week</h2>
          <div className="grid three">
            {forecast.daily.slice(1).map((d) => (
              <div key={d.date} className="card soft" style={{ margin: 0 }}>
                <b>{new Date(`${d.date}T12:00`).toLocaleDateString(undefined, { weekday: "long" })}</b>
                <div className="small">{describeWeatherCode(d.weatherCode)}</div>
                <div className="small muted">
                  {Math.round(d.tempMin)}° to {Math.round(d.tempMax)}° · feels as low as {Math.round(d.feelsLikeMin)}°
                </div>
                {d.precipitationProbabilityMax >= 40 && <div className="small">💧 {Math.round(d.precipitationProbabilityMax)}% chance</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
