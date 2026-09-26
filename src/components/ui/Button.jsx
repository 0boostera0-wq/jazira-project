import { forwardRef } from "react";
import {
  ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, LogIn, LogOut, Reply, Send, SendHorizontal, TrendingDown, TrendingUp,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import Spinner from "./Spinner";
import { cn } from "./cn";

// Buttons are pills. Use exactly one `primary` (or `gold` for premium/marketing
// moments) per view; everything else is secondary / ghost.
const VARIANTS = {
  primary: "bg-primary text-primary-fg shadow-sm hover:bg-primary/90",
  gold: "bg-gradient-to-b from-gold-300 to-gold-400 text-[#261F14] shadow-gold hover:brightness-105",
  secondary: "bg-surface text-ink border border-line/20 shadow-xs hover:bg-surface-2 hover:border-line/30",
  soft: "bg-gold-50 text-gold-700 hover:bg-gold-100",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger text-danger-fg shadow-sm hover:bg-danger/90",
  link: "text-gold-600 hover:underline underline-offset-4 !h-auto !px-0 !rounded-none",
};

const SIZES = {
  sm: "h-9 px-4 text-sm gap-1.5",
  md: "h-11 px-5 text-[0.9375rem] gap-2",
  lg: "h-12 px-7 text-base gap-2.5",
  icon: "h-10 w-10 p-0",
  "icon-sm": "h-8 w-8 p-0",
};

// Glyphs that encode reading direction. Whether passed as iconStart or iconEnd
// they are mirrored in RTL (a paper plane, a door arrow or a trend line must
// point the way the text flows). Pass flipStart={false} to opt out.
const DIRECTIONAL = new Set([ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, LogIn, LogOut, Reply, Send, SendHorizontal, TrendingDown, TrendingUp]);

export function buttonClasses({ variant = "primary", size = "md", block = false, className } = {}) {
  return cn(
    "relative inline-flex select-none items-center justify-center whitespace-nowrap rounded-full font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform,filter] duration-fast ease-out",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    block && "w-full",
    className
  );
}

/**
 * <Button>Save</Button>                        — button
 * <Button href="/exams">Start</Button>         — locale-aware link styled as a button
 * <Button href="https://…" external>           — external link (new tab, noopener)
 * <Button loading>…</Button>                   — spinner + aria-busy, blocks clicks
 * Props: variant, size, block, iconStart, iconEnd (lucide components)
 * `iconEnd` is mirrored in RTL (arrows point the reading direction); so is a
 * directional `iconStart` (Send, LogIn/LogOut, Trending*, arrows) — override
 * with `flipStart`.
 */
const Button = forwardRef(function Button(
  { href, external, variant, size, block, loading, iconStart: IconStart, iconEnd: IconEnd, flipStart, className, children, disabled, type = "button", ...rest },
  ref
) {
  const iconSize = size === "sm" || size === "icon-sm" ? 16 : 18;
  const mirrorStart = flipStart ?? DIRECTIONAL.has(IconStart);
  const content = (
    <>
      {loading ? <Spinner size={iconSize} /> : IconStart && <IconStart size={iconSize} aria-hidden="true" className={mirrorStart ? "flip-rtl" : undefined} />}
      {children}
      {IconEnd && !loading && <IconEnd size={iconSize} aria-hidden="true" className="flip-rtl" />}
    </>
  );
  const classes = buttonClasses({ variant, size, block, className });

  if (href) {
    if (external) {
      return (
        <a ref={ref} href={href} className={classes} target="_blank" rel="noopener noreferrer" {...rest}>
          {content}
        </a>
      );
    }
    return (
      <Link ref={ref} href={href} className={classes} aria-disabled={disabled || undefined} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});

export default Button;
