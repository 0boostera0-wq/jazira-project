"use client";

import ErrorView from "@/components/states/ErrorView";

export default function AppError({ error, reset }) {
  return <ErrorView error={error} reset={reset} />;
}
