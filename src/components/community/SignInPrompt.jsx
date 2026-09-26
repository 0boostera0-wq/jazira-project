"use client";

import { useCallback, useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { useT } from "@/i18n/client";
import { usePathname } from "@/i18n/navigation";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";

/**
 * Guests can read everything; any action (like, comment, follow, report…)
 * opens this sheet instead of failing silently.
 *   const [prompt, askSignIn] = useSignInPrompt();  …  {prompt}
 */
export function useSignInPrompt() {
  const [open, setOpen] = useState(false);
  const ask = useCallback(() => setOpen(true), []);
  const element = open ? <SignInDialog onClose={() => setOpen(false)} /> : null;
  return [element, ask];
}

function SignInDialog({ onClose }) {
  const t = useT("community");
  const path = usePathname();
  const next = encodeURIComponent(path || "/community");
  return (
    <Dialog
      open
      onClose={onClose}
      variant="sheet"
      size="sm"
      title={t("signIn.title")}
      description={t("signIn.body")}
      footer={
        <>
          <Button href={`/sign-up?next=${next}`} variant="secondary" iconStart={UserPlus}>{t("signIn.signUp")}</Button>
          <Button href={`/sign-in?next=${next}`} iconStart={LogIn}>{t("signIn.signIn")}</Button>
        </>
      }
    >
      <ul className="t-small space-y-2 text-ink-2">
        {["ask", "share", "follow"].map((k) => (
          <li key={k} className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
            <span>{t(`signIn.perks.${k}`)}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
