import MarketingHeader from "@/components/shell/MarketingHeader";
import MarketingFooter from "@/components/shell/MarketingFooter";
import SkipLink from "@/components/shell/SkipLink";
import { setRequestLocale } from "@/i18n/server";

export default function SiteLayout({ children, params }) {
  setRequestLocale(params.locale);
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <MarketingHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      <MarketingFooter />
    </div>
  );
}
