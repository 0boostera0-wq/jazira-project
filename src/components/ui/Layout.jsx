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
 * Standard in-app page header — the one place page titles are composed.
 *
 *   <PageHeader eyebrow title description actions />               default
 *   <PageHeader … media={<Illustration id="…" plate />} />          split hero (media at the inline end, lg+)
 *   <PageHeader … variant="card" stats={<StatList …/>} />          card hero (tinted surface)
 *   <PageHeader … variant="compact" />                              workspace pages (assistant, chat)
 *
 * Slots: `breadcrumbs`, `eyebrow`, `meta` (chips next to the eyebrow, e.g. the
 * school year), `title` (always the page's single <h1>), `description`,
 * `actions`, `stats` (under the text), `media` (illustration; `mediaOnMobile`
 * shows it below lg too). `aside` is the legacy name for `media`.
 * Rhythm is fixed: eyebrow → title mt-2, title max 24ch, lead mt-2.5.
 */
export function PageHeader({
  variant = "default",
  breadcrumbs,
  eyebrow,
  meta,
  title,
  description,
  actions,
  stats,
  media,
  aside,
  mediaOnMobile = false,
  className,
}) {
  const art = media ?? aside;
  const compact = variant === "compact";
  return (
    <header
      className={cn(
        "relative",
        compact ? "mb-4 sm:mb-5" : "mb-6 sm:mb-8",
        variant === "card" && "surface-tint p-5 sm:p-7",
        className
      )}
    >
      {breadcrumbs && <div className="mb-3">{breadcrumbs}</div>}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          {(eyebrow || meta) && (
            <div className="flex flex-wrap items-center gap-2">
              {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
              {meta}
            </div>
          )}
          <h1 className={cn(compact ? "t-h3" : "t-h1", "max-w-[24ch]", (eyebrow || meta) && "mt-2")}>{title}</h1>
          {description && <p className={cn(compact ? "t-small mt-1 text-ink-3" : "t-lead mt-2.5")}>{description}</p>}
          {stats && <div className="mt-5">{stats}</div>}
          {actions && <div className="mt-5 flex flex-wrap gap-2.5">{actions}</div>}
        </div>
        {art && <div className={cn("shrink-0", !mediaOnMobile && "hidden lg:block", "lg:w-[38%] lg:max-w-md")}>{art}</div>}
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
