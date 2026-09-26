import Skeleton from "@/components/ui/Skeleton";
import { PostSkeleton, RailSkeleton } from "@/components/community/skeletons";

// Mirrors /community/post/[id]: back link · title · one post + rail.
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade">
      <Skeleton className="mb-4 h-4 w-32" />
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-8">
          <Skeleton className="mb-4 h-8 w-40" />
          <PostSkeleton media />
        </div>
        <div className="hidden lg:col-span-4 lg:block"><RailSkeleton /></div>
      </div>
    </div>
  );
}
