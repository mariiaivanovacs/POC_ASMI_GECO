export function AdminAvatar({ size = 40 }: { size?: number }) {
  return (
    <span className="admin-av" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 64 64">
        <rect width="64" height="64" fill="#dbe8ff" />
        <path d="M8 66c0-13 10-22 24-22s24 9 24 22z" fill="#2c4a7c" />
        <rect x="27" y="36" width="10" height="9" rx="3" fill="#e8b892" />
        <circle cx="32" cy="27" r="11" fill="#e8b892" />
        <path d="M21 24c0-7 5-11 11-11s11 4 11 11c-3-3-7-4-11-4s-8 1-11 4z" fill="#3b2a1e" />
        <circle cx="28" cy="29" r="1.3" fill="#1e2b45" />
        <circle cx="36" cy="29" r="1.3" fill="#1e2b45" />
        <path d="M28.5 33q3.5 3 7 0" stroke="#1e2b45" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </svg>
    </span>
  );
}
