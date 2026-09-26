import { ProfileNotFound } from "@/components/community/profile/ProfileStates";

// Unknown username → a profile-specific 404 inside the app shell.
export default function UserNotFound() {
  return <ProfileNotFound />;
}
