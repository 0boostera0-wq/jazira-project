"use client";

import ErrorView from "@/components/states/ErrorView";

export default function SiteError({ error, reset }) {
  return (
    <div className="container-jz">
      <ErrorView error={error} reset={reset} />
    </div>
  );
}
