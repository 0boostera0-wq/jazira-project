import { Lock } from "lucide-react";
import { cn } from "@/components/ui/cn";

const SIZES = {
  sm: { box: "h-10 w-10", icon: 18, lock: "h-4 w-4", lockIcon: 9 },
  md: { box: "h-14 w-14", icon: 24, lock: "h-5 w-5", lockIcon: 11 },
};

/**
 * A badge's medallion: warm gold coin when unlocked, quiet sand disc with a
 * small lock when not. Decorative — the badge name/state is always in text.
 */
export default function BadgeMedal({ icon: Icon, unlocked = false, size = "md", className }) {
  const s = SIZES[size] || SIZES.md;
  return (
    <span aria-hidden="true" className={cn("relative inline-grid shrink-0 place-items-center rounded-full", s.box, className)}>
      <span
        className={cn(
          "absolute inset-0 rounded-full",
          unlocked
            ? "bg-gradient-to-b from-gold-200 to-gold-300 shadow-gold ring-1 ring-inset ring-gold-400/50"
            : "bg-surface-2 ring-1 ring-inset ring-line/15"
        )}
      />
      {unlocked && <span className="absolute inset-[3px] rounded-full ring-1 ring-inset ring-white/50" />}
      <Icon size={s.icon} className={cn("relative", unlocked ? "text-gold-800" : "text-ink-4")} strokeWidth={unlocked ? 2 : 1.75} />
      {!unlocked && (
        <span className={cn("absolute -bottom-0.5 -end-0.5 grid place-items-center rounded-full bg-surface text-ink-3 ring-1 ring-line/15", s.lock)}>
          <Lock size={s.lockIcon} strokeWidth={2.25} />
        </span>
      )}
    </span>
  );
}
