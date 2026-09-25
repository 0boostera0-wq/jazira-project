/* eslint-disable @next/next/no-img-element */
import { avatarInitial } from "@/lib/profile";
import { cn } from "@/components/ui/cn";

// Shared avatar: the image when present, otherwise the first letter on a soft
// champagne disc. Server-safe. `alt` should be the person's name when the
// avatar is the only identifier; pass alt="" when the name is shown next to it.
export default function Avatar({ src, name, size = 44, alt, ring = false, className }) {
  const dim = { width: size, height: size };
  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? name ?? ""}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        style={dim}
        className={cn("shrink-0 rounded-full bg-surface-2 object-cover", ring && "ring-2 ring-gold-200 ring-offset-2 ring-offset-surface", className)}
      />
    );
  }
  return (
    <span
      role={alt || name ? "img" : undefined}
      aria-label={alt ?? name ?? undefined}
      style={{ ...dim, fontSize: Math.max(12, size * 0.4) }}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-b from-gold-100 to-gold-200 font-bold text-gold-700",
        ring && "ring-2 ring-gold-200 ring-offset-2 ring-offset-surface",
        className
      )}
    >
      {avatarInitial(name)}
    </span>
  );
}
