"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./Field";
import { useT } from "@/i18n/client";

const PasswordInput = forwardRef(function PasswordInput(props, ref) {
  const [show, setShow] = useState(false);
  const t = useT("common");
  return (
    <div className="relative">
      <Input ref={ref} type={show ? "text" : "password"} className="pe-11" dir="ltr" {...props} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 end-0 grid w-11 place-items-center text-ink-3 transition-colors hover:text-ink"
        aria-label={show ? t("a11y.hidePassword") : t("a11y.showPassword")}
        aria-pressed={show}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
});

export default PasswordInput;
