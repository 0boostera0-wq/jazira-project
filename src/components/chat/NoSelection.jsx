"use client";

import { Inbox, Lock, Trash2 } from "lucide-react";
import { useT } from "@/i18n/client";
import Illustration from "@/components/ui/Illustration";

const POINTS = [
  { key: "private", Icon: Lock },
  { key: "requests", Icon: Inbox },
  { key: "delete", Icon: Trash2 },
];

/**
 * Thread placeholder (md+): what to do next + how messaging works here.
 * `about` (guests, or nothing to choose yet) swaps "choose a conversation"
 * for a short intro to messaging.
 */
export default function NoSelection({ about = false }) {
  const t = useT("chat");
  const copy = about ? "noSelection.about" : "noSelection";
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-surface-2/40 p-8">
      <div className="w-full max-w-md text-center">
        <div aria-hidden="true" className="art-frame mx-auto w-full max-w-[260px] rounded-xl">
          <Illustration id="community.conversation" aspect="4/3" sizes="260px" />
        </div>
        <h2 className="t-h3 mt-6">{t(`${copy}.title`)}</h2>
        <p className="t-small mx-auto mt-1.5 max-w-sm text-ink-3">{t(`${copy}.body`)}</p>
        <ul className="mt-7 space-y-3 text-start">
          {POINTS.map(({ key, Icon }) => (
            <li key={key} className="flex items-start gap-3 rounded-md border border-line/10 bg-surface px-4 py-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-gold-50 text-gold-600">
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{t(`noSelection.points.${key}.title`)}</span>
                <span className="t-caption block">{t(`noSelection.points.${key}.body`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
