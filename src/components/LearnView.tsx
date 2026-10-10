"use client";

import { useEffect, useRef } from "react";
import { CONCEPTS } from "@/lib/education";

export default function LearnView({ focus }: { focus: string | null }) {
  const refs = useRef<Record<string, HTMLDetailsElement | null>>({});
  useEffect(() => {
    if (focus) refs.current[focus]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  return (
    <div>
      <h2>Weather basics</h2>
      <p className="small muted">Short explainers for Canadian weather, in every season.</p>
      {CONCEPTS.map((c) => (
        <details key={c.key} ref={(el) => { refs.current[c.key] = el; }} open={focus === c.key} className="card">
          <summary style={{ color: "var(--text)" }}>
            <b>{c.title}</b>
            <div className="small muted">{c.short}</div>
          </summary>
          <div className="small" style={{ marginTop: 8 }}>
            {c.body.map((b) => <p key={b}>{b}</p>)}
          </div>
        </details>
      ))}
    </div>
  );
}
