import type { Avatar as AvatarSpec } from '../../data/types';

export function Avatar({ av, size = 34, radius = 10 }: { av: AvatarSpec; size?: number; radius?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0, display: 'block' }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 64 64">
        <rect width="64" height="64" fill={av.bg} />
        <path d="M6 68c0-14 11-24 26-24s26 10 26 24z" fill={av.shirt} />
        <rect x="27" y="36" width="10" height="9" rx="3" fill={av.skin} />
        <circle cx="32" cy="27" r="11" fill={av.skin} />
        <path d="M19 26a13 13 0 0 1 26 0h2.5v3.5H16.5V26z" fill={av.hat} />
        <rect x="29" y="11" width="6" height="7" rx="2" fill={av.hat} />
        <circle cx="28" cy="30" r="1.3" fill="#1e2b45" />
        <circle cx="36" cy="30" r="1.3" fill="#1e2b45" />
        <path d="M28.5 34q3.5 3 7 0" stroke="#1e2b45" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </svg>
    </span>
  );
}

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
