"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClothingItem, Forecast, Profile } from "@/lib/types";
import { loadState, saveState } from "@/lib/storage";
import { DEFAULT_PROFILE, winterPreview } from "@/lib/sample";
import Onboarding from "./Onboarding";
import TodayView from "./TodayView";
import WardrobeView from "./WardrobeView";
import ProfileView from "./ProfileView";
import PlanView from "./PlanView";
import LearnView from "./LearnView";

type Tab = "today" | "wardrobe" | "plan" | "profile" | "learn";
const TABS: [Tab, string][] = [
  ["today", "Today"],
  ["wardrobe", "My wardrobe"],
  ["plan", "Gaps & budget"],
  ["profile", "My routine"],
  ["learn", "Learn"],
];

export interface AiStatus {
  online: boolean;
  visionModel: string;
  textModel: string;
}

export default function WearlyApp() {
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>([]);
  const [tab, setTab] = useState<Tab>("today");
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [learnKey, setLearnKey] = useState<string | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);

  useEffect(() => {
    const s = loadState();
    setProfile(s.profile);
    setWardrobe(s.wardrobe);
    setLoaded(true);
    fetch("/api/ai-status").then((r) => r.json()).then(setAi).catch(() => setAi(null));
  }, []);

  useEffect(() => {
    if (loaded) saveState({ profile, wardrobe });
  }, [loaded, profile, wardrobe]);

  const loadWeather = useCallback(async () => {
    setWeatherError(null);
    try {
      const res = await fetch(`/api/weather?lat=${profile.latitude}&lon=${profile.longitude}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Weather unavailable");
      setForecast(json);
    } catch (e) {
      setWeatherError((e as Error).message);
    }
  }, [profile.latitude, profile.longitude]);

  useEffect(() => {
    if (loaded && profile.onboarded) loadWeather();
  }, [loaded, profile.onboarded, loadWeather]);

  const activeForecast = useMemo(() => (preview ? winterPreview() : forecast), [preview, forecast]);

  const openLearn = (key: string) => {
    setLearnKey(key);
    setTab("learn");
  };

  if (!loaded) return <div className="shell muted">Loading…</div>;

  if (!profile.onboarded) {
    return (
      <div className="shell">
        <Onboarding
          initial={profile}
          onDone={(p, sample) => {
            setProfile({ ...p, onboarded: true });
            if (sample) setWardrobe(sample);
            setTab(sample ? "today" : "wardrobe");
          }}
        />
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          Wear<span>ly</span>
        </div>
        <div className="row small muted">
          <span>{profile.city}</span>
          <span className={`pill ${ai?.online ? "good" : ""}`} title={ai ? `Vision: ${ai.visionModel}` : ""}>
            AI {ai?.online ? `on (${ai.visionModel})` : "offline: rules only"}
          </span>
        </div>
      </div>
      <nav className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "today" && (
        <TodayView
          profile={profile}
          wardrobe={wardrobe}
          forecast={activeForecast}
          weatherError={weatherError}
          preview={preview}
          onTogglePreview={() => setPreview((v) => !v)}
          onRetry={loadWeather}
          onLearn={openLearn}
          onGoWardrobe={() => setTab("wardrobe")}
          onGoPlan={() => setTab("plan")}
          aiOnline={Boolean(ai?.online)}
        />
      )}
      {tab === "wardrobe" && <WardrobeView wardrobe={wardrobe} onChange={setWardrobe} aiOnline={Boolean(ai?.online)} />}
      {tab === "plan" && <PlanView profile={profile} wardrobe={wardrobe} forecast={activeForecast} onBudget={(b) => setProfile({ ...profile, budgetCad: b })} onLearn={openLearn} aiOnline={Boolean(ai?.online)} />}
      {tab === "profile" && (
        <ProfileView
          profile={profile}
          onChange={setProfile}
          onReset={() => {
            if (confirm("Clear your profile and wardrobe from this device?")) {
              setProfile(DEFAULT_PROFILE);
              setWardrobe([]);
            }
          }}
        />
      )}
      {tab === "learn" && <LearnView profile={profile} focus={learnKey} />}

      <p className="small muted" style={{ marginTop: 24 }}>
        Weather from <a href="https://open-meteo.com/">Open-Meteo</a>. Outfit safety, budgets and prices come from explicit rules and data; the open-weight model only recognises clothing photos and writes explanations.
      </p>
    </div>
  );
}
