"use client";

import { Users } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import CommunityFeed from "@/components/CommunityFeed";

export default function CommunityPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="المجتمع التعليمي"
        subtitle="شارك إنجازاتك ونتائجك مع نخبة الطلاب — جزيرة سكوير"
        icon={Users}
      />
      <CommunityFeed />
    </div>
  );
}
