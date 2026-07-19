// Jazira island centerpiece — a fixed, premium palm-island brand mark.
// A real sand island base with a soil band + grass, and a stronger palm above
// it. Fully static (the island never moves — only the robot mascots do). Pure
// SVG, no hooks, aria-hidden.
export default function IslandMark({ size = 48, className = "" }) {
  const s = size / 48; // viewBox is 48 wide
  const h = Math.round(48 * s);
  const uid = String(size);
  return (
    <svg
      width={Math.round(48 * s)}
      height={h}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`isSand-${uid}`} x1="24" y1="33" x2="24" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F4E6BE" /><stop offset="1" stopColor="#D8BE86" />
        </linearGradient>
        <linearGradient id={`isTrunk-${uid}`} x1="21" y1="16" x2="27" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A9854C" /><stop offset="1" stopColor="#6E4F2C" />
        </linearGradient>
        <linearGradient id={`isLeafG-${uid}`} x1="12" y1="6" x2="24" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8FB268" /><stop offset="1" stopColor="#5E8543" />
        </linearGradient>
        <linearGradient id={`isLeafY-${uid}`} x1="36" y1="6" x2="24" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E6C77E" /><stop offset="1" stopColor="#C9A227" />
        </linearGradient>
      </defs>

      {/* water ring + ripples */}
      <ellipse cx="24" cy="43.5" rx="21" ry="3" fill="#CFE3DD" opacity="0.45" />
      <path d="M10 44.4c3 1 25 1 28 0" stroke="#A9CBC2" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />

      {/* sand island */}
      <path
        d="M8 40c0-4.8 7-6.3 16-6.3S40 35.2 40 40c0 2.5-7 3.6-16 3.6S8 42.5 8 40Z"
        fill={`url(#isSand-${uid})`}
      />
      {/* soil band + shading */}
      <path d="M11 38.4c3.3-2 22.7-2 26 0" stroke="#B79A63" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      {/* grass tufts around the base */}
      <path d="M18 34.6l-.9-2.4M20 34.4l.2-2.6M27.8 34.5l1-2.4M30 34.8l-.1-2.3" stroke="#6F9A57" strokeWidth="1.1" strokeLinecap="round" />

      {/* palm trunk — stronger, gently curved */}
      <path
        d="M22.6 34.4c-1-6 .3-11 2.1-15 .5-1.1 2-.6 1.7.6-1.4 4.4-2 8.9-1.5 14.2 .1 1.3-2.1 1.4-2.3.2Z"
        fill={`url(#isTrunk-${uid})`}
      />

      {/* palm canopy — lush fronds radiating from the crown */}
      <g>
        {/* left greens */}
        <path d="M25 17C19 13 12 12 7 14c5-.2 10 1.5 16 5Z" fill={`url(#isLeafG-${uid})`} />
        <path d="M25 17C21 11 14 8 9 8c4 2 9 5 14 11Z" fill={`url(#isLeafG-${uid})`} />
        {/* right golds */}
        <path d="M25 17c6-4 13-5 18-3-5-.2-10 1.5-16 5Z" fill={`url(#isLeafY-${uid})`} transform="translate(2 0)" />
        <path d="M25 17c4-6 11-9 16-9-4 2-9 5-14 11Z" fill={`url(#isLeafY-${uid})`} transform="translate(2 0)" />
        {/* center crown */}
        <path d="M25 17c0-5 2-9 5-11-1 3-1 7-2 12Z" fill={`url(#isLeafY-${uid})`} />
        <path d="M25 17c-1-5-3-8-6-10 2 3 3 6 4 11Z" fill={`url(#isLeafG-${uid})`} />
        {/* coconuts */}
        <circle cx="24" cy="17.4" r="1.5" fill="#7A5A34" />
        <circle cx="26.6" cy="18" r="1.2" fill="#8B6A3E" />
        {/* crown highlight */}
        <circle cx="25" cy="16.4" r="0.9" fill="#FFF3D6" opacity="0.7" />
      </g>
    </svg>
  );
}
