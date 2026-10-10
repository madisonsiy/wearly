"use client";

import { useState } from "react";
import type { ClothingItem, Profile } from "@/lib/types";
import { onboardingAdvice, CONCEPTS } from "@/lib/education";
import { sampleWardrobe } from "@/lib/sample";
import { CitySearch, PreferenceFields, RoutineFields } from "./ProfileView";

const STEPS = ["Welcome", "Where you're from", "Where you live", "Your day", "Comfort & budget", "Ready"];

export default function Onboarding({ initial, onDone }: { initial: Profile; onDone: (p: Profile, sample?: ClothingItem[]) => void }) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(initial);
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="card" style={{ maxWidth: 720, margin: "24px auto" }}>
      <p className="small muted">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </p>
      <div className="meter" style={{ marginBottom: 16 }}>
        <div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      {step === 0 && (
        <>
          <h1>
            Welcome to Wear<span style={{ color: "var(--accent)" }}>ly</span>
          </h1>
          <p>Canadian weather can change a lot in one day. Wearly helps you answer three questions:</p>
          <ul className="tight">
            <li><b>What should I wear today?</b> Based on the real forecast and your actual day.</li>
            <li><b>How can I make it work with what I own?</b> We use your clothes first, and we&apos;re honest when they aren&apos;t enough.</li>
            <li><b>What should I buy, if anything?</b> Only what matters most, within your budget.</li>
          </ul>
          <div className="field">
            <label>What should we call you? (optional)</label>
            <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h2>What climate are you used to?</h2>
          <p className="muted small">Optional. It helps us explain things at the right level. Everyone is different, so we won&apos;t assume anything else.</p>
          <div className="field">
            <select value={p.homeClimate ?? "unsure"} onChange={(e) => setP({ ...p, homeClimate: e.target.value as Profile["homeClimate"] })}>
              <option value="unsure">Prefer not to say</option>
              <option value="tropical">Hot and humid all year (e.g. Philippines, Nigeria, India&apos;s coast, Brazil)</option>
              <option value="arid">Hot and dry (e.g. Middle East, North Africa)</option>
              <option value="temperate">Mild winters (e.g. UK, southern Europe, much of China)</option>
              <option value="cold">Cold, snowy winters (e.g. Russia, Northern Europe, Northern China)</option>
            </select>
          </div>
          <div className="field">
            <label>Have you lived through a winter with snow before?</label>
            <select value={p.coldExperience} onChange={(e) => setP({ ...p, coldExperience: e.target.value as Profile["coldExperience"] })}>
              <option value="none">No, this is my first</option>
              <option value="some">A little</option>
              <option value="lots">Yes, many</option>
            </select>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h2>Where do you live now?</h2>
          <CitySearch value={p.city} onPick={(city, latitude, longitude) => setP({ ...p, city, latitude, longitude })} />
        </>
      )}

      {step === 3 && (
        <>
          <h2>What does a normal day look like?</h2>
          <p className="muted small">We dress you for the parts of the day you&apos;re actually outside, not just the temperature at one moment.</p>
          <RoutineFields routine={p.routine} onChange={(routine) => setP({ ...p, routine })} />
        </>
      )}

      {step === 4 && (
        <>
          <h2>Comfort and budget</h2>
          <PreferenceFields prefs={p.preferences} onChange={(preferences) => setP({ ...p, preferences })} />
          <div className="field">
            <label>How much could you spend on clothes right now, if needed? (CAD)</label>
            <input type="number" min={0} step={10} value={p.budgetCad} onChange={(e) => setP({ ...p, budgetCad: Math.max(0, Number(e.target.value) || 0) })} />
            <p className="small muted">It&apos;s fine to put 0. We&apos;ll always start with what you already own.</p>
          </div>
        </>
      )}

      {step === 5 && (
        <>
          <h2>{p.name ? `You're all set, ${p.name}` : "You're all set"}</h2>
          {onboardingAdvice(p).map((t) => (
            <p key={t}>{t}</p>
          ))}
          <div className="card soft">
            <h3>Three ideas that make Canadian weather easier</h3>
            {CONCEPTS.filter((c) => ["feels-like", "layering", "wind-chill"].includes(c.key)).map((c) => (
              <p key={c.key} className="small">
                <b>{c.title}:</b> {c.short}
              </p>
            ))}
          </div>
          <p>Next, tell us what clothes you have. You can snap photos or add items by name.</p>
        </>
      )}

      <div className="spread" style={{ marginTop: 16 }}>
        <button onClick={back} disabled={step === 0}>
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button className="primary" onClick={next}>
            Next
          </button>
        ) : (
          <div className="row">
            <button onClick={() => onDone(p, sampleWardrobe())}>Try with a sample wardrobe</button>
            <button className="primary" onClick={() => onDone(p)}>
              Add my clothes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
