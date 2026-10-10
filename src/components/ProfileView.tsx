"use client";

import { useState } from "react";
import type { Profile, Routine, Preferences } from "@/lib/types";

export function CitySearch({ value, onPick }: { value: string; onPick: (city: string, lat: number, lon: number) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ name: string; latitude: number; longitude: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const search = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setResults(json.results ?? []);
      if (!json.results?.length) setErr(json.error ? "City search is unavailable right now." : "No matches. Try just the city name.");
    } catch {
      setErr("City search is unavailable right now.");
    }
    setBusy(false);
  };

  return (
    <div className="field">
      <label>Your city</label>
      <p className="small muted">Currently: {value}</p>
      <div className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Toronto, Montréal, Calgary" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} style={{ flex: 1, minWidth: 180 }} />
        <button type="button" onClick={search} disabled={busy || q.trim().length < 2}>
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
      {err && <p className="small muted">{err}</p>}
      {results.length > 0 && (
        <ul className="clean" style={{ marginTop: 8 }}>
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <button type="button" className="link" onClick={() => (onPick(r.name, r.latitude, r.longitude), setResults([]), setQ(""))}>
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const hours = Array.from({ length: 24 }, (_, i) => i);

export function RoutineFields({ routine, onChange }: { routine: Routine; onChange: (r: Routine) => void }) {
  const set = <K extends keyof Routine>(k: K, v: Routine[K]) => onChange({ ...routine, [k]: v });
  return (
    <div className="grid two">
      <div className="field">
        <label>How do you usually get around?</label>
        <select value={routine.commuteMode} onChange={(e) => set("commuteMode", e.target.value as Routine["commuteMode"])}>
          <option value="transit">Public transit (walking + waiting at stops)</option>
          <option value="walk">Walking</option>
          <option value="bike">Biking</option>
          <option value="car">Car (short walks to and from parking)</option>
          <option value="none">I mostly stay home</option>
        </select>
      </div>
      <div className="field">
        <label>Minutes outside each way (walking + waiting): {routine.commuteOutdoorMinutes}</label>
        <input type="range" min={0} max={90} step={5} value={routine.commuteOutdoorMinutes} onChange={(e) => set("commuteOutdoorMinutes", Number(e.target.value))} />
      </div>
      <div className="field">
        <label>Leave home at</label>
        <select value={routine.leaveHour} onChange={(e) => set("leaveHour", Number(e.target.value))}>
          {hours.map((h) => <option key={h} value={h}>{`${h}:00`}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Head home at</label>
        <select value={routine.returnHour} onChange={(e) => set("returnHour", Number(e.target.value))}>
          {hours.map((h) => <option key={h} value={h}>{`${h}:00`}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Other time outside during the day (minutes): {routine.middayOutdoorMinutes}</label>
        <input type="range" min={0} max={180} step={5} value={routine.middayOutdoorMinutes} onChange={(e) => set("middayOutdoorMinutes", Number(e.target.value))} />
        <p className="small muted">Walking between classes or buildings, lunch outside, errands.</p>
      </div>
      <div className="field">
        <label>Where do you spend most of the day?</label>
        <select value={routine.indoorEnvironment} onChange={(e) => set("indoorEnvironment", e.target.value as Routine["indoorEnvironment"])}>
          <option value="heated">Heated classroom or office</option>
          <option value="air-conditioned">Air-conditioned space</option>
          <option value="variable">Mixed / moving around</option>
          <option value="outdoors-job">Outside (outdoor job)</option>
        </select>
      </div>
      <div className="field">
        <label>Times you go in and out per day: {routine.transitionsPerDay}</label>
        <input type="range" min={1} max={12} value={routine.transitionsPerDay} onChange={(e) => set("transitionsPerDay", Number(e.target.value))} />
      </div>
    </div>
  );
}

export function PreferenceFields({ prefs, onChange }: { prefs: Preferences; onChange: (p: Preferences) => void }) {
  const labels: Record<string, string> = { "-2": "I run very warm", "-1": "I run a bit warm", "0": "Average", "1": "I get cold easily", "2": "I'm always cold" };
  return (
    <div className="grid two">
      <div className="field">
        <label>How do you handle cold? {labels[String(prefs.coldSensitivity)]}</label>
        <input type="range" min={-2} max={2} value={prefs.coldSensitivity} onChange={(e) => onChange({ ...prefs, coldSensitivity: Number(e.target.value) })} />
      </div>
      <div className="field">
        <label>Style</label>
        <select value={prefs.style} onChange={(e) => onChange({ ...prefs, style: e.target.value as Preferences["style"] })}>
          <option value="casual">Casual</option>
          <option value="smart">Smart / office</option>
          <option value="sporty">Sporty</option>
          <option value="any">No preference</option>
        </select>
      </div>
      <div className="field row">
        <input id="bulk" type="checkbox" checked={prefs.dislikesBulk} onChange={(e) => onChange({ ...prefs, dislikesBulk: e.target.checked })} />
        <label htmlFor="bulk" style={{ margin: 0 }}>I don&apos;t like bulky layers</label>
      </div>
    </div>
  );
}

export default function ProfileView({ profile, onChange, onReset }: { profile: Profile; onChange: (p: Profile) => void; onReset: () => void }) {
  return (
    <div>
      <div className="card">
        <h2>Where you are</h2>
        <CitySearch value={profile.city} onPick={(city, latitude, longitude) => onChange({ ...profile, city, latitude, longitude })} />
      </div>
      <div className="card">
        <h2>Your daily routine</h2>
        <p className="muted small">A 5-minute walk to a heated classroom needs very different clothes from waiting 20 minutes for a bus.</p>
        <RoutineFields routine={profile.routine} onChange={(routine) => onChange({ ...profile, routine })} />
      </div>
      <div className="card">
        <h2>Comfort and style</h2>
        <PreferenceFields prefs={profile.preferences} onChange={(preferences) => onChange({ ...profile, preferences })} />
      </div>
      <div className="card">
        <h2>Budget</h2>
        <div className="field">
          <label>How much can you spend on clothes right now? (CAD)</label>
          <input type="number" min={0} step={10} value={profile.budgetCad} onChange={(e) => onChange({ ...profile, budgetCad: Math.max(0, Number(e.target.value) || 0) })} />
        </div>
      </div>
      <button onClick={onReset}>Reset everything</button>
    </div>
  );
}
