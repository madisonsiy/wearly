"use client";

import { useEffect, useRef } from "react";
import type { Profile } from "@/lib/types";
import { CONCEPTS, onboardingAdvice } from "@/lib/education";

export default function LearnView({ profile, focus }: { profile: Profile; focus: string | null }) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (focus) refs.current[focus]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  return (
    <div>
      <div className="card soft">
        <h2>Getting used to Canadian weather</h2>
        {onboardingAdvice(profile).map((t) => <p key={t}>{t}</p>)}
      </div>
      {CONCEPTS.map((c) => (
        <div key={c.key} ref={(el) => { refs.current[c.key] = el; }} className="card" style={focus === c.key ? { outline: "2px solid var(--accent)" } : undefined}>
          <h2>{c.title}</h2>
          <p><b>{c.short}</b></p>
          {c.body.map((b) => <p key={b}>{b}</p>)}
        </div>
      ))}
    </div>
  );
}
