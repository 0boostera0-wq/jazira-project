// Anonymous grey silhouette (WhatsApp/Instagram-style) for guest users.
export default function DefaultAvatar({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill="#FFFFFF" />
      <circle cx="32" cy="24" r="11" fill="#C7C7C7" />
      <path
        d="M12 56c0-11 9-18 20-18s20 7 20 18z"
        fill="#C7C7C7"
      />
      <circle cx="32" cy="32" r="31" fill="none" stroke="#E3CD9E" strokeWidth="2" />
    </svg>
  );
}
