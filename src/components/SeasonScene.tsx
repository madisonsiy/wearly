"use client";

import { useEffect, useMemo, useState } from "react";
import type { Season } from "@/lib/season";

// Animated seasonal backdrops: beach waves (summer), cherry blossoms (spring),
// maple leaves (fall) and snowfall (winter). Pure SVG + CSS, no images.

function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function particles(n: number, seed: number) {
  return Array.from({ length: n }, (_, i) => ({
    left: rand(seed + i) * 100,
    delay: -rand(seed + i * 7) * 12,
    duration: 7 + rand(seed + i * 13) * 7,
    size: 0.6 + rand(seed + i * 17) * 0.9,
    sway: 20 + rand(seed + i * 23) * 50,
    hue: rand(seed + i * 29),
  }));
}

const MAPLE =
  "M12 1l1.6 4.4 3-1.6-.8 4.6 4.2-1.2-2.2 3.6 3.2 1.4-4.6 2.4.8 2-4-.8.4 4.2h-1.2l.4-4.2-4 .8.8-2-4.6-2.4 3.2-1.4-2.2-3.6 4.2 1.2-.8-4.6 3 1.6z";

function Tree({ x, scale, crown, flip }: { x: number; scale: number; crown: string[]; flip?: boolean }) {
  return (
    <g transform={`translate(${x} 300) scale(${flip ? -scale : scale} ${scale})`}>
      <path d="M-6 0 L-4 -70 Q-20 -95 -38 -100 M-4 -70 Q8 -98 30 -108 M-4 -60 L4 -60 L6 0 Z" stroke="#7a5a4a" strokeWidth="8" strokeLinecap="round" fill="#7a5a4a" />
      {[
        [-40, -110, 34], [0, -128, 40], [36, -112, 32], [-18, -150, 30], [22, -150, 28], [-58, -128, 22], [56, -130, 22],
      ].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={crown[i % crown.length]} className="crown" style={{ animationDelay: `${-i * 0.7}s` }} />
      ))}
    </g>
  );
}

export default function SeasonScene({ season, compact = false }: { season: Season; compact?: boolean }) {
  const count = compact ? 14 : 34;
  const ps = useMemo(() => particles(count, season.length * 11), [count, season]);
  // Particles only render in the browser so server and client HTML always match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className={`scene scene-${season} ${compact ? "compact" : ""}`} aria-hidden>
      <svg className="scene-art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice">
        {season === "summer" && (
          <>
            <circle cx="300" cy="80" r="34" className="sun" />
            <rect x="0" y="170" width="400" height="80" fill="#9fd8d8" />
            <g className="waves w1"><path d="M0 180 q25 -10 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 V300 H0Z" fill="#b7e4e1" /></g>
            <g className="waves w2"><path d="M0 200 q25 -10 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 V300 H0Z" fill="#cdeee9" /></g>
            <g className="waves w3"><path d="M0 222 q25 -8 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 V300 H0Z" fill="#fbf3e3" opacity="0.9" /></g>
            <path d="M0 240 Q200 222 400 236 V300 H0Z" fill="#f4e2c4" />
          </>
        )}
        {season === "spring" && (
          <>
            <path d="M0 270 Q200 245 400 268 V300 H0Z" fill="#cfe3c8" />
            <Tree x={95} scale={1} crown={["#f7c6d3", "#f3b2c4", "#fbd9e2"]} />
            <Tree x={315} scale={0.85} crown={["#f3b2c4", "#fbd9e2", "#f7c6d3"]} flip />
          </>
        )}
        {season === "fall" && (
          <>
            <path d="M0 270 Q200 248 400 270 V300 H0Z" fill="#e8c9a0" />
            <Tree x={95} scale={1} crown={["#e9946a", "#f0b27a", "#d9744f"]} />
            <Tree x={315} scale={0.85} crown={["#f0b27a", "#e3a35a", "#e9946a"]} flip />
          </>
        )}
        {season === "winter" && (
          <>
            <path d="M0 250 Q120 225 230 248 T400 240 V300 H0Z" fill="#eef3fb" />
            <path d="M0 268 Q160 250 400 266 V300 H0Z" fill="#ffffff" />
            {[85, 320].map((x, i) => (
              <g key={x} transform={`translate(${x} ${250 - i * 4})`}>
                <path d="M0 -70 L22 -20 H10 L28 10 H-28 L-10 -20 H-22Z" fill="#c9d8ea" />
                <rect x="-4" y="10" width="8" height="12" fill="#a6b7cc" />
              </g>
            ))}
          </>
        )}
      </svg>

      <div className="particles">
        {mounted && ps.map((p, i) => (
          <span
            key={i}
            className={`particle p-${season}`}
            style={{
              left: `${p.left.toFixed(2)}%`,
              animationDelay: `${p.delay.toFixed(2)}s, ${p.delay.toFixed(2)}s`,
              animationDuration: `${p.duration.toFixed(2)}s, ${(p.duration / 3).toFixed(2)}s`,
              ["--s" as string]: p.size.toFixed(2),
              ["--sway" as string]: `${p.sway.toFixed(1)}px`,
            }}
          >
            {season === "fall" && (
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path d={MAPLE} fill={p.hue < 0.33 ? "#d9744f" : p.hue < 0.66 ? "#e9a04f" : "#c95c3c"} />
              </svg>
            )}
          </span>
        ))}
        {season === "summer" && !compact && [0, 1, 2].map((i) => <span key={`g${i}`} className="gull" style={{ top: `${14 + i * 7}%`, animationDelay: `${-i * 4}s` }}>︶</span>)}
      </div>
    </div>
  );
}
