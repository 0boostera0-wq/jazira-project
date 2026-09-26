"use client";

import { useEffect } from "react";

/**
 * Close a popover on outside pointer-down or Escape.
 * Pass `returnFocusRef` (the trigger) so Escape hands focus back to it
 * instead of dropping it on <body>.
 */
export function useDismiss(ref, open, onClose, returnFocusRef) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      onClose();
      returnFocusRef?.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, onClose, returnFocusRef]);
}
