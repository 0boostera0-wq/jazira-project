import { cn } from "./cn";

/** Page-width wrapper with responsive gutters. `wide` for dashboards/editorial bleeds. */
export function Container({ wide = false, className, children, ...rest }) {
  return (
    <div className={cn(wide ? "container-wide" : "container-jz", className)} {...rest}>
      {children}
    </div>
  );
}

/** Vertical rhythm for marketing/editorial sections. */
export function Section({ as: Tag = "section", size = "md", tone, className, children, ...rest }) {
  return (
    <Tag
      className={cn(
        size === "sm" ? "section-y-sm" : size === "none" ? "" : "section-y",
        tone === "tint" && "bg-surface-2/60",
        tone === "aura" && "bg-aura",
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Section heading block: eyebrow · title · description · actions.
 * align="center" for marketing intros; default is start-aligned (RTL-aware).
 */
export function SectionHeader({ eyebrow, title, description, actions, align = "start", as: H = "h2", size = "h2", className, id }) {
  const centered = align === "center";
  return (
    <div className={cn("flex flex-col gap-3", centered ? "items-center text-center" : "sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className={cn("max-w-2xl", centered && "mx-auto")}>
        {eyebrow && <p className="t-eyebrow mb-2.5">{eyebrow}</p>}
        <H id={id} className={size === "h1" ? "t-h1" : size === "h3" ? "t-h3" : "t-h2"}>{title}</H>
        {description && <p className={cn("t-lead mt-3", centered && "mx-auto")}>{description}</p>}
      </div>
      {actions && <div className={cn("flex shrink-0 flex-wrap gap-2", centered && "justify-center")}>{actions}</div>}
    </div>
  );
}

/**
 * Standard in-app page header: breadcrumbs slot, title, description, actions,
 * and an optional illustration on the opposite side (hidden on small screens).
 */
export function PageHeader({ breadcrumbs, eyebrow, title, description, actions, aside, className }) {
  return (
    <header className={cn("relative mb-6 sm:mb-8", className)}>
      {breadcrumbs && <div className="mb-3">{breadcrumbs}</div>}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          {eyebrow && <p className="t-eyebrow mb-2">{eyebrow}</p>}
          <h1 className="t-h1">{title}</h1>
          {description && <p className="t-lead mt-2.5">{description}</p>}
          {actions && <div className="mt-5 flex flex-wrap gap-2.5">{actions}</div>}
        </div>
        {aside && <div className="hidden shrink-0 lg:block">{aside}</div>}
      </div>
    </header>
  );
}

/** Responsive auto-fit grid. min = minimum card width in px. */
export function Grid({ min = 260, gap = "gap-4 sm:gap-5", className, children }) {
  return (
    <div className={cn("grid", gap, className)} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))` }}>
      {children}
    </div>
  );
}
