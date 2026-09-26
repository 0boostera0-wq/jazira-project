import { UserRound } from "lucide-react";
import Avatar from "@/components/Avatar";
import { cn } from "@/components/ui/cn";

/**
 * Avatar for a public identity (see publicIdentity() in model.js). Anonymous
 * members get a neutral silhouette — never their photo or initial.
 */
export default function AuthorAvatar({ author, size = 40, className }) {
  if (!author || author.anonymous || !author.name) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className={cn("inline-grid shrink-0 place-items-center rounded-full bg-surface-3 text-ink-3", className)}
      >
        <UserRound size={Math.round(size * 0.5)} strokeWidth={1.75} />
      </span>
    );
  }
  // The name is always rendered next to it, so the avatar itself is decorative.
  return (
    <span aria-hidden="true" className="inline-flex shrink-0">
      <Avatar src={author.avatar} name={author.name} alt="" size={size} className={className} />
    </span>
  );
}
