import PageSkeleton from "@/components/states/PageSkeleton";

// Instant shell for the feedback page. (There is deliberately no group-level
// (app)/loading.js: a Suspense boundary above a route makes notFound() answer
// 200 instead of 404 — see the learn/[...path] layout.)
export default function Loading() {
  return <PageSkeleton />;
}
