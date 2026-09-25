import { cn } from "./cn";

const PAD = { none: "", sm: "p-4", md: "p-5 sm:p-6", lg: "p-6 sm:p-8" };
const TONE = {
  default: "bg-surface border border-line/12 shadow-sm",
  flat: "bg-surface border border-line/12",
  tint: "bg-surface-2 border border-line/8",
  gold: "bg-gold-50 border border-gold-200/60",
  green: "bg-green-50 border border-green-100",
  ink: "bg-primary text-primary-fg border border-transparent",
  outline: "bg-transparent border border-line/20",
};

/**
 * Content surface. `interactive` adds a subtle lift for clickable cards
 * (render as a link with `as={Link}` + href, or wrap in one).
 */
export default function Card({ as: Tag = "div", tone = "default", pad = "md", interactive = false, className, children, ...rest }) {
  return (
    <Tag
      className={cn(
        "relative rounded-lg",
        TONE[tone],
        PAD[pad],
        interactive && "transition-[transform,box-shadow,border-color] duration ease-out hover:-translate-y-0.5 hover:border-line/20 hover:shadow-md",
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardTitle({ as: Tag = "h3", className, children }) {
  return <Tag className={cn("t-h4", className)}>{children}</Tag>;
}

export function CardText({ className, children }) {
  return <p className={cn("t-small text-ink-3", className)}>{children}</p>;
}
