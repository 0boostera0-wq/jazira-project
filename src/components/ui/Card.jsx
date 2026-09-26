import { cn } from "./cn";
import IconTile from "./IconTile";

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
 *
 * Titled card (the "section card" pattern — dashboard panels, history cards,
 * settings groups): pass `title` and the card renders a <section> labelled by
 * its heading, with optional `eyebrow`, `description`, `icon` (IconTile,
 * `iconTone`) and `action` (link/button at the inline end).
 *   <Card title={t("x.title")} titleId="x-title" action={<PanelLink …/>}>…</Card>
 * `titleAs` sets the heading level (default "h2"; visual size is t-h4).
 * `divided` puts the header on its own bordered row and leaves the body
 * unpadded (for lists of rows with their own padding, like settings).
 */
export default function Card({
  as,
  tone = "default",
  pad = "md",
  interactive = false,
  title,
  titleAs: Heading = "h2",
  titleId,
  eyebrow,
  description,
  icon,
  iconTone = "gold",
  action,
  divided = false,
  bodyClassName,
  className,
  children,
  ...rest
}) {
  const Tag = as || (title ? "section" : "div");
  const surface = cn(
    "relative rounded-lg",
    TONE[tone],
    interactive && "transition-[transform,box-shadow,border-color] duration ease-out hover:-translate-y-0.5 hover:border-line/20 hover:shadow-md",
    className
  );

  if (!title) {
    return (
      <Tag className={cn(surface, PAD[pad])} {...rest}>
        {children}
      </Tag>
    );
  }

  const header = (
    <div className={cn("flex gap-3.5", eyebrow || description ? "items-start" : "items-center", divided && cn("border-b border-line/10", PAD[pad === "none" ? "md" : pad], "py-4"))}>
      {icon && <IconTile icon={icon} tone={iconTone} size="sm" className={description ? "mt-0.5" : undefined} />}
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="t-eyebrow mb-1">{eyebrow}</p>}
        <Heading id={titleId} className="t-h4">{title}</Heading>
        {description && <p className="t-small mt-0.5 text-ink-3">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );

  return (
    <Tag aria-labelledby={titleId} className={cn(surface, !divided && PAD[pad], divided && "overflow-hidden")} {...rest}>
      {header}
      <div className={cn(divided ? "" : "mt-4", bodyClassName)}>{children}</div>
    </Tag>
  );
}
