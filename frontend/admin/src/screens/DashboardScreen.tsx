import { useState, useEffect } from "react";
import { Button, DateInput, Dropdown, Skeleton, type DropdownOptions } from "design-system";
import { getPaymentsAnalytics } from "../api/payments";
import { listCompanies, listTerminals } from "../api/companies";
import { useStore } from "../store";
import type { PaymentAnalytics, Terminal } from "../types";
import HourlyBarChart from "../components/HourlyBarChart";
import styles from "./DashboardScreen.module.scss";

type Preset = "today" | "yesterday" | "month" | "custom";

const PRESET_OPTIONS: { value: Preset; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "month", label: "Este mês" },
  { value: "custom", label: "Customizado" },
];

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

  useEffect(() => {
    if (!selectedCompanyId || !range.from || !range.to) { setLoading(false); return; }
    setLoading(true);
    setErr(null);
    Promise.all([
      getPaymentsAnalytics({ companyId: selectedCompanyId, dateFrom: range.from, dateTo: range.to }),
      listTerminals(selectedCompanyId),
    ])
      .then(([a, t]) => { setAnalytics(a); setTerminals(t); })
      .catch(() => setErr("Erro ao carregar os dados do período."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId, range.from, range.to]);

  const terminalLabel = (id: number) => terminals.find((t) => t.id === id)?.label ?? `#${id}`;

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

          <div className={styles.sectionTitle}><i className="icon-bar-chart" /> Receita por hora</div>
          <HourlyBarChart data={analytics.hourly} />

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
        </>
      ) : null}
    </div>
  );
}
