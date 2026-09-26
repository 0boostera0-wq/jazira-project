import Illustration from "@/components/ui/Illustration";
import { WelcomeActions, WelcomeHeading, WelcomeProgress } from "./WelcomeLive";

/**
 * Split header + stats strip:
 *   ┌ date · greeting (h1) · context · primary action ┬ study-nook art (sm+) ┐
 *   └ level ring + XP to next level │ streak │ achievements link ────────────┘
 * Phones drop the art and keep the content order.
 */
export default function WelcomeCard() {
  return (
    <section aria-labelledby="dash-greeting" className="surface animate-in overflow-hidden">
      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,13.5rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
        <div className="min-w-0 p-5 sm:p-7 sm:pb-6">
          <WelcomeHeading />
          <WelcomeActions className="mt-5" />
        </div>
        <div aria-hidden="true" className="relative hidden items-center justify-center bg-[#F7F0E3] px-4 py-3 sm:flex dark:bg-surface-2">
          <Illustration id="brand.island-study" priority className="w-full max-w-[16rem]" />
        </div>
      </div>
      <WelcomeProgress className="border-t border-line/10 bg-surface-2/40 px-5 py-4 sm:px-7" />
    </section>
  );
}
