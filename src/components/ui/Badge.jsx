import { cn } from "./cn";

const TONES = {
  neutral: "bg-surface-2 text-ink-2 border-line/12",
  gold: "bg-gold-50 text-gold-700 border-gold-200/70",
  green: "bg-green-50 text-green-700 border-green-100",
  danger: "bg-danger-soft text-danger border-danger/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  info: "bg-info-soft text-info border-info/20",
  ink: "bg-primary text-primary-fg border-transparent",
  outline: "bg-transparent text-ink-2 border-line/25",
};

export default function Badge({ tone = "neutral", size = "md", icon: Icon, className, children, ...rest }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium",
        size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[0.8125rem]",
        TONES[tone],
        className
      )}
      {...rest}
    >
      {Icon && <Icon size={size === "sm" ? 12 : 14} aria-hidden="true" />}
      {children}
    </span>
  );
}
