interface SpinnerProps {
  size?: number;
  color?: string;
}

// Indicador de "consulta em andamento" pra campos com auto-preenchimento
// assíncrono (CNPJ, CEP) — posicionado como sufixo dentro do próprio input
// (ver InputWithSpinner), não como texto separado abaixo do campo. Feedback
// no ponto de atenção do usuário é notado mais rápido que uma linha de texto
// que aparece/some abaixo, especialmente com o campo ainda em foco.
export default function Spinner({ size = 14, color = "rgba(223,232,237,0.5)" }: SpinnerProps) {
  return (
    <>
      <style>{`
        @keyframes ordin-spinner-rotate {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <span
        role="status"
        aria-label="Carregando"
        style={{
          display: "inline-block",
          width: size,
          height: size,
          border: "2px solid rgba(223,232,237,0.15)",
          borderTopColor: color,
          borderRadius: "50%",
          animation: "ordin-spinner-rotate 0.7s linear infinite",
        }}
      />
    </>
  );
}
