import Illustration from "./Illustration";
import { cn } from "./cn";

// Per variant: when the title moves from the card under the band onto the image
// (lg for the full-bleed site band; xl for the app column, which is only
// tablet-wide until then), the band sizes, and what the image must cover.
// Band heights are a banner on small screens; with the panel on the image they
// are a minimum — band and panel share one grid cell, so a long title or lead
// makes the band taller instead of spilling out of it.
const V = {
  site: {
    grid: "lg:grid",
    cell: "lg:[grid-area:1/1]",
    band: "h-[16.5rem] sm:h-[21rem] md:h-[24rem] lg:h-auto lg:min-h-[clamp(25rem,38vw,36rem)]",
    scrim: "lg:bg-none lg:from-[#06201c]/80 lg:via-[#06201c]/35 lg:to-transparent lg:ltr:bg-gradient-to-r lg:rtl:bg-gradient-to-l",
    wrap: "lg:pointer-events-none lg:flex lg:items-center lg:pb-[4.5rem] lg:pt-10 lg:[grid-area:1/1]",
    inner: "container-jz",
    card: "lg:max-w-[min(36rem,50%)] lg:pointer-events-auto lg:mt-0 lg:rounded-lg lg:border-[#D9C08A]/50 lg:bg-[#071d1a]/25 lg:p-8 lg:shadow-none lg:backdrop-blur-[3px] xl:p-9",
    eyebrow: "lg:!text-[#EBD9B0]",
    title: "lg:!text-white",
    rule: "lg:block",
    lead: "lg:mt-4 lg:text-[1.0625rem] lg:!text-white/85",
    sizes: "100vw",
  },
  app: {
    grid: "xl:grid",
    cell: "xl:[grid-area:1/1]",
    band: "h-[14rem] sm:h-[18rem] md:h-[20rem] xl:h-auto xl:min-h-[clamp(21rem,30vw,29rem)]",
    scrim: "xl:bg-none xl:from-[#06201c]/80 xl:via-[#06201c]/35 xl:to-transparent xl:ltr:bg-gradient-to-r xl:rtl:bg-gradient-to-l",
    wrap: "xl:pointer-events-none xl:flex xl:items-center xl:pb-[4.5rem] xl:pt-10 xl:[grid-area:1/1]",
    inner: "xl:px-11",
    card: "xl:max-w-[min(36rem,54%)] xl:pointer-events-auto xl:mt-0 xl:rounded-lg xl:border-[#D9C08A]/50 xl:bg-[#071d1a]/25 xl:p-8 xl:shadow-none xl:backdrop-blur-[3px] 2xl:p-9",
    eyebrow: "xl:!text-[#EBD9B0]",
    title: "xl:!text-white",
    rule: "xl:block",
    lead: "xl:mt-4 xl:text-[1.0625rem] xl:!text-white/85",
    // the app column: full width on phones, beside the sidebar from lg (max 1320px)
    sizes: "(min-width: 1440px) 1256px, (min-width: 1024px) calc(100vw - 20rem), 100vw",
  },
};

/**
 * Full-width page hero: the page's own image as a wide band, the title on a
 * framed panel over its start side, and a sea-wave cut into its lower edge.
 *
 *   <PageHero variant="site" image="landing.about" eyebrow="…" title="…" lead="…" />
 *   <PageHero image="elementary.hero" top={<Breadcrumbs … />} … >actions · facts</PageHero>
 *
 *   variant="site"  full-bleed under the marketing header
 *   variant="app"   across the app content column (edge to edge on phones)
 *
 * - Small screens: the image is a banner (the bands are always wider than 1.5×
 *   their height, so the 3:2 art is cropped top and bottom); the title rises
 *   over its lower edge as a solid card, so long titles never sit on busy art.
 * - Wide screens (lg site, xl app): the panel floats over the start side (right
 *   in Arabic, left in English) on a tinted scrim — white text, a thin accent
 *   frame — and the band grows with it if the copy is long.
 * - The image is the page's LCP element: preloaded at high priority at the
 *   width the band needs; the manifest `focus` keeps the subject in the crop.
 * - Only title copy sits on the image. Actions, facts and chips go in
 *   `children`, under the hero — buttons never sit on a photograph.
 * - `display`: the landing's larger title scale.
 * - No `title`: a decorative band only (for pages whose heading lives in their
 *   content, e.g. a live status card).
 */
export default function PageHero({ image, eyebrow, title, lead, top, children, variant = "app", display = false, id = "page-title", className }) {
  const site = variant === "site";
  const v = V[variant];
  const panel = Boolean(title);
  return (
    <section aria-labelledby={panel ? id : undefined} className={cn("relative", className)}>
      {top && <div className={cn("pb-4", site && "container-jz pt-2")}>{top}</div>}

      <div className={cn("relative", v.grid)}>
        <div
          aria-hidden={panel ? undefined : true}
          className={cn("relative isolate overflow-hidden bg-[#10302b]", v.cell, v.band, !site && "-mx-[var(--gutter)] md:mx-0 md:rounded-2xl")}
        >
          <Illustration id={image} fill priority sizes={v.sizes} />
          <div aria-hidden="true" className={cn("absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent", v.scrim)} />
          <Wave />
        </div>

        {panel && (
          // wide screens: in the band's grid cell, clear of the wave (pb)
          <div className={cn("relative", v.wrap)}>
            <div className={cn("w-full", v.inner)}>
              <div
                className={cn(
                  // small screens: a solid card rising over the band's lower edge
                  "relative z-[1] -mt-14 rounded-xl border border-line/10 bg-surface p-5 shadow-lg sm:-mt-16 sm:p-6 md:p-7",
                  // wide screens: a framed glass panel over the image's start side
                  v.card
                )}
              >
                {eyebrow && <p className={cn("t-eyebrow", v.eyebrow)}>{eyebrow}</p>}
                <h1 id={id} className={cn(display ? "t-display" : "t-h1", "mt-2 max-w-[22ch]", v.title)}>{title}</h1>
                {lead && (
                  <>
                    <span aria-hidden="true" className={cn("mt-5 hidden h-px w-16 bg-white/60", v.rule)} />
                    <p className={cn("t-lead mt-3 max-w-[38rem]", v.lead)}>{lead}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {children && <div className={cn("mt-6 md:mt-8", site && "container-jz")}>{children}</div>}
    </section>
  );
}

/** Sea-wave cut into the band's lower edge, in the page colour, rising on the start side. */
function Wave() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 80"
      preserveAspectRatio="none"
      className="absolute inset-x-0 -bottom-px h-7 w-full text-canvas rtl:-scale-x-100 sm:h-10 md:h-16"
    >
      <path d="M0 80V34C180 8 330 2 520 16s360 50 560 46 280-30 360-44v28H0z" fill="currentColor" />
    </svg>
  );
}
