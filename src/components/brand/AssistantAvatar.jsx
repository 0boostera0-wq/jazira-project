import { cn } from "@/components/ui/cn";
import { BRAND_COLORS } from "./geometry";

/**
 * Jazira Assistant's avatar: the golden guiding light of the assistant scenes
 * (a warm pearl with its halo) on the brand teal — the same gold as the island
 * in the Jazira mark. Branding is always "مساعد جزيرة" / "Jazira Assistant"
 * (common.brand.assistant); the AI provider is an internal implementation
 * detail and is NEVER named in the interface.
 * Inline SVG: crisp at any size, no request. `status="thinking"` adds a soft pulse ring.
 */
export default function AssistantAvatar({ size = 40, status, className, alt = "" }) {
  return (
    <span className={cn("relative inline-block shrink-0 rounded-full", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" width={size} height={size} className="block h-full w-full" role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
        <circle cx="20" cy="20" r="20" fill={BRAND_COLORS.teal} />
        <circle cx="20" cy="20" r="13.5" fill="none" stroke={BRAND_COLORS.ivory} strokeOpacity="0.16" strokeWidth="1.5" />
        <circle cx="20" cy="20" r="10" fill={BRAND_COLORS.gold} fillOpacity="0.28" />
        <circle cx="20" cy="20" r="7" fill={BRAND_COLORS.gold} />
        <circle cx="17.6" cy="17.6" r="2.4" fill="#F4E4B8" />
        <path d="M30 7.2l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" fill={BRAND_COLORS.ivory} fillOpacity="0.85" />
      </svg>
      {status === "thinking" && (
        <span aria-hidden="true" className="absolute -inset-1 rounded-full ring-2 ring-gold-300/70" style={{ animation: "jz-pulse-soft 1.4s ease-in-out infinite" }} />
      )}
    </span>
  );
}
