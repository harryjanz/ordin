export interface StepDef {
  label: string;
  sub: string;
}

const S = {
  steps: { display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 24 } as React.CSSProperties,
  connector: { width: 1, height: 10, background: "rgba(255,255,255,0.07)", marginLeft: 26 } as React.CSSProperties,
  navBase: {
    display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10,
    border: "1px solid transparent", background: "transparent", width: "100%", textAlign: "left" as const,
    fontFamily: "'Inter', sans-serif", color: "rgba(223,232,237,0.5)", cursor: "pointer",
  } as React.CSSProperties,
  num: {
    flex: "0 0 auto", width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center",
    fontFamily: "'Lexend', sans-serif", fontSize: 12, fontWeight: 700,
    background: "rgba(255,255,255,0.07)", color: "rgba(223,232,237,0.5)",
  } as React.CSSProperties,
  label: { fontSize: 13.5, fontWeight: 600 } as React.CSSProperties,
  sub: { fontSize: 11.5, color: "rgba(223,232,237,0.5)", marginTop: 1 } as React.CSSProperties,
};

export default function Stepper({
  steps,
  current,
  maxReached,
  onSelect,
}: {
  steps: StepDef[];
  current: number;
  maxReached: number;
  onSelect: (i: number) => void;
}) {
  return (
    <nav style={S.steps}>
      {steps.map((step, i) => {
        const isCurrent = i === current;
        const isDone = i < current || (i <= maxReached && i < current);
        const clickable = i <= maxReached;
        return (
          <div key={step.label}>
            {i > 0 && <div style={S.connector} />}
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelect(i)}
              style={{
                ...S.navBase,
                cursor: clickable ? "pointer" : "not-allowed",
                background: isCurrent ? "rgba(153,0,255,0.14)" : "transparent",
                border: isCurrent ? "1px solid rgba(153,0,255,0.22)" : "1px solid transparent",
              }}
            >
              <span
                style={{
                  ...S.num,
                  background: isCurrent ? "#9900ff" : isDone ? "rgba(93,212,144,0.16)" : "rgba(255,255,255,0.07)",
                  color: isCurrent ? "#fff" : isDone ? "#5DD490" : "rgba(223,232,237,0.5)",
                }}
              >
                {isDone ? "✓" : i + 1}
              </span>
              <span>
                <div style={{ ...S.label, color: isCurrent ? "#DFE8ED" : "rgba(223,232,237,0.5)" }}>{step.label}</div>
                <div style={S.sub}>{step.sub}</div>
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
