// Very faint island/palm illustration for the chat window background.
// Pure decoration: low opacity, pointer-events none, sits behind the messages.
export default function IslandBackdrop() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 400 560"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      style={{ opacity: 0.1 }}
    >
      <defs>
        <linearGradient id="islandSand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E6C77E" />
          <stop offset="100%" stopColor="#C9A86A" />
        </linearGradient>
      </defs>

      {/* Sun */}
      <circle cx="320" cy="80" r="34" fill="#E6C77E" />

      {/* Sea waves */}
      {[420, 445, 470].map((y, i) => (
        <path
          key={y}
          d={`M0 ${y} q 25 -10 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0`}
          stroke="#C9A86A"
          strokeWidth="2"
          fill="none"
          opacity={0.5 - i * 0.1}
        />
      ))}

      {/* Sand island */}
      <ellipse cx="200" cy="540" rx="220" ry="60" fill="url(#islandSand)" />

      {/* Palm trees */}
      {[
        { x: 120, s: 1 },
        { x: 290, s: 0.8 },
      ].map((p) => (
        <g key={p.x} transform={`translate(${p.x},505) scale(${p.s})`}>
          <path d="M0 0 q -6 -55 4 -95" stroke="#9C7A32" strokeWidth="7" fill="none" strokeLinecap="round" />
          {[-1, -0.5, 0, 0.5, 1].map((dir, i) => (
            <path
              key={i}
              d={`M4 -95 q ${dir * 45} ${-18 - Math.abs(dir) * 6} ${dir * 70} ${10 - Math.abs(dir) * 4}`}
              stroke="#7C9A6A"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
            />
          ))}
          {/* coconuts */}
          <circle cx="2" cy="-90" r="5" fill="#9C7A32" />
          <circle cx="10" cy="-88" r="5" fill="#9C7A32" />
        </g>
      ))}
    </svg>
  );
}
