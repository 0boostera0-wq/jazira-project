"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAuthUser } from "@/context/AuthProvider";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase-lazy";

// Unread badge that links to /notifications. Never blocks rendering: the count
// loads after mount, refreshes every 60 s and when the tab regains focus, and
// silently stays at 0 if notifications aren't available.
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
    tick();
    const id = setInterval(tick, 60000);
    const onFocus = () => tick();
    const onRead = () => tick();
    window.addEventListener("focus", onFocus);
    window.addEventListener("jz:notifications-read", onRead);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("jz:notifications-read", onRead);
    };
  }, [isSignedIn, userId]);

  if (!isSignedIn) return null;
  const label = count > 0 ? `${t("a11y.notifications")} (${count})` : t("a11y.notifications");
  return (
    <Link href="/notifications" aria-label={label} className="relative grid h-10 w-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
      <Bell size={19} aria-hidden="true" />
      {count > 0 && (
        <span className="absolute end-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-canvas tabular">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
