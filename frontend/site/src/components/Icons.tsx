type IconProps = { size?: number };

const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function CardIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <line x1="2.5" y1="9.5" x2="21.5" y2="9.5" />
      <line x1="6" y1="14.5" x2="10.5" y2="14.5" />
    </svg>
  );
}

export function ReceiptIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <path d="M5 3.5h14v17l-2.5-1.6L14 20.5l-2-1.6-2 1.6-2.5-1.6L5 20.5v-17Z" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </svg>
  );
}

export function TagIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <path d="M3 11.5 11.5 3H19a2 2 0 0 1 2 2v7.5L12.5 21 3 11.5Z" />
      <circle cx="14.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CheckCircleIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m8 12.5 2.5 2.5 5.5-6" />
    </svg>
  );
}

export function XCircleIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </svg>
  );
}

export function ShieldIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <path d="M12 3 4.5 6v6c0 4.5 3 7.5 7.5 9 4.5-1.5 7.5-4.5 7.5-9V6L12 3Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

export function DevicesIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <rect x="2.5" y="4.5" width="13" height="9" rx="1.5" />
      <line x1="6" y1="16.5" x2="14" y2="16.5" />
      <rect x="16.5" y="9" width="5" height="9" rx="1.2" />
      <line x1="18" y1="16" x2="20" y2="16" />
    </svg>
  );
}

export function ChatIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <path d="M4 5.5h16v10.5H9.5L5 20v-4H4V5.5Z" />
    </svg>
  );
}
