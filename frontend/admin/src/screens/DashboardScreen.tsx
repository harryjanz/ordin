import { useState, useEffect } from "react";
import { Button, DateInput, Dropdown, Skeleton, type DropdownOptions } from "design-system";
import { getPaymentsAnalytics } from "../api/payments";
import { listCompanies, listTerminals } from "../api/companies";
import { useStore } from "../store";
import type { AnalyticsGranularity, PaymentAnalytics, Terminal } from "../types";
import RevenueBarChart from "../components/RevenueBarChart";
import styles from "./DashboardScreen.module.scss";

type Preset = "today" | "yesterday" | "month" | "custom";

const PRESET_OPTIONS: { value: Preset; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "month", label: "Este mês" },
  { value: "custom", label: "Customizado" },
];

const GRANULARITY_OPTIONS: { value: AnalyticsGranularity; label: string }[] = [
  { value: "hour", label: "Hora" },
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
];

// Ordin não tem operador atribuído à venda (totem é autoatendimento) — os
// rótulos são só os métodos aceitos, ver `main.py` do payment-service
// ("Métodos aceitos: credit, debit, pix, voucher").
const METHOD_LABELS: Record<string, string> = {
  credit: "Crédito",
  debit: "Débito",
  pix: "PIX",
  voucher: "Voucher",
};

// Padrão pelo tamanho do período (ORD-102) — período de 1 dia continua
// mostrando por hora (comportamento herdado do ORD-101); períodos maiores
// já nascem numa granularidade legível, mas o owner pode trocar livremente.
function defaultGranularity(from: string, to: string): AnalyticsGranularity {
  const days = Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000) + 1;
  if (days <= 1) return "hour";
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}

// Formata em componentes locais (não toISOString, que usa UTC e pode
// deslocar o dia dependendo do fuso do navegador).
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// DateInput trabalha em dd/mm/aaaa — mesmo conversor de PaymentsScreen.tsx.
function brToIso(brDate: string): string | undefined {
  const m = brDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function brToDate(brDate: string): Date | undefined {
  const iso = brToIso(brDate);
  return iso ? new Date(`${iso}T00:00:00`) : undefined;
}

function presetRange(preset: Preset): { from: string; to: string } {
  const today = new Date();
  if (preset === "yesterday") {
    const y = addDays(today, -1);
    return { from: isoDate(y), to: isoDate(y) };
  }
  if (preset === "month") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: isoDate(first), to: isoDate(today) };
  }
  return { from: isoDate(today), to: isoDate(today) };
}

function formatCurrency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Exportação client-side (ORD-102) — sem chamada de API nova, só serializa
// o `analytics` já carregado na tela.
function exportAnalyticsCsv(
  analytics: PaymentAnalytics,
  meta: { companyLabel: string; from: string; to: string },
  terminalLabel: (id: number) => string,
): void {
  const rows: (string | number)[][] = [];
  rows.push(["Análises", meta.companyLabel, `${meta.from} a ${meta.to}`]);
  rows.push([]);
  rows.push(["KPI", "Atual", "Anterior", "Variação %"]);
  rows.push(["Receita", analytics.current.revenue, analytics.previous.revenue, analytics.change_pct.revenue ?? ""]);
  rows.push(["Ticket médio", analytics.current.ticket_medio, analytics.previous.ticket_medio, analytics.change_pct.ticket_medio ?? ""]);
  rows.push(["Volume", analytics.current.volume, analytics.previous.volume, analytics.change_pct.volume ?? ""]);
  rows.push([]);
  rows.push([`Série temporal (${analytics.granularity})`]);
  rows.push(["Período", "Receita"]);
  analytics.series.forEach((p) => rows.push([p.label, p.revenue]));
  rows.push([]);
  rows.push(["Venda por terminal"]);
  rows.push(["Terminal", "Receita", "Ticket médio"]);
  analytics.by_terminal.forEach((t) => rows.push([terminalLabel(t.terminal_id), t.revenue, t.ticket_medio]));
  rows.push([]);
  rows.push(["Receita por forma de pagamento"]);
  rows.push(["Forma", "Receita", "Ticket médio"]);
  analytics.by_method.forEach((m) => rows.push([METHOD_LABELS[m.method] ?? m.method, m.revenue, m.ticket_medio]));

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analises_${meta.from}_${meta.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Badge próprio (não o Tag do design system, compacto demais pra essa
// informação) — ícone e percentual com respiro entre eles e fonte maior,
// pedido explícito do usuário.
function TrendTag({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span className={`${styles.trendBadge} ${up ? styles.trendUp : styles.trendDown}`}>
      <i className={`icon-trending-${up ? "up" : "down"}`} />
      {Math.abs(pct)}%
    </span>
  );
}

export default function DashboardScreen() {
  const { role, selectedCompanyId, setSelectedCompany } = useStore();
  // superadmin e admin são equivalentes (gestão da plataforma, ver
  // docs/ARQUITETURA.md §1.2) — mesmo padrão do resto do admin.
  const isPlatformAdmin = role === "superadmin" || role === "admin";
  const [companyOptions, setCompanyOptions] = useState<DropdownOptions[]>([]);

  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // null = segue o padrão calculado pelo tamanho do período; um valor
  // explícito é o que o owner escolheu manualmente no chip (ver ORD-102).
  const [manualGranularity, setManualGranularity] = useState<AnalyticsGranularity | null>(null);

  const [analytics, setAnalytics] = useState<PaymentAnalytics | null>(null);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isPlatformAdmin) {
      listCompanies({ limit: 200 })
        .then((r) => setCompanyOptions(r.companies.map((c) => ({ value: String(c.id), label: c.name }))))
        .catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin]);

  const range = preset === "custom"
    ? { from: brToIso(customFrom), to: brToIso(customTo) }
    : presetRange(preset);

  const granularity: AnalyticsGranularity = manualGranularity
    ?? (range.from && range.to ? defaultGranularity(range.from, range.to) : "hour");

  // Troca de período limpa a escolha manual — o novo período nasce no
  // padrão calculado pelo tamanho dele; o owner pode sobrescrever de novo.
  useEffect(() => {
    setManualGranularity(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  useEffect(() => {
    if (!selectedCompanyId || !range.from || !range.to) { setLoading(false); return; }
    setLoading(true);
    setErr(null);
    Promise.all([
      getPaymentsAnalytics({ companyId: selectedCompanyId, dateFrom: range.from, dateTo: range.to, granularity }),
      listTerminals(selectedCompanyId),
    ])
      .then(([a, t]) => { setAnalytics(a); setTerminals(t); })
      .catch(() => setErr("Erro ao carregar os dados do período."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId, range.from, range.to, granularity]);

  const terminalLabel = (id: number) => terminals.find((t) => t.id === id)?.label ?? `#${id}`;
  const companyLabel = companyOptions.find((o) => o.value === String(selectedCompanyId ?? ""))?.label ?? `#${selectedCompanyId ?? ""}`;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.title}>Análises</div>
        <div className={styles.presetRow}>
          {PRESET_OPTIONS.map((o) => (
            <Button
              key={o.value}
              size="small"
              variant={preset === o.value ? "primary" : "secondary"}
              onClick={() => setPreset(o.value)}
            >
              {o.label}
            </Button>
          ))}
          {analytics && (
            <Button
              size="small"
              variant="secondary"
              onClick={() => exportAnalyticsCsv(analytics, { companyLabel, from: range.from ?? "", to: range.to ?? "" }, terminalLabel)}
            >
              Exportar CSV
            </Button>
          )}
        </div>
      </div>

      {preset === "custom" && (
        <div className={styles.customRange}>
          <DateInput label="De" value={customFrom} onChange={(v, valid) => { if (valid || !v) setCustomFrom(v); }} />
          <DateInput
            label="Até"
            value={customTo}
            disabled={!customFrom}
            minDate={brToDate(customFrom)}
            invalidMinDateMessage="A data final deve ser igual ou posterior à data inicial."
            onChange={(v, valid) => { if (valid || !v) setCustomTo(v); }}
          />
        </div>
      )}

      {isPlatformAdmin && companyOptions.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Empresa</div>
          <Dropdown
            placeholder="Selecionar empresa…"
            value={companyOptions.find((o) => o.value === String(selectedCompanyId ?? "")) ?? null}
            onValueSelected={(opt) => setSelectedCompany(Number(opt.value))}
            options={companyOptions}
          />
        </div>
      )}

      {!selectedCompanyId ? (
        <div className={styles.empty}>
          {isPlatformAdmin ? "Selecione uma empresa para ver as análises." : "Nenhuma empresa associada à sua conta."}
        </div>
      ) : loading ? (
        <div className={styles.grid}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.card}><Skeleton height={48} /></div>
          ))}
        </div>
      ) : err ? (
        <div className={styles.empty}>{err}</div>
      ) : analytics ? (
        <>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Receita</div>
              <div className={styles.cardValueSmall}>{formatCurrency(analytics.current.revenue)}</div>
              <div className={styles.trendRow}>
                <TrendTag pct={analytics.change_pct.revenue} />
                {analytics.change_pct.revenue !== null && <span className={styles.muted}>período anterior</span>}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Ticket médio</div>
              <div className={styles.cardValueSmall}>{formatCurrency(analytics.current.ticket_medio)}</div>
              <div className={styles.trendRow}>
                <TrendTag pct={analytics.change_pct.ticket_medio} />
                {analytics.change_pct.ticket_medio !== null && <span className={styles.muted}>período anterior</span>}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Volume</div>
              <div className={styles.cardValue}>{analytics.current.volume}</div>
              <div className={styles.trendRow}>
                <TrendTag pct={analytics.change_pct.volume} />
                {analytics.change_pct.volume !== null && <span className={styles.muted}>período anterior</span>}
              </div>
            </div>
          </div>

          <div className={styles.chartHeader}>
            <div className={styles.sectionTitle}><i className="icon-bar-chart" /> Receita por período</div>
            <div className={styles.granularityRow}>
              {GRANULARITY_OPTIONS.map((o) => (
                <Button
                  key={o.value}
                  size="small"
                  variant={granularity === o.value ? "primary" : "secondary"}
                  onClick={() => setManualGranularity(o.value)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          </div>
          <RevenueBarChart data={analytics.series} />

          <div className={styles.twoColumnSection}>
            <div className={styles.column}>
              <div className={styles.sectionTitle}><i className="icon-monitor" /> Venda por terminal</div>
              {analytics.by_terminal.length === 0 ? (
                <div className={styles.empty}>Nenhuma venda no período selecionado.</div>
              ) : (
                <div className={styles.terminalList}>
                  {analytics.by_terminal.map((t) => (
                    <div key={t.terminal_id} className={styles.terminalRow}>
                      <span className={styles.terminalLabel}>{terminalLabel(t.terminal_id)}</span>
                      <span className={styles.terminalValues}>
                        <span className={styles.terminalRevenue}>{formatCurrency(t.revenue)}</span>
                        <span className={styles.terminalTicket}>Ticket médio: {formatCurrency(t.ticket_medio)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.column}>
              <div className={styles.sectionTitle}><i className="icon-credit-card" /> Receita por forma de pagamento</div>
              {analytics.by_method.length === 0 ? (
                <div className={styles.empty}>Nenhuma venda no período selecionado.</div>
              ) : (
                <div className={styles.terminalList}>
                  {analytics.by_method.map((m) => (
                    <div key={m.method} className={styles.terminalRow}>
                      <span className={styles.terminalLabel}>{METHOD_LABELS[m.method] ?? m.method}</span>
                      <span className={styles.terminalValues}>
                        <span className={styles.terminalRevenue}>{formatCurrency(m.revenue)}</span>
                        <span className={styles.terminalTicket}>Ticket médio: {formatCurrency(m.ticket_medio)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
