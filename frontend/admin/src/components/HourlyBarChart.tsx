import { Fragment } from "react";
import type { HourlyRevenue } from "../types";
import styles from "./HourlyBarChart.module.scss";

export interface HourlyBarChartProps {
  data: HourlyRevenue[];
}

// Formato compacto pro eixo Y — mesmo espírito do "R$3k"/"R$100" do
// dashboard concorrente analisado no ORD-101.
function compactCurrency(v: number): string {
  if (v >= 1000) return `R$${(v / 1000).toFixed(1).replace(".0", "").replace(".", ",")}k`;
  return `R$${Math.round(v)}`;
}

// Frações de cima pra baixo — 100% do máximo até 0 (linha de base).
const TICK_FRACTIONS = [1, 0.75, 0.5, 0.25, 0];
// Altura fixa da faixa de barras, em px — mesmo valor de grid-template-rows
// no scss. Usado pra posicionar linhas de grade/rótulos do eixo Y em px em
// vez de %, já que o container inclui a linha de rótulos de hora abaixo.
const BARS_HEIGHT_PX = 236;

// Barras simples em CSS Grid (sem lib de gráfico) — eixo Y com linhas de
// grade pontilhadas, mesmo espírito do gráfico de receita por hora do
// dashboard concorrente analisado no ORD-101
// (docs/analise-dashboard-concorrente-goomer.md). Grid com 2 linhas (barra
// fixa em 200px / rótulo de altura livre) em vez de barra+rótulo dividindo
// a mesma altura — senão o rótulo estoura o container quando a barra chega
// perto de 100%.
export default function HourlyBarChart({ data }: HourlyBarChartProps) {
  const max = Math.max(1, ...data.map((h) => h.revenue));

  return (
    <div className={styles.wrap}>
      <div className={styles.yAxis}>
        {TICK_FRACTIONS.map((f) => (
          <div key={f} className={styles.yTick} style={{ top: `${(1 - f) * 100}%` }}>
            {compactCurrency(max * f)}
          </div>
        ))}
      </div>
      <div className={styles.chart}>
        {TICK_FRACTIONS.map((f) => (
          <div key={f} className={styles.gridLine} style={{ top: `${(1 - f) * BARS_HEIGHT_PX}px` }} />
        ))}
        {data.map((h) => (
          <Fragment key={h.hour}>
            <div className={styles.barCell}>
              <div
                className={styles.bar}
                style={{ height: `${(h.revenue / max) * 100}%` }}
                title={h.revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              />
            </div>
            <div className={styles.hourLabel}>{String(h.hour).padStart(2, "0")}h</div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
