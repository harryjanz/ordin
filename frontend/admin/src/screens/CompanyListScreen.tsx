import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listCompanies, type ContractStatusFilter } from "../api/companies";
import { parseApiError } from "../lib/apiErrors";
import { formatCnpj } from "../lib/masks";
import type { Company } from "../types";

const LIMIT = 50;

const STATUS_LABEL: Record<string, string> = { pendente: "Pendente", enviado: "Enviado", assinado: "Assinado" };

const S = {
  page: { padding: 32, color: "#DFE8ED", maxWidth: 1180 } as React.CSSProperties,
  eyebrow: { fontFamily: "'Lexend', sans-serif", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9900ff", fontWeight: 600 } as React.CSSProperties,
  pagehead: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, marginTop: 6, marginBottom: 24, flexWrap: "wrap" } as React.CSSProperties,
  title: { fontFamily: "'Lexend', sans-serif", fontSize: 24, fontWeight: 600, margin: 0 } as React.CSSProperties,
  btnPrimary: { fontFamily: "'Lexend', sans-serif", fontSize: 13.5, fontWeight: 600, padding: "11px 20px", borderRadius: 9, border: "none", background: "#9900ff", color: "#fff", cursor: "pointer" } as React.CSSProperties,
  btnGhost: { fontFamily: "'Lexend', sans-serif", fontSize: 13.5, fontWeight: 600, padding: "11px 20px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(223,232,237,0.7)", cursor: "pointer" } as React.CSSProperties,
  filterbar: { display: "grid", gridTemplateColumns: "2fr 1.3fr 1fr auto", gap: 12, alignItems: "end", background: "#1d1434", border: "1px solid rgba(153,0,255,0.2)", borderRadius: 14, padding: "18px 20px", marginBottom: 18 } as React.CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 6 } as React.CSSProperties,
  label: { fontSize: 11, fontWeight: 600, color: "rgba(223,232,237,0.5)", textTransform: "uppercase", letterSpacing: "0.04em" } as React.CSSProperties,
  input: { fontSize: 13.5, color: "#DFE8ED", background: "#0e0b1a", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 9, padding: "10px 12px", outline: "none", width: "100%" } as React.CSSProperties,
  filterCount: { fontSize: 12, color: "rgba(223,232,237,0.5)", marginBottom: 14 } as React.CSSProperties,
  tablewrap: { background: "#1d1434", border: "1px solid rgba(153,0,255,0.2)", borderRadius: 14, overflow: "hidden" } as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" } as React.CSSProperties,
  th: { textAlign: "left", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(223,232,237,0.5)", padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.15)" } as React.CSSProperties,
  td: { padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)", verticalAlign: "middle" } as React.CSSProperties,
  tr: { cursor: "pointer" } as React.CSSProperties,
  rowname: { fontWeight: 600, fontSize: 13.5 } as React.CSSProperties,
  rowsub: { fontSize: 11.5, color: "rgba(223,232,237,0.5)", marginTop: 2, fontFamily: "'Courier New', monospace" } as React.CSSProperties,
  chip: (kind: "success" | "warn" | "neutral") => ({
    display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'Lexend', sans-serif", fontSize: 10.5,
    fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 999,
    background: kind === "success" ? "rgba(93,212,144,0.16)" : kind === "warn" ? "rgba(255,184,77,0.16)" : "rgba(255,255,255,0.07)",
    color: kind === "success" ? "#5DD490" : kind === "warn" ? "#ffb84d" : "rgba(223,232,237,0.5)",
  } as React.CSSProperties),
  pager: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", fontSize: 12.5, color: "rgba(223,232,237,0.5)" } as React.CSSProperties,
  empty: { padding: "48px 20px", textAlign: "center", color: "rgba(223,232,237,0.5)" } as React.CSSProperties,
  errBox: { padding: "12px 14px", background: "rgba(255,77,109,0.10)", border: "1px solid rgba(255,77,109,0.3)", borderRadius: 10, marginBottom: 16, fontSize: 13 } as React.CSSProperties,
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function CompanyListScreen() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [document, setDocumentFilter] = useState("");
  const [contractStatus, setContractStatus] = useState<ContractStatusFilter>("");
  const [skip, setSkip] = useState(0);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const isFirstRender = useRef(true);

  // Contador de requisições — evita que uma resposta antiga (ex: fetch
  // disparado com o CNPJ ainda incompleto, "11.222") chegue DEPOIS da
  // resposta mais recente e sobrescreva o resultado certo com um errado.
  // Sem isso, digitar rápido podia fazer o filtro "não funcionar" mesmo
  // com a query final correta, por causa da ordem de chegada das respostas.
  const requestId = useRef(0);

  async function fetchCompanies() {
    const thisRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listCompanies({ q, document, contractStatus, skip, limit: LIMIT });
      if (thisRequest !== requestId.current) return; // resposta obsoleta, ignorar
      setCompanies(result.companies);
      setTotal(result.total);
    } catch (err) {
      if (thisRequest !== requestId.current) return;
      setError(parseApiError(err).message);
    } finally {
      if (thisRequest === requestId.current) setLoading(false);
    }
  }

  // Busca por nome e CNPJ têm debounce (mesmo padrão do lookup de CNPJ do
  // wizard, NewCompanyScreen.tsx) — os dois vêm de digitação contínua.
  // Status e paginação disparam a busca na hora, vêm de select/clique, não
  // de digitação. A carga inicial (sem filtro nenhum) é feita pelo segundo
  // effect; este só reage a mudanças subsequentes de q/document, pra não
  // duplicar a primeira busca.
  useEffect(() => {
    if (isFirstRender.current) return;
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { setSkip(0); fetchCompanies(); }, 500);
    return () => clearTimeout(debounceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, document]);

  useEffect(() => {
    fetchCompanies();
    isFirstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractStatus, skip]);

  function clearFilters() {
    setQ("");
    setDocumentFilter("");
    setContractStatus("");
    setSkip(0);
  }

  const hasFilter = Boolean(q || document || contractStatus);
  const page = Math.floor(skip / LIMIT) + 1;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div style={S.page}>
      <div style={S.pagehead}>
        <div>
          <div style={S.eyebrow}>Empresas</div>
          <h1 style={S.title}>Clientes</h1>
        </div>
        <button style={S.btnPrimary} onClick={() => navigate("/companies/new")}>+ Novo cliente</button>
      </div>

      <div style={S.filterbar}>
        <div style={S.field}>
          <label style={S.label}>Razão social ou nome fantasia</label>
          <input style={S.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome…" data-testid="input-busca-nome" />
        </div>
        <div style={S.field}>
          <label style={S.label}>CNPJ</label>
          <input
            style={{ ...S.input, fontFamily: "'Courier New', monospace" }}
            value={formatCnpj(document)}
            onChange={(e) => setDocumentFilter(e.target.value)}
            placeholder="XX.XXX.XXX/XXXX-XX"
            data-testid="input-filtro-cnpj"
          />
        </div>
        <div style={S.field}>
          <label style={S.label}>Status do contrato</label>
          <select
            style={S.input}
            value={contractStatus}
            onChange={(e) => setContractStatus(e.target.value as ContractStatusFilter)}
            data-testid="select-filtro-status"
          >
            <option value="">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="enviado">Enviado</option>
            <option value="assinado">Assinado</option>
          </select>
        </div>
        <button style={S.btnGhost} onClick={clearFilters} disabled={!hasFilter} data-testid="btn-limpar-filtros">Limpar</button>
      </div>

      {error && <div style={S.errBox}>{error}</div>}

      {/* Só bloqueia a tela inteira na primeiríssima carga (nada foi
          exibido ainda). Em buscas subsequentes o resultado anterior
          continua visível com um "Atualizando…" ao lado do contador — a
          tela nunca fica em branco durante um fetch, que era exatamente o
          efeito que fazia o filtro de CNPJ parecer quebrado ao digitar. */}
      {loading && companies.length === 0 && total === 0 && !error && (
        <div style={S.filterCount}>Carregando…</div>
      )}

      {!error && (companies.length > 0 || total > 0) && (
        <div style={S.filterCount} data-testid="contador-resultados">
          <strong>{total}</strong> cliente{total === 1 ? "" : "s"} encontrado{total === 1 ? "" : "s"}
          {loading && <span style={{ marginLeft: 8 }}>· Atualizando…</span>}
        </div>
      )}

      {!loading && !error && companies.length === 0 && total === 0 && (
        <div style={S.tablewrap}>
          <div style={S.empty} data-testid="empty-state">
            <p>Nenhum cliente encontrado{hasFilter ? " para os filtros aplicados" : ""}.</p>
            {hasFilter && <button style={{ ...S.btnGhost, marginTop: 12 }} onClick={clearFilters}>Limpar filtros</button>}
          </div>
        </div>
      )}

      {!error && companies.length > 0 && (
        <div style={S.tablewrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Cliente</th>
                <th style={S.th}>CNPJ</th>
                <th style={S.th}>Situação Receita</th>
                <th style={S.th}>Status contrato</th>
                <th style={S.th}>Cadastrado em</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr
                  key={c.id}
                  style={S.tr}
                  onClick={() => navigate(`/companies/${c.id}/contract`)}
                  data-testid={`row-company-${c.id}`}
                >
                  <td style={S.td}>
                    <div style={S.rowname}>{c.name}</div>
                    {c.legal_name && <div style={S.rowsub}>{c.legal_name}</div>}
                  </td>
                  <td style={{ ...S.td, fontFamily: "'Courier New', monospace" }}>{formatCnpj(c.document ?? "")}</td>
                  <td style={S.td}>
                    <span style={S.chip(c.cadastral_status === "ATIVA" ? "success" : "neutral")}>
                      {c.cadastral_status === "ATIVA" ? "Ativa" : c.cadastral_status ?? "Não verificada"}
                    </span>
                  </td>
                  <td style={S.td}>
                    <span style={S.chip(c.contract_status === "assinado" ? "success" : "warn")}>
                      {STATUS_LABEL[c.contract_status ?? "pendente"]}
                    </span>
                  </td>
                  <td style={{ ...S.td, fontFamily: "'Courier New', monospace" }}>{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={S.pager}>
            <span>Mostrando {skip + 1}–{Math.min(skip + LIMIT, total)} de {total}</span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button style={S.btnGhost} disabled={skip === 0} onClick={() => setSkip((s) => Math.max(0, s - LIMIT))} data-testid="btn-pagina-anterior">Anterior</button>
              <span>Página {page} de {totalPages}</span>
              <button style={S.btnGhost} disabled={skip + LIMIT >= total} onClick={() => setSkip((s) => s + LIMIT)} data-testid="btn-pagina-proxima">Próxima</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
