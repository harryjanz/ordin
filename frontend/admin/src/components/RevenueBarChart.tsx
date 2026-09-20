import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RevenuePoint } from "../types";
import styles from "./RevenueBarChart.module.scss";

export interface RevenueBarChartProps {
  data: RevenuePoint[];
  // Mostra, ao lado de cada barra atual, uma segunda barra (cor
  // secundária) com o valor do período anterior na mesma posição — ver
  // ORD-103. Só faz sentido em modo dia/mês (controlado por quem chama).
  showPrevious?: boolean;
}

// ORD-193 — Recharts (já adotado no admin pela ORD-191, gráfico de estoque)
// substitui a implementação anterior em CSS Grid à mão: ganha tooltip (a
// versão anterior não tinha nenhum) sem mudar a interface do componente.
const CURRENT_COLOR = "#9900ff"; // brand-primary — mesmo valor de StockHistoryChart
const PREVIOUS_COLOR = "#8a8a8a";
const AXIS_COLOR = "#8a8a8a";

// Formato compacto pro eixo Y — mesmo espírito do "R$3k"/"R$100" do
// dashboard concorrente analisado no ORD-101.
function compactCurrency(v: number): string {
  if (v >= 1000) return `R$${(v / 1000).toFixed(1).replace(".0", "").replace(".", ",")}k`;
  return `R$${Math.round(v)}`;
}

function currency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function RevenueBarChart({ data, showPrevious }: RevenueBarChartProps) {
  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--a-border, #e5e5e5)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
          <YAxis
            width={48}
            tickLine={false}
            axisLine={false}
            tickFormatter={compactCurrency}
            tick={{ fill: AXIS_COLOR, fontSize: 11 }}
          />
          <Tooltip
            formatter={(value, name) => [currency(Number(value)), name === "revenue" ? "Atual" : "Período anterior"]}
            labelFormatter={(label) => label}
          />
          {showPrevious && (
            <Legend
              formatter={(value) => (value === "revenue" ? "Atual" : "Período anterior")}
              wrapperStyle={{ fontSize: 12 }}
            />
          )}
          <Bar dataKey="revenue" fill={CURRENT_COLOR} radius={[3, 3, 0, 0]} maxBarSize={28} />
          {showPrevious && <Bar dataKey="previous_revenue" fill={PREVIOUS_COLOR} radius={[3, 3, 0, 0]} maxBarSize={28} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
