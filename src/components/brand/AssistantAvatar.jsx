/* eslint-disable @next/next/no-img-element */
import { cn } from "@/components/ui/cn";

/**
 * The Jazira assistant mascot as a circular avatar. Branding is always
 * "مساعد جزيرة" / "Jazira Assistant" (common.brand.assistant) — the AI provider is an internal
 * implementation detail and is NEVER named in the interface.
 * `status="thinking"` adds a soft pulse ring.
 */
export default function AssistantAvatar({ size = 40, status, className, alt = "", loading = "lazy" }) {
  return (
    <span className={cn("relative inline-block shrink-0 rounded-full", className)} style={{ width: size, height: size }}>
      <img
        src="/images/brand/assistant-mascot.svg"
        width={size}
        height={size}
        alt={alt}
        loading={loading}
        decoding="async"
        className="h-full w-full rounded-full"
        draggable={false}
      />
      {status === "thinking" && (
        <span aria-hidden="true" className="absolute -inset-1 rounded-full ring-2 ring-gold-300/70" style={{ animation: "jz-pulse-soft 1.4s ease-in-out infinite" }} />
      )}
    </span>
  );
}
