import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import styles from "./StockHistoryChart.module.scss";

export interface StockHistoryPoint {
  dia: string; // ISO "YYYY-MM-DD"
  quantidade: number;
}

export interface StockHistoryChartProps {
  points: StockHistoryPoint[];
  unidade: string | null;
}

// ORD-191 (A9) — mesmo valor de brand-primary (design-system/dist/core/scss/
// tokens/themes/_default.scss) — o Recharts precisa de uma cor literal, o
// token color() do SCSS só existe em tempo de build.
const LINE_COLOR = "#9900ff";
const AXIS_COLOR = "#8a8a8a";

function formatDia(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// Gráfico de nível de estoque, 7 dias — complementa (não substitui) a tabela
// de histórico de movimentações já existente, logo acima. Diferente do
// RevenueBarChart (barras à mão em CSS Grid, sem lib): aqui usamos Recharts,
// decisão explícita do usuário (2026-09-20) — ver docs/estudo-modulo-
// estoque-erp.md, escolha registrada mesmo divergindo do padrão anterior.
export default function StockHistoryChart({ points, unidade }: StockHistoryChartProps) {
  if (points.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--a-border, #e5e5e5)" />
          <XAxis
            dataKey="dia"
            tickFormatter={formatDia}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS_COLOR, fontSize: 11 }}
          />
          <YAxis width={40} tickLine={false} axisLine={false} allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
          <Tooltip
            formatter={(value) => [`${value}${unidade ? ` ${unidade}` : ""}`, "Estoque"]}
            labelFormatter={(label) => formatDia(String(label))}
          />
          <Line type="monotone" dataKey="quantidade" stroke={LINE_COLOR} strokeWidth={2} dot={{ r: 3, fill: LINE_COLOR }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
