import { Home, Search } from "lucide-react";
import { getT } from "@/i18n/server";
import { Link } from "@/i18n/navigation";
import Logo from "@/components/brand/Logo";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";

export default async function NotFound() {
  const [t, tn] = await Promise.all([getT("common"), getT("nav")]);
  return (
    <div className="bg-aura flex min-h-dvh flex-col">
      <div className="container-jz flex h-[68px] items-center">
        <Link href="/" className="rounded-md"><Logo name={t("brand.full")} size="sm" /></Link>
      </div>
      <main id="main" className="container-jz grid flex-1 items-center gap-10 py-10 lg:grid-cols-2">
        <div className="order-2 text-center lg:order-1 lg:text-start">
          <p className="t-eyebrow">404</p>
          <h1 className="t-h1 mt-2">{t("errors.notFoundTitle")}</h1>
          <p className="t-lead mt-3 max-w-lg lg:mx-0 mx-auto">{t("errors.notFoundBody")}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-2.5 lg:justify-start">
            <Button href="/" iconStart={Home}>{t("actions.goHome")}</Button>
            <Button href="/search" variant="secondary" iconStart={Search}>{tn("items.search")}</Button>
          </div>
        </div>
        <div className="order-1 mx-auto w-full max-w-md lg:order-2 lg:max-w-lg">
          <Illustration id="system.not-found" priority />
        </div>
      </main>
    </div>
  );
}
