// Símbolo da marca Ordin — hexágono arredondado com um vão circular no
// centro (fill-rule evenodd). Fonte: /home/harry/Downloads/ordin_symbol.svg,
// gerado a partir do prompt de identidade visual (ORD-098 rejeitado, cor
// voltou pro roxo original — este símbolo é a peça nova, independente
// daquela discussão). currentColor por padrão pra herdar a cor do
// contexto (mesmo padrão de PixLogo.tsx no totem), em vez de fixar o hex.
export function OrdinSymbol({ size = 24, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M 283.97,82.15 L 392.57,144.85 Q 420.54,161.00 420.54,193.30 L 420.54,318.70 Q 420.54,351.00 392.57,367.15 L 283.97,429.85 Q 256.00,446.00 228.03,429.85 L 119.43,367.15 Q 91.46,351.00 91.46,318.70 L 91.46,193.30 Q 91.46,161.00 119.43,144.85 L 228.03,82.15 Q 256.00,66.00 283.97,82.15 Z M 158.00,256.00 A 98.00,98.00 0 1,0 354.00,256.00 A 98.00,98.00 0 1,0 158.00,256.00 Z"
        fill={color}
        fillRule="evenodd"
      />
    </svg>
  );
}
