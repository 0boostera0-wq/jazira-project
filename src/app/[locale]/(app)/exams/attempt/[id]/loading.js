import { RunnerSkeleton } from "@/components/exams/skeletons";

// Shown instantly on navigation from the builder: the exam shell paints before
// the route payload arrives.
export default function Loading() {
  return <RunnerSkeleton />;
}
