"use client";

import { forwardRef } from "react";
import PasswordInput from "@/components/ui/PasswordInput";
import { useLocale } from "@/i18n/client";

/**
 * PasswordInput with the show/hide toggle's space reserved on the correct side.
 * The primitive forces dir="ltr" on the <input> but anchors the toggle at the
 * wrapper's inline end — in RTL that is the input's *start* (left), where its
 * `pe-11` reserves nothing, so typed text ran under the eye icon.
 * (Primitive fix requested in the auth report; drop this wrapper after it lands.)
 */
const AuthPasswordInput = forwardRef(function AuthPasswordInput(props, ref) {
  const { isRTL } = useLocale();
  return <PasswordInput ref={ref} className={isRTL ? "ps-11" : "pe-11"} {...props} />;
});

export default AuthPasswordInput;
