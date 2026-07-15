// Upgraded premium robot character — head with visor, chest light, arms with
// hands, legs with feet. Pure SVG (no hooks) so it stays cheap to render.
// The island/tree emoji stays as the brand mark; these are the companions.
export default function Robot({ size = 22, className = "" }) {
  const h = Math.round(size * (34 / 24));
  return (
    <svg width={size} height={h} viewBox="0 0 24 34" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="rb-body" x1="12" y1="8" x2="12" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E6C77E" /><stop offset="1" stopColor="#C9A86A" />
        </linearGradient>
        <linearGradient id="rb-head" x1="12" y1="2" x2="12" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5EBD9" /><stop offset="1" stopColor="#D4B984" />
        </linearGradient>
      </defs>
      {/* antenna */}
      <line x1="12" y1="3.5" x2="12" y2="0.8" stroke="#B8923F" strokeWidth="1" strokeLinecap="round" />
      <circle cx="12" cy="0.9" r="1.35" fill="#E0793B" />
      {/* legs + feet */}
      <rect x="8" y="26.5" width="3" height="5" rx="1.5" fill="#B8923F" />
      <rect x="13" y="26.5" width="3" height="5" rx="1.5" fill="#B8923F" />
      <rect x="6.8" y="30.5" width="4.6" height="2.2" rx="1.1" fill="#8C7E66" />
      <rect x="12.6" y="30.5" width="4.6" height="2.2" rx="1.1" fill="#8C7E66" />
      {/* arms + hands */}
      <rect x="3.4" y="13" width="2.7" height="9" rx="1.35" fill="#B8923F" />
      <circle cx="4.75" cy="22.4" r="1.7" fill="#D4B984" />
      <rect x="17.9" y="13" width="2.7" height="9" rx="1.35" fill="#B8923F" />
      <circle cx="19.25" cy="22.4" r="1.7" fill="#D4B984" />
      {/* body */}
      <rect x="6" y="12" width="12" height="16" rx="4" fill="url(#rb-body)" />
      <rect x="9" y="14.5" width="6" height="1.4" rx="0.7" fill="#B8923F" opacity="0.45" />
      {/* chest light */}
      <circle cx="12" cy="19.5" r="2.2" fill="#FFF3D6" />
      <circle cx="12" cy="19.5" r="1.05" fill="#E0A94B" />
      {/* head + visor */}
      <rect x="6.5" y="3.6" width="11" height="8.6" rx="3.6" fill="url(#rb-head)" />
      <rect x="8" y="6.1" width="8" height="3.7" rx="1.85" fill="#4A3F2F" />
      <circle cx="10.2" cy="7.95" r="0.95" fill="#E6C77E" />
      <circle cx="13.8" cy="7.95" r="0.95" fill="#E6C77E" />
    </svg>
  );
}
