import { cn } from "./cn";

export default function Spinner({ size = 18, className, label }) {
  return (
    <span role={label ? "status" : undefined} aria-label={label} className={cn("inline-flex", className)}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: "jz-spin 0.8s linear infinite" }}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
