import { Link } from "@/i18n/navigation";
import { getT } from "@/i18n/server";

const linkCls = "font-medium text-ink-2 underline decoration-line/30 underline-offset-4 transition-colors hover:text-gold-600 hover:decoration-gold-400";

/**
 * "By continuing you agree to the Terms and Privacy policy" (server component).
 * The sentence is one translatable string with {terms}/{privacy} slots so word
 * order stays natural in both languages. `messageKey` picks the wording
 * (e.g. "signUp.legal" next to the create-account button).
 */
export default async function LegalNote({ messageKey = "legal" }) {
  const t = await getT("auth");
  const parts = String(t.raw(messageKey) || "").split(/(\{terms\}|\{privacy\})/);
  return (
    <p className="t-caption mx-auto max-w-sm text-balance">
      {parts.map((part, i) => {
        if (part === "{terms}") return <Link key={i} href="/terms" className={linkCls}>{t("terms")}</Link>;
        if (part === "{privacy}") return <Link key={i} href="/privacy" className={linkCls}>{t("privacy")}</Link>;
        return part;
      })}
    </p>
  );
}
