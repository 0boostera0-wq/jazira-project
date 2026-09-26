import { ProfileSkeleton } from "@/components/community/profile/ProfileStates";

// /profile redirects to /u/<username>; show the profile shape meanwhile.
export default function Loading() {
  return <ProfileSkeleton />;
}
