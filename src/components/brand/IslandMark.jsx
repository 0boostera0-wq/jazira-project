import { useId } from "react";

/**
 * The Jazira mark: an island (growth) carrying an open book (education) from
 * which a sprout rises, a spark above (intelligence) and waves below
 * (exploration) — on a champagne-gold tile. Pure inline SVG, crisp from 16px up.
 * Mirrors public/icon.svg (favicon) — keep them in sync.
 */
export default function IslandMark({ size = 36, className, title }) {
  const uid = useId().replace(/:/g, "");
  const g = `jzm-g-${uid}`;
  const s = `jzm-s-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={g} x1="8" y1="2" x2="40" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#E9D3A0" />
          <stop offset="0.55" stopColor="#CFA85E" />
          <stop offset="1" stopColor="#A87E36" />
        </linearGradient>
        <linearGradient id={s} x1="24" y1="28" x2="24" y2="37" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4F7A5E" />
          <stop offset="1" stopColor="#2F4D3A" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${g})`} />
      <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="12.25" fill="none" stroke="#FFF6E2" strokeOpacity="0.45" strokeWidth="1.5" />
      {/* waves */}
      <path d="M9 39.5c2.2-1.6 4.4-1.6 6.6 0s4.4 1.6 6.6 0 4.4-1.6 6.6 0 4.4 1.6 6.6 0 3.3-1.2 4.6-.6" fill="none" stroke="#FFF8EA" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.9" />
      {/* island */}
      <path d="M10.5 35.5c3.6-5.6 23.4-5.6 27 0z" fill={`url(#${s})`} />
      {/* open book */}
      <path d="M24 31.2c-3.2-2.1-6.9-2.6-10.6-1.7v-4.9c3.7-1 7.4-.5 10.6 1.6z" fill="#FFF8EA" />
      <path d="M24 31.2c3.2-2.1 6.9-2.6 10.6-1.7v-4.9c-3.7-1-7.4-.5-10.6 1.6z" fill="#F3E6C8" />
      <path d="M24 26.2v5" stroke="#A87E36" strokeWidth="1" strokeLinecap="round" />
      {/* sprout */}
      <path d="M24 26.4V17.6" stroke="#2F4D3A" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M24 22.2c-1.1-3.4-4-5.1-7.4-4.7.5 3.3 3.6 5.4 7.4 4.7z" fill="#5E8C6A" />
      <path d="M24 19.6c1-3.7 4.1-5.9 7.9-5.4-.4 3.6-3.8 6-7.9 5.4z" fill="#4F7A5E" />
      {/* spark */}
      <path d="M36 8.2l1.05 2.75 2.75 1.05-2.75 1.05L36 15.8l-1.05-2.75-2.75-1.05 2.75-1.05z" fill="#FFF8EA" />
    </svg>
  );
}
