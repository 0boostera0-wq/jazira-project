"use client";

import { useMemo } from "react";

// Lightweight animated starfield.
// Pure CSS (box-shadow stars + twinkle/drift) — no canvas, no per-frame JS.
// Subtle in light mode, luminous in dark mode (controlled via globals.css).
function buildShadow(count, spread) {
  let out = "";
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * spread);
    const y = Math.floor(Math.random() * spread);
    if (i) out += ", ";
    out += `${x}px ${y}px`;
  }
  return out;
}

export default function Starfield() {
  // Generate three depth layers once per mount.
  const layers = useMemo(() => {
    const spread = 2000;
    return [
      { shadow: buildShadow(90, spread), size: 1, dur: 90, twinkle: 4 },
      { shadow: buildShadow(45, spread), size: 2, dur: 130, twinkle: 6 },
      { shadow: buildShadow(20, spread), size: 3, dur: 180, twinkle: 9 },
    ];
  }, []);

  return (
    <div
      className="jz-starfield pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: -1 }}
      aria-hidden="true"
    >
      {layers.map((layer, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: `${layer.size}px`,
            height: `${layer.size}px`,
            borderRadius: "50%",
            background: "transparent",
            boxShadow: layer.shadow,
            color: "#f3e6bd",
            animation: `jz-drift ${layer.dur}s linear infinite, jz-twinkle ${layer.twinkle}s ease-in-out infinite`,
          }}
        >
          {/* Duplicate offset copy so drift loops seamlessly */}
          <div
            style={{
              position: "absolute",
              top: "2000px",
              left: 0,
              width: `${layer.size}px`,
              height: `${layer.size}px`,
              borderRadius: "50%",
              boxShadow: layer.shadow,
            }}
          />
        </div>
      ))}
    </div>
  );
}
