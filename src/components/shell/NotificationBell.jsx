"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAuthUser } from "@/context/AuthProvider";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase-lazy";

// Unread badge that links to /notifications. Never blocks rendering: the count
// loads after mount, refreshes every 60 s while the tab is visible and again
// when it becomes visible, and silently stays at 0 if notifications aren't
// available. Hidden tabs make no requests.
async function fetchUnread(userId) {
  const supabase = await getSupabase();
  if (!supabase) return 0;
  const rpc = await supabase.rpc("unread_notification_count");
  if (!rpc.error && typeof rpc.data === "number") return rpc.data;
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  return count || 0;
}

export default function NotificationBell() {
  const { isSignedIn, userId } = useAuthUser();
  const t = useT("common");
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isSignedIn || !userId) { setCount(0); return; }
    let alive = true;
    const tick = () => fetchUnread(userId).then((n) => alive && setCount(n)).catch(() => {});
    const visible = () => document.visibilityState === "visible";
    tick();
    const id = setInterval(() => { if (visible()) tick(); }, 60000);
    const onVisible = () => { if (visible()) tick(); };
    const onRead = () => tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("jz:notifications-read", onRead);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("jz:notifications-read", onRead);
    };
  }, [isSignedIn, userId]);

  if (!isSignedIn) return null;
  const label = count > 0 ? `${t("a11y.notifications")} (${count})` : t("a11y.notifications");
  return (
    <Link href="/notifications" aria-label={label} className="relative grid h-11 w-11 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink lg:h-10 lg:w-10">
      <Bell size={19} aria-hidden="true" />
      {count > 0 && (
        <span aria-hidden="true" className="absolute end-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-xs font-bold leading-none text-danger-fg ring-2 ring-canvas tabular">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
