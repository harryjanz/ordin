import { Fragment } from "react";
import type { RevenuePoint } from "../types";
import styles from "./RevenueBarChart.module.scss";

export interface RevenueBarChartProps {
  data: RevenuePoint[];
  // Mostra, ao lado de cada barra atual, uma segunda barra (cor
  // secundária) com o valor do período anterior na mesma posição — ver
  // ORD-103. Só faz sentido em modo dia/mês (controlado por quem chama).
  showPrevious?: boolean;
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
// vez de %, já que o container inclui a linha de rótulos abaixo.
const BARS_HEIGHT_PX = 236;

function currency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Barras simples em CSS Grid (sem lib de gráfico) — eixo Y com linhas de
// grade pontilhadas, mesmo espírito do gráfico de receita por hora do
// dashboard concorrente analisado no ORD-101
// (docs/analise-dashboard-concorrente-goomer.md). Genérico pra qualquer
// granularidade (hora/dia/semana/mês, ver ORD-102) — o `label` de cada
// ponto já vem formatado do backend, o componente só desenha as barras.
export default function RevenueBarChart({ data, showPrevious }: RevenueBarChartProps) {
  const max = Math.max(1, ...data.map((p) => Math.max(p.revenue, showPrevious ? p.previous_revenue : 0)));

  return (
    <div className={styles.wrap}>
      <div className={styles.chartArea}>
        <div className={styles.yAxis}>
          {TICK_FRACTIONS.map((f) => (
            <div key={f} className={styles.yTick} style={{ top: `${(1 - f) * 100}%` }}>
              {compactCurrency(max * f)}
            </div>
          ))}
        </div>
        <div className={`${styles.chart} ${showPrevious ? styles.chartCompare : ""}`}>
          {TICK_FRACTIONS.map((f) => (
            <div key={f} className={styles.gridLine} style={{ top: `${(1 - f) * BARS_HEIGHT_PX}px` }} />
          ))}
          {data.map((p, i) => (
            <Fragment key={`${p.label}-${i}`}>
              <div className={styles.barCell}>
                <div
                  className={styles.bar}
                  style={{ height: `${(p.revenue / max) * 100}%` }}
                  title={`Atual: ${currency(p.revenue)}`}
                />
                {showPrevious && (
                  <div
                    className={styles.barPrevious}
                    style={{ height: `${(p.previous_revenue / max) * 100}%` }}
                    title={`Período anterior: ${currency(p.previous_revenue)}`}
                  />
                )}
              </div>
              <div className={styles.pointLabel}>{p.label}</div>
            </Fragment>
          ))}
        </div>
      </div>
      {showPrevious && (
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.legendSwatchCurrent}`} /> Atual
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.legendSwatchPrevious}`} /> Período anterior
          </span>
        </div>
      )}
    </div>
  );
}
