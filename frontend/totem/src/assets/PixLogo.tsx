export function PixLogo({ size = 40, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill={color} xmlns="http://www.w3.org/2000/svg">
      {/* 4 kite pieces rotated 90° cada — aproximação do símbolo oficial do PIX (BACEN) */}
      <path d="M50 4 C54 4 58 6 61 9 L91 39 C94 42 94 48 91 51 L74 68 Q62 44 50 50 Q44 38 26 26 L43 9 C46 6 47 4 50 4Z" />
      <path d="M96 50 C96 54 94 58 91 61 L61 91 C58 94 52 94 49 91 L32 74 Q56 62 50 50 Q62 44 74 26 L91 43 C94 46 96 47 96 50Z" />
      <path d="M50 96 C46 96 42 94 39 91 L9 61 C6 58 6 52 9 49 L26 32 Q38 56 50 50 Q56 62 74 74 L57 91 C54 94 53 96 50 96Z" />
      <path d="M4 50 C4 46 6 42 9 39 L39 9 C42 6 48 6 51 9 L68 26 Q44 38 50 50 Q38 56 26 74 L9 57 C6 54 4 53 4 50Z" />
    </svg>
  );
}
