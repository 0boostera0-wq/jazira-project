import Illustration from "@/components/ui/Illustration";
import ArtPreload from "@/components/ui/ArtPreload";
import { WelcomeActions, WelcomeHeading, WelcomeProgress } from "./WelcomeLive";

// The panel is ~14–21rem wide and as tall as the greeting; cover-cropping a 3:2
// frame into it needs about this much width.
const ART_SIZES = "(min-width: 1536px) 400px, 340px";

/**
 * Split header + stats strip:
 *   ┌ date · greeting (h1) · context · primary action ┬ morning-lake image (sm+) ┐
 *   └ level ring + XP to next level │ streak │ achievements link ──────────────┘
 * Phones drop the art (and never download it: it is preloaded from sm up only).
 */
export default function WelcomeCard() {
  return (
    <section aria-labelledby="dash-greeting" className="surface animate-in overflow-hidden">
      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]">
        <div className="min-w-0 p-5 sm:p-7 sm:pb-6">
          <WelcomeHeading />
          <WelcomeActions className="mt-5" />
        </div>
        <div aria-hidden="true" className="relative hidden min-h-[12rem] sm:block">
          <ArtPreload id="welcome.dashboard" from="sm" sizes={ART_SIZES} />
          <Illustration id="welcome.dashboard" fill sizes={ART_SIZES} />
        </div>
      </div>
      <WelcomeProgress className="border-t border-line/10 bg-surface-2/40 px-5 py-4 sm:px-7" />
    </section>
  );
}
