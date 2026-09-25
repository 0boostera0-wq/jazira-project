import { cn } from "./cn";

const TONES = {
  gold: "bg-gold-50 text-gold-600 ring-gold-200/60",
  green: "bg-green-50 text-green-600 ring-green-100",
  neutral: "bg-surface-2 text-ink-2 ring-line/10",
  info: "bg-info-soft text-info ring-info/15",
  danger: "bg-danger-soft text-danger ring-danger/15",
  ink: "bg-primary text-primary-fg ring-transparent",
};
const SIZES = { sm: ["h-9 w-9 rounded-sm", 18], md: ["h-11 w-11 rounded-md", 20], lg: ["h-14 w-14 rounded-lg", 26] };

/** A lucide icon on a soft tinted tile. `color` (hex) overrides the tone for subject colours. */
export default function IconTile({ icon: Icon, tone = "gold", size = "md", color, className }) {
  const [box, px] = SIZES[size];
  const style = color ? { backgroundColor: `${color}1A`, color, "--tw-ring-color": `${color}33` } : undefined;
  return (
    <span className={cn("inline-grid shrink-0 place-items-center ring-1 ring-inset", box, !color && TONES[tone], className)} style={style}>
      {Icon && <Icon size={px} aria-hidden="true" />}
    </span>
  );
}
