"use client";

import ErrorView from "@/components/states/ErrorView";

// Catches errors thrown by the route-group layouts ((site), (app), (auth)) —
// their own error.js files only cover the pages below them. Renders inside
// app/[locale]/layout.js, so the page keeps its lang/dir, fonts and messages.
export default function LocaleError({ error, reset }) {
  return (
    <main id="main" tabIndex={-1} className="container-jz grid min-h-dvh place-items-center py-10 outline-none">
      <ErrorView error={error} reset={reset} titleAs="h1" />
    </main>
  );
}
