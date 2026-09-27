import { notFound } from "next/navigation";
import { resolveLearn } from "./resolve";

// Validates the learn path before this segment's loading.js boundary: the
// loading shell (a Suspense boundary) wraps only the page, so notFound() here
// fails the render shell and the response is a real HTTP 404 instead of a
// streamed 200 "soft 404". The page's own notFound() stays as a backstop.
//
// This only holds while no ancestor segment has a loading.js: a boundary above
// this layout (e.g. app/[locale]/(app)/loading.js) contains the error and the
// response is 200 again (tests/unit/learn.test.js pins the learn side).
export default async function LearnPathLayout({ children, params }) {
  const { path } = await params;
  if (!(await resolveLearn(path))) notFound();
  return children;
}
