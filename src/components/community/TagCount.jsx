"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { useApi } from "./context";

/** Real number of posts under a tag (from the trigger-maintained hashtags.post_count). */
export default function TagCount({ tag, source, className }) {
  const t = useT("community");
  const api = useApi(source);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let alive = true;
    api.getTagInfo(tag).then((r) => alive && setInfo(r)).catch(() => alive && setInfo({ available: false }));
    return () => { alive = false; };
  }, [api, tag]);

  if (!info) return <Skeleton rounded="full" className={cn("h-10 w-32", className)} />;
  if (!info.available) return null;
  return (
    <p className={cn("inline-flex h-10 items-center self-start rounded-full bg-surface-2 px-4 text-sm font-medium text-ink-2 sm:self-center", className)}>
      {t("tag.count", { count: info.post_count })}
    </p>
  );
}
