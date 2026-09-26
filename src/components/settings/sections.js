// Settings information architecture: groups → sections (labels in settings.sections.*).
import { Bell, Crown, LockKeyhole, ShieldCheck, SlidersHorizontal, Trash2, UserRound } from "lucide-react";

export const SECTION_GROUPS = [
  { id: "account", sections: [{ id: "profile", icon: UserRound }, { id: "account", icon: ShieldCheck }] },
  {
    id: "experience",
    sections: [
      { id: "preferences", icon: SlidersHorizontal },
      { id: "notifications", icon: Bell },
      { id: "privacy", icon: LockKeyhole },
    ],
  },
  { id: "membership", sections: [{ id: "subscription", icon: Crown }] },
];

/** Kept apart at the end of every list, in the danger tone. */
export const DANGER_SECTION = { id: "danger", icon: Trash2 };

export const ALL_SECTIONS = [...SECTION_GROUPS.flatMap((g) => g.sections), DANGER_SECTION];
export const sectionIcon = (id) => ALL_SECTIONS.find((s) => s.id === id)?.icon || UserRound;
