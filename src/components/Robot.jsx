// Jazira robot mascot — a real little character, not an emoji or a flat icon.
// Clearly has: antenna, head with a glowing visor + eyes, ears, torso with a
// chest light, two arms with hands, two legs with feet, and a soft ground
// shadow. Limbs are grouped so the CSS walk cycle (see globals.css .jz-robot)
// articulates the legs/arms/head — pure transforms, no JS, reduced-motion safe.
//
// `gait` tunes the step cadence per instance (seconds). Pure SVG, no hooks.
export default function Robot({ size = 22, gait = 0.82, walk = true, className = "" }) {
  const h = Math.round(size * (40 / 28));
  const uid = gaitId(gait, size);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 28 40"
      fill="none"
      className={`jz-robot ${walk ? "" : "jz-idle"} ${className}`}
      style={{ ["--gait"]: `${gait}s` }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`rbBody-${uid}`} x1="14" y1="15" x2="14" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EBD199" /><stop offset="1" stopColor="#C9A86A" />
        </linearGradient>
        <linearGradient id={`rbHead-${uid}`} x1="14" y1="5" x2="14" y2="15" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F7EEDC" /><stop offset="1" stopColor="#DcC291" />
        </linearGradient>
        <radialGradient id={`rbEye-${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop stopColor="#FFF6DC" /><stop offset="1" stopColor="#E6C77E" />
        </radialGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx="14" cy="38.4" rx="7.5" ry="1.5" fill="#8C7E66" opacity="0.16" />

      {/* legs (swing from the hips) */}
      <g className="rb-leg-a">
        <rect x="9.4" y="28" width="3.1" height="6.4" rx="1.5" fill="#B8923F" />
        <rect x="7.9" y="34.1" width="5" height="2.5" rx="1.25" fill="#8C7E66" />
      </g>
      <g className="rb-leg-b">
        <rect x="15.5" y="28" width="3.1" height="6.4" rx="1.5" fill="#B8923F" />
        <rect x="15.1" y="34.1" width="5" height="2.5" rx="1.25" fill="#8C7E66" />
      </g>

      {/* upper body (gentle walk bob) */}
      <g className="rb-upper">
        {/* arms (swing opposite the legs) */}
        <g className="rb-arm-a">
          <rect x="5.4" y="16.4" width="2.8" height="8.4" rx="1.4" fill="#B8923F" />
          <circle cx="6.8" cy="25.2" r="1.9" fill="#D9BE86" />
        </g>
        <g className="rb-arm-b">
          <rect x="19.8" y="16.4" width="2.8" height="8.4" rx="1.4" fill="#B8923F" />
          <circle cx="21.2" cy="25.2" r="1.9" fill="#D9BE86" />
        </g>

        {/* torso */}
        <rect x="8.4" y="15" width="11.2" height="13.6" rx="4.2" fill={`url(#rbBody-${uid})`} />
        <rect x="10.8" y="17.4" width="6.4" height="1.5" rx="0.75" fill="#B8923F" opacity="0.4" />
        {/* chest light */}
        <circle cx="14" cy="21.6" r="2.4" fill="#FFF3D6" />
        <circle cx="14" cy="21.6" r="1.15" fill="#E0A94B" />

        {/* head + antenna (tilts together when it "looks") */}
        <g className="rb-head">
          <line x1="14" y1="5.2" x2="14" y2="2.3" stroke="#B8923F" strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="14" cy="2.2" r="1.5" fill="#E0793B" />
          {/* ears */}
          <rect x="6.6" y="8.4" width="1.7" height="3.4" rx="0.85" fill="#C9A86A" />
          <rect x="19.7" y="8.4" width="1.7" height="3.4" rx="0.85" fill="#C9A86A" />
          {/* head shell */}
          <rect x="7.6" y="5.2" width="12.8" height="9.4" rx="4" fill={`url(#rbHead-${uid})`} />
          {/* visor */}
          <rect x="9.3" y="7.6" width="9.4" height="4.4" rx="2.2" fill="#463A2B" />
          <circle cx="11.7" cy="9.8" r="1.05" fill={`url(#rbEye-${uid})`} />
          <circle cx="16.3" cy="9.8" r="1.05" fill={`url(#rbEye-${uid})`} />
        </g>
      </g>
    </svg>
  );
}

// Stable-ish id so multiple robots on one page don't clash gradient ids.
function gaitId(gait, size) {
  return `${Math.round(gait * 100)}x${size}`;
}
