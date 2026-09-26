import { Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getT } from "@/i18n/server";
import Logo from "@/components/brand/Logo";
import Illustration from "@/components/ui/Illustration";
import { ArtPreload } from "@/components/stages/HeroArt";
import { SIZES } from "@/lib/assets";
import LanguageSwitch from "./LanguageSwitch";
import SkipLink from "./SkipLink";
import ThemeToggle from "./ThemeToggle";

const ASIDE_SIZES = SIZES.aside;

/**
 * Split-screen frame for sign-in / sign-up / password flows (server component).
 * Form column on the inline-start side; on the inline-end side (lg+ only — on
 * mobile the form stands alone, no dead space) a full-height painting with the
 * value points on a scrim over its lower third. The painting is preloaded for
 * lg+ screens only (ArtPreload), so phones never download it.
 *
 *   <AuthShell title description illustration="welcome.sign-in"
 *              asideTitle asidePoints={[…]} footer={<p>…</p>}>
 *     <SignInForm />
 *   </AuthShell>
 */
export default async function AuthShell({ title, description, illustration = "welcome.sign-in", asideTitle, asidePoints = [], footer, children }) {
  const tc = await getT("common");
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
      <SkipLink />
      <div className="flex min-h-dvh flex-col px-[var(--gutter)]">
        <header className="flex h-[68px] items-center justify-between">
          <Link href="/" className="rounded-md"><Logo name={tc("brand.full")} size="sm" /></Link>
          <div className="flex items-center gap-1">
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center py-8 outline-none sm:py-12">
          <div className="w-full max-w-[440px] animate-in">
            <h1 className="t-h2">{title}</h1>
            {description && <p className="t-body mt-2 text-ink-3">{description}</p>}
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-7 text-center text-sm text-ink-3">{footer}</div>}
          </div>
        </main>
      </div>

      <aside className="relative hidden p-4 lg:block" aria-hidden={asidePoints.length ? undefined : true}>
        <ArtPreload id={illustration} from="lg" sizes={ASIDE_SIZES} />
        <div className="art-frame sticky top-4 flex h-[calc(100dvh-2rem)] flex-col justify-end rounded-xl bg-[#173a33]">
          <Illustration id={illustration} fill sizes={ASIDE_SIZES} />
          {(asideTitle || asidePoints.length > 0) && (
            // Scrim: the copy sits on the painting's lower third in light text, AA on every scene.
            <div className="relative bg-gradient-to-t from-[#0B211C]/95 via-[#0B211C]/75 to-transparent px-10 pb-10 pt-28 text-white">
              {asideTitle && <p className="t-h3 max-w-md !text-white">{asideTitle}</p>}
              <ul className="mt-4 grid gap-2.5">
                {asidePoints.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-[0.9375rem] text-white/90">
                    <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-white ring-1 ring-inset ring-white/25">
                      <Check size={13} aria-hidden="true" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
