"use client";

import { useState } from "react";
import type { Plan, Preferences, Profile, Routine } from "@/lib/types";
import { DEFAULT_ROUTINE } from "@/lib/sample";

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

  const locate = () => {
    if (!navigator.geolocation) return setErr("Location isn't available on this device.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPick("Current location", pos.coords.latitude, pos.coords.longitude);
        setBusy(false);
      },
      () => {
        setErr("Couldn't get your location. Search for your city instead.");
        setBusy(false);
      },
      { timeout: 10000 },
    );
  };

  return (
    <div className="field">
      <p className="small muted">Now: {value}</p>
      <button type="button" className="full" onClick={locate} disabled={busy} style={{ marginBottom: 8 }}>
        📍 Use my location
      </button>
      <div className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Or search a city" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} style={{ flex: 1, minWidth: 140 }} />
        <button type="button" onClick={search} disabled={busy || q.trim().length < 2}>Search</button>
      </div>
      {err && <p className="small muted">{err}</p>}
      {results.length > 0 && (
        <ul className="clean" style={{ marginTop: 8 }}>
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`} style={{ padding: "6px 0" }}>
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

/** Tap-to-toggle comfort preferences. */
export function ComfortChips({ prefs, onChange }: { prefs: Preferences; onChange: (p: Preferences) => void }) {
  const chips: [string, boolean, () => Preferences][] = [
    ["🥶 I get cold easily", prefs.coldSensitivity > 0, () => ({ ...prefs, coldSensitivity: prefs.coldSensitivity > 0 ? 0 : 1 })],
    ["🔥 I run warm", prefs.coldSensitivity < 0, () => ({ ...prefs, coldSensitivity: prefs.coldSensitivity < 0 ? 0 : -1 })],
    ["💦 I sweat easily", prefs.sweatsEasily, () => ({ ...prefs, sweatsEasily: !prefs.sweatsEasily })],
    ["🧥 No bulky layers", prefs.dislikesBulk, () => ({ ...prefs, dislikesBulk: !prefs.dislikesBulk })],
    ["☀️ Sensitive to sun", prefs.sunSensitive, () => ({ ...prefs, sunSensitive: !prefs.sunSensitive })],
  ];
  return (
    <div className="chips">
      {chips.map(([label, on, next]) => (
        <button key={label} type="button" className={`chip ${on ? "on" : ""}`} onClick={() => onChange(next())}>
          {label}
        </button>
      ))}
    </div>
  );
}

const hours = Array.from({ length: 24 }, (_, i) => i);

export function RoutineFields({ routine, onChange }: { routine: Routine; onChange: (r: Routine) => void }) {
  const set = <K extends keyof Routine>(k: K, v: Routine[K]) => onChange({ ...routine, [k]: v });
  return (
    <>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Leave</label>
          <select value={routine.leaveHour} onChange={(e) => set("leaveHour", Number(e.target.value))}>
            {hours.map((h) => <option key={h} value={h}>{`${h}:00`}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Back home</label>
          <select value={routine.returnHour} onChange={(e) => set("returnHour", Number(e.target.value))}>
            {hours.map((h) => <option key={h} value={h}>{`${h}:00`}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Getting around</label>
        <select value={routine.commuteMode} onChange={(e) => set("commuteMode", e.target.value as Routine["commuteMode"])}>
          <option value="transit">Transit (walking + waiting)</option>
          <option value="walk">Walking</option>
          <option value="bike">Biking</option>
          <option value="car">Car</option>
          <option value="none">Staying home</option>
        </select>
      </div>
      <div className="field">
        <label>Outside each way: {routine.commuteOutdoorMinutes} min</label>
        <input type="range" min={0} max={90} step={5} value={routine.commuteOutdoorMinutes} onChange={(e) => set("commuteOutdoorMinutes", Number(e.target.value))} />
      </div>
      <div className="field">
        <label>Other time outside: {routine.middayOutdoorMinutes} min</label>
        <input type="range" min={0} max={240} step={5} value={routine.middayOutdoorMinutes} onChange={(e) => set("middayOutdoorMinutes", Number(e.target.value))} />
      </div>
      <div className="field">
        <label>Mostly indoors at</label>
        <select value={routine.indoorEnvironment} onChange={(e) => set("indoorEnvironment", e.target.value as Routine["indoorEnvironment"])}>
          <option value="heated">Heated class or office</option>
          <option value="air-conditioned">Air-conditioned space</option>
          <option value="variable">Mixed</option>
          <option value="outdoors-job">Outside (outdoor work)</option>
        </select>
      </div>
    </>
  );
}

const PRESETS: [string, number[]][] = [
  ["Every day", [0, 1, 2, 3, 4, 5, 6]],
  ["Weekdays", [1, 2, 3, 4, 5]],
  ["Weekends", [0, 6]],
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Monday first, the way most calendars in Canada show the week. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const shortDate = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function describeSchedule(plan: Plan): string {
  const s = plan.schedule;
  if (s.kind === "date") {
    return new Date(`${s.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  const sorted = WEEK_ORDER.filter((d) => s.days.includes(d));
  const preset = PRESETS.find(([, d]) => [...d].sort().join() === [...s.days].sort().join());
  const every = s.every ?? 1;
  const parts = [preset ? preset[0] : sorted.map((d) => DAY_NAMES[d]).join(", ")];
  if (every > 1) parts.push(`every ${every} weeks`);
  if (s.start && s.start > new Date().toLocaleDateString("en-CA")) parts.push(`from ${shortDate(s.start)}`);
  if (s.until) parts.push(`until ${shortDate(s.until)}`);
  return parts.join(" · ");
}

/** Create or edit a plan for one date, or for any days of the week at any weekly frequency. */
export function PlanEditor({ plan, defaultDate, onSave, onDelete, onClose }: {
  plan?: Plan;
  defaultDate: string;
  onSave: (p: Plan) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Plan>(
    plan ?? { ...DEFAULT_ROUTINE, id: `plan_${Date.now().toString(36)}`, label: "", schedule: { kind: "date", date: defaultDate } },
  );
  const sched = draft.schedule;
  const weekly = sched.kind === "weekly" ? sched : { kind: "weekly" as const, days: [] as number[], every: 1, start: defaultDate, until: undefined as string | undefined };
  const days = weekly.days;
  const setWeekly = (patch: Partial<typeof weekly>) =>
    setDraft({ ...draft, schedule: { ...weekly, ...patch, kind: "weekly", days: [...(patch.days ?? days)].sort() } });

  return (
    <div>
      <div className="field">
        <label>Name</label>
        <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Class days, Work, Interview" />
      </div>
      <div className="field">
        <label>When</label>
        <div className="chips" style={{ marginTop: 0 }}>
          <button type="button" className={`chip ${sched.kind === "date" ? "on" : ""}`} onClick={() => setDraft({ ...draft, schedule: { kind: "date", date: defaultDate } })}>One day</button>
          <button type="button" className={`chip ${sched.kind === "weekly" ? "on" : ""}`} onClick={() => setWeekly({ days: days.length ? days : [new Date(`${defaultDate}T12:00`).getDay()], start: weekly.start ?? defaultDate })}>Repeats</button>
        </div>
      </div>
      {sched.kind === "date" ? (
        <div className="field">
          <input type="date" value={sched.date} onChange={(e) => e.target.value && setDraft({ ...draft, schedule: { kind: "date", date: e.target.value } })} />
        </div>
      ) : (
        <>
          <div className="field">
            <label>On these days</label>
            <div className="daypick">
              {WEEK_ORDER.map((i) => (
                <button key={i} type="button" className={days.includes(i) ? "on" : ""} aria-pressed={days.includes(i)} aria-label={DAY_NAMES[i]} onClick={() => setWeekly({ days: days.includes(i) ? days.filter((x) => x !== i) : [...days, i] })}>
                  {DAY_NAMES[i]}
                </button>
              ))}
            </div>
            <div className="chips">
              {PRESETS.map(([label, d]) => (
                <button key={label} type="button" className="chip" onClick={() => setWeekly({ days: d })}>{label}</button>
              ))}
              {days.length > 0 && <button type="button" className="chip" onClick={() => setWeekly({ days: [] })}>Clear</button>}
            </div>
          </div>
          <div className="grid two">
            <div className="field">
              <label>How often</label>
              <select value={weekly.every ?? 1} onChange={(e) => setWeekly({ every: Number(e.target.value), start: weekly.start ?? defaultDate })}>
                <option value={1}>Every week</option>
                <option value={2}>Every 2 weeks</option>
                <option value={3}>Every 3 weeks</option>
                <option value={4}>Every 4 weeks</option>
              </select>
            </div>
            <div className="field">
              <label>Starting</label>
              <input type="date" value={weekly.start ?? defaultDate} onChange={(e) => e.target.value && setWeekly({ start: e.target.value })} />
            </div>
            <div className="field">
              <label>Ends (optional)</label>
              <input type="date" value={weekly.until ?? ""} min={weekly.start} onChange={(e) => setWeekly({ until: e.target.value || undefined })} />
            </div>
          </div>
          {days.length > 0 && <p className="small muted" style={{ marginTop: -4 }}>Repeats: {describeSchedule({ ...draft, schedule: weekly })}.</p>}
        </>
      )}
      <RoutineFields routine={draft} onChange={(r) => setDraft({ ...draft, ...r })} />
      <div className="row" style={{ marginTop: 4 }}>
        <button className="primary" disabled={sched.kind === "weekly" && days.length === 0} onClick={() => (onSave({ ...draft, label: draft.label.trim() || (sched.kind === "date" ? "Plan" : "Routine") }), onClose())}>Save</button>
        <button onClick={onClose}>Cancel</button>
        {onDelete && <button className="link small" onClick={() => (onDelete(), onClose())}>Delete</button>}
      </div>
    </div>
  );
}

export function upsertPlan(profile: Profile, plan: Plan): Profile {
  const plans = profile.plans.some((p) => p.id === plan.id) ? profile.plans.map((p) => (p.id === plan.id ? plan : p)) : [...profile.plans, plan];
  return { ...profile, plans };
}

export default function SettingsView({ profile, today, onChange, onReset, ai }: {
  profile: Profile;
  today: string;
  onChange: (p: Profile) => void;
  onReset: () => void;
  ai: { online: boolean; visionModel: string } | null;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div>
      <h2>Settings</h2>
      <div className="card">
        <h3>Name</h3>
        <input value={profile.name} onChange={(e) => onChange({ ...profile, name: e.target.value })} placeholder="Your name" />
      </div>
      <div className="card">
        <h3>Location</h3>
        <CitySearch value={profile.city} onPick={(city, latitude, longitude) => onChange({ ...profile, city, latitude, longitude })} />
      </div>
      <div className="card">
        <h3>Comfort</h3>
        <ComfortChips prefs={profile.preferences} onChange={(preferences) => onChange({ ...profile, preferences })} />
      </div>
      <div className="card">
        <h3>Plans and routines</h3>
        <p className="small muted">Optional. Without a plan, Wearly dresses you for the whole day. Set one for a single date or for any days of the week.</p>
        {profile.plans.map((p) =>
          editing === p.id ? (
            <div key={p.id} className="card soft">
              <PlanEditor plan={p} defaultDate={today} onSave={(np) => onChange(upsertPlan(profile, np))} onDelete={() => onChange({ ...profile, plans: profile.plans.filter((x) => x.id !== p.id) })} onClose={() => setEditing(null)} />
            </div>
          ) : (
            <div key={p.id} className="fix">
              <span className="dot" />
              <div className="small" style={{ flex: 1 }}>
                <b>{p.label}</b> · {describeSchedule(p)}
                <div className="muted">Out {p.leaveHour}:00 to {p.returnHour}:00, about {p.commuteOutdoorMinutes} min outside each way</div>
              </div>
              <button className="link small" onClick={() => setEditing(p.id)}>Edit</button>
            </div>
          ),
        )}
        {editing === "new" ? (
          <div className="card soft">
            <PlanEditor defaultDate={today} onSave={(np) => onChange(upsertPlan(profile, np))} onClose={() => setEditing(null)} />
          </div>
        ) : (
          <button className="full" style={{ marginTop: 8 }} onClick={() => setEditing("new")}>Add a plan</button>
        )}
      </div>
      <div className="card">
        <h3>AI model</h3>
        <p className="small">{ai?.online ? `Connected: ${ai.visionModel}` : "Not connected. Photo recognition needs the model server running."}</p>
        {!ai?.online && (
          <p className="small muted">
            On your computer: install Ollama, run <code>ollama pull qwen2.5vl:7b</code>, then restart the app. See the README for a hosted option.
          </p>
        )}
      </div>
      <button className="full" onClick={onReset}>Reset everything</button>
    </div>
  );
}
