"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClothingItem, Forecast, Profile } from "@/lib/types";
import { loadState, saveState } from "@/lib/storage";
import { DEFAULT_PROFILE, PREVIEWS, type PreviewKind } from "@/lib/sample";
import { GARMENT_PRESETS } from "@/lib/garments";
import { seasonFor, type Season } from "@/lib/season";
import Onboarding from "./Onboarding";
import TodayView from "./TodayView";
import WardrobeView from "./WardrobeView";
import SettingsView from "./ProfileView";
import PlanView from "./PlanView";
import LearnView from "./LearnView";
import SeasonScene from "./SeasonScene";
import Logo from "./Logo";

type Tab = "today" | "closet" | "shop" | "learn" | "settings";

const ICONS: Record<Tab, React.ReactNode> = {
  today: <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />,
  closet: <path d="M12 6a2 2 0 1 1 2 2c-1 0-2 .7-2 1.7V11L3 17.5a1 1 0 0 0 .6 1.8h16.8a1 1 0 0 0 .6-1.8L12 11" />,
  shop: <path d="M6 7h12l1 13H5L6 7zM9 7a3 3 0 0 1 6 0" />,
  learn: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15zM4 20.5A2.5 2.5 0 0 0 6.5 23H20M8 8h8M8 12h6" />,
  settings: <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />,
};
const TABS: [Tab, string][] = [
  ["today", "Today"],
  ["closet", "Closet"],
  ["shop", "Shop"],
  ["learn", "Learn"],
  ["settings", "Settings"],
];

export interface AiStatus {
  online: boolean;
  visionModel: string;
  textModel: string;
}

function Splash({ season, out }: { season: Season; out: boolean }) {
  return (
    <div className={`splash ${out ? "out" : ""}`}>
      <SeasonScene season={season} />
      <div className="splash-center">
        <Logo />
        <p>What to wear today, with the clothes you own.</p>
        <div className="dots"><i /><i /><i /></div>
      </div>
    </div>
  );
}

export default function WearlyApp() {
  const [loaded, setLoaded] = useState(false);
  const [splash, setSplash] = useState<"in" | "out" | "gone">("in");
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>([]);
  const [tab, setTab] = useState<Tab>("today");
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewKind | null>(null);
  const [learnKey, setLearnKey] = useState<string | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);

  useEffect(() => {
    const s = loadState();
    setProfile(s.profile);
    setWardrobe(s.wardrobe);
    setLoaded(true);
    fetch("/api/ai-status").then((r) => r.json()).then(setAi).catch(() => setAi(null));
    const t1 = setTimeout(() => setSplash("out"), 2400);
    const t2 = setTimeout(() => setSplash("gone"), 3100);
    return () => (clearTimeout(t1), clearTimeout(t2));
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

  const activeForecast = useMemo(() => (preview ? PREVIEWS[preview].make() : forecast), [preview, forecast]);
  const today = forecast?.daily[0]?.date ?? new Date().toLocaleDateString("en-CA");
  const season: Season = seasonFor(activeForecast?.daily[0]?.date ?? today);

  // The seasonal palette follows the day being shown, including previews.
  useEffect(() => {
    document.documentElement.dataset.season = season;
  }, [season]);

  const go = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openLearn = (key: string) => {
    setLearnKey(key);
    go("learn");
  };

  const splashEl = splash !== "gone" && <Splash season={season} out={splash === "out"} />;

  if (!loaded) return <Splash season={season} out={false} />;

  if (!profile.onboarded) {
    return (
      <>
        {splashEl}
        <SeasonScene season={season} />
        <div className="shell">
          <Onboarding
            initial={profile}
            onDone={(p, sample) => {
              setProfile({ ...p, onboarded: true });
              if (sample) setWardrobe(sample);
              setTab("today");
            }}
          />
        </div>
      </>
    );
  }

  const tabIndex = TABS.findIndex(([k]) => k === tab);

  return (
    <>
      {splashEl}
      <datalist id="garment-types">
        {GARMENT_PRESETS.map((p) => <option key={p.subtype} value={p.subtype} />)}
      </datalist>
      <div className="shell">
        <header className="appbar">
          <span />
          <Logo />
          <button className="link loc" onClick={() => go("settings")} title="Change location">📍 {profile.city.split(",")[0]}</button>
        </header>

        <main key={tab} className="page">
          {tab === "today" && (
            <TodayView
              profile={profile}
              wardrobe={wardrobe}
              forecast={activeForecast}
              weatherError={weatherError}
              preview={preview}
              season={season}
              onPreview={setPreview}
              onRetry={loadWeather}
              onLearn={openLearn}
              onGoCloset={() => go("closet")}
              onGoShop={() => go("shop")}
              onProfile={setProfile}
              aiOnline={Boolean(ai?.online)}
            />
          )}
          {tab === "closet" && <WardrobeView wardrobe={wardrobe} onChange={setWardrobe} aiOnline={Boolean(ai?.online)} profile={profile} forecast={activeForecast} />}
          {tab === "shop" && <PlanView profile={profile} wardrobe={wardrobe} forecast={forecast} onProfile={setProfile} onLearn={openLearn} aiOnline={Boolean(ai?.online)} />}
          {tab === "learn" && <LearnView focus={learnKey} />}
          {tab === "settings" && (
            <SettingsView
              profile={profile}
              today={today}
              onChange={setProfile}
              ai={ai}
              onReset={() => {
                if (confirm("Clear your profile and closet from this device?")) {
                  setProfile(DEFAULT_PROFILE);
                  setWardrobe([]);
                }
              }}
            />
          )}
        </main>
      </div>

      <nav className="bottomnav" aria-label="Main">
        <div className="inner">
          <span className="indicator" style={{ transform: `translateX(${tabIndex * 100}%)` }} />
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? "active" : ""} onClick={() => go(k)} aria-current={tab === k ? "page" : undefined}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {ICONS[k]}
              </svg>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
