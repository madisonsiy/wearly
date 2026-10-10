"use client";

import { useState } from "react";
import type { ClothingItem, Profile } from "@/lib/types";
import { sampleWardrobe } from "@/lib/sample";
import { CitySearch, ComfortChips } from "./ProfileView";
import Logo from "./Logo";

export default function Onboarding({ initial, onDone }: { initial: Profile; onDone: (p: Profile, sample?: ClothingItem[]) => void }) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(initial);

  return (
    <div className="onboard">
      <div className="head">
        <Logo />
        <p className="muted" style={{ margin: "6px 0 0" }}>What to wear today, with the clothes you own.</p>
      </div>
      <div className="meter" style={{ marginBottom: 16 }}>
        <div style={{ width: `${((step + 1) / 3) * 100}%` }} />
      </div>

      {step === 0 && (
        <div className="card" key="s0">
          <h2>What&apos;s your name?</h2>
          <input autoFocus value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Name" onKeyDown={(e) => e.key === "Enter" && setStep(1)} />
        </div>
      )}
      {step === 1 && (
        <div className="card" key="s1">
          <h2>Anything we should know?</h2>
          <p className="small muted">Pick any that fit. You can change these later.</p>
          <ComfortChips prefs={p.preferences} onChange={(preferences) => setP({ ...p, preferences })} />
        </div>
      )}
      {step === 2 && (
        <div className="card" key="s2">
          <h2>Where are you?</h2>
          <CitySearch value={p.city} onPick={(city, latitude, longitude) => setP({ ...p, city, latitude, longitude })} />
        </div>
      )}

      <div className="spread">
        {step > 0 ? <button onClick={() => setStep(step - 1)}>Back</button> : <span />}
        {step < 2 ? (
          <button className="primary" onClick={() => setStep(step + 1)}>Next</button>
        ) : (
          <button className="primary" onClick={() => onDone(p)}>Start</button>
        )}
      </div>
      {step === 2 && (
        <button className="link small" style={{ marginTop: 18, alignSelf: "center" }} onClick={() => onDone(p, sampleWardrobe())}>
          Just exploring? Start with a sample closet
        </button>
      )}
    </div>
  );
}
