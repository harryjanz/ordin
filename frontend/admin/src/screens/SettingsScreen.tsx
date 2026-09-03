import { useState, useEffect, useCallback, useRef, type DragEvent } from "react";
import {
  Button, Dropdown, InputBase, Modal, Tab, Tabs, Toggle, Upload, UploadListFiles, makeToast,
  type DropdownOptions, type UploadFile,
} from "design-system";
import { QRCodeSVG } from "qrcode.react";
import api from "../api";
import { listCompanies } from "../api/companies";
import ConfirmDialog from "../components/ConfirmDialog";
import { clearDeviceTrustToken } from "../deviceTrust";
import { useStore } from "../store";
import { THEME_REGISTRY, resolveTheme, type ThemeName, type ThemeMode } from "../themes";
import type { Company, TotemVideo, TrustedDevice } from "../types";
import styles from "./SettingsScreen.module.scss";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

// Mini-preview da tela de boas-vindas do totem (~220px altura) — espelha a
// estrutura real de WelcomeScreen.tsx (totem), não uma composição própria.
// Precisou ser corrigido (2026-08) porque tinha ficado defasado de mudanças
// reais da WelcomeScreen: o ícone/logo foi removido de propósito na ORD-114
// (tela de boas-vindas não deve ter identificação do fornecedor de
// software, só da empresa) e o botão "Ver cardápio" nunca existiu na tela
// de verdade — os dois eram invenção deste preview, não refletiam a
// realidade. Mantido como uma réplica manual simplificada (não o
// componente de verdade) — é branding/preview do totem, fora do escopo da
// reconstrução visual do admin com o design system.
//
// Os tamanhos abaixo são a escala real de WelcomeScreen.tsx (FONT.headlineLg
// 52 / FONT.body 14 / FONT.headline 38 / FONT.bodyLg 16, círculo 88 com
// ícone 44) multiplicada por um único fator (0.5) — não valores "parecidos"
// escolhidos à mão — pra que as proporções entre nome/subtítulo/CTA/subtexto
// no preview batam com as da tela real. O ícone é o mesmo path do lucide-react
// `Hand` usado no totem (inline aqui pra não adicionar a dependência só por
// causa deste preview), colorido com stroke igual ao do totem — antes era um
// emoji, que não herda cor nenhuma do tema.
function TotemPreview({ name, mode }: { name: string; mode: string }) {
  const T = resolveTheme(name, mode);
  return (
    <div style={{
      borderRadius: 12,
      overflow: "hidden",
      border: `1px solid rgba(var(--a-neutral-rgb),0.08)`,
      height: 220,
      background: T.radial,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 24,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: FONT_D, fontWeight: 900, fontSize: 26, color: T.text, letterSpacing: "-0.5px", lineHeight: 1 }}>
          Sua empresa
        </div>
        <div style={{ fontFamily: FONT_D, color: T.roxo, fontSize: 7, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", marginTop: 2 }}>
          Autoatendimento
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: T.roxoSubtle,
          border: `2px solid ${T.roxo}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={T.roxo} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
            <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
            <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
          </svg>
        </div>
        <div style={{ fontFamily: FONT_D, fontSize: 19, fontWeight: 800, color: T.text, letterSpacing: "-0.25px" }}>
          Toque para começar
        </div>
        <div style={{ fontFamily: FONT_B, fontSize: 8, color: T.muted }}>
          Faça seu pedido em minutos
        </div>
      </div>
    </div>
  );
}

export default function SettingsScreen() {
  const role = useStore((s) => s.role);
  // superadmin e admin são equivalentes (gestão da plataforma, ver
  // docs/ARQUITETURA.md §1.2) — mesmo padrão de PaymentsScreen/OrdersScreen.
  const isPlatformAdmin = role === "superadmin" || role === "admin";
  // ORD-088: PIN/aparência/política de MFA são configuração da empresa —
  // cashier chega nesta tela só pela seção "Minha segurança" (2FA pessoal),
  // não deve ver/editar nada company-wide.
  const canManageCompany = isPlatformAdmin || role === "owner" || role === "manager";
  const ownCompanyId = useStore((s) => s.companyId);
  const selectedCompanyId = useStore((s) => s.selectedCompanyId);
  const setSelectedCompany = useStore((s) => s.setSelectedCompany);
  // ORD-082: valor de SESSÃO compartilhado (não um useState local isolado)
  // — selecionar uma empresa aqui também é o que CompanyScreen/PairScreen
  // já leem (selectedCompanyId ?? companyId), então a escolha se propaga
  // pras outras telas ao navegar, sem acoplar a UI de cada uma.
  const companyId = isPlatformAdmin ? selectedCompanyId : ownCompanyId;

  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    if (isPlatformAdmin) {
      listCompanies({ limit: 200 }).then((r) => setCompanies(r.companies)).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin]);

  const companyOptions: DropdownOptions[] = companies.map((c) => ({ value: String(c.id), label: c.name }));

  // ── ORD-094: abas ────────────────────────────────────────────────────────
  const [tab, setTab] = useState<"security" | "pin" | "appearance" | "behavior">("security");

  // ── PIN ───────────────────────────────────────────────────────────────────
  const [pin, setPin] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  function regenerate() {
    if (!companyId) return;
    setConfirmRegenerate(true);
  }

  async function doRegenerate() {
    setConfirmRegenerate(false);
    setPinLoading(true);
    try {
      const r = await api.post(`/companies/${companyId}/regenerate-pin`);
      setPin(r.data.pin ?? r.data.new_pin ?? "????");
    } finally {
      setPinLoading(false);
    }
  }

  // ── Aparência ─────────────────────────────────────────────────────────────
  const [localTheme, setLocalTheme] = useState<string>("ordin");
  const [localMode,  setLocalMode]  = useState<string>("light");
  // ORD-116 — menu de categorias do totem: "horizontal" (faixa de pills,
  // padrão) ou "vertical" (sidebar, melhor pra empresas com muitas
  // categorias).
  const [localMenuLayout, setLocalMenuLayout] = useState<string>("horizontal");
  // ORD-158 — timeout de inatividade do totem: minutos sem toque até
  // limpar o carrinho e voltar pra welcome, e segundos finais desse
  // período mostrando o aviso "Ainda está aí?" (janela dentro do próprio
  // timeout, não tempo extra — ver ORD-155).
  const [inactivityTimeoutMin, setInactivityTimeoutMin] = useState<number>(5);
  const [inactivityWarnSec, setInactivityWarnSec] = useState<number>(30);
  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    api.get(`/companies/${companyId}`).then((r) => {
      setLocalTheme(r.data.visual_theme ?? "ordin");
      setLocalMode(r.data.visual_mode  ?? "light");
      setLocalMenuLayout(r.data.catalog_menu_layout ?? "horizontal");
      setInactivityTimeoutMin(r.data.inactivity_timeout_min ?? 5);
      setInactivityWarnSec(r.data.inactivity_warn_sec ?? 30);
      setConsumptionModeEnabled(r.data.consumption_mode_enabled ?? false);
      setFulfillmentMode(r.data.fulfillment_mode ?? "por_item");
      setPrepUrgencyMinutes(r.data.prep_urgency_minutes ?? 10);
    }).catch(() => null);
  }, [companyId]);

  async function saveAppearance() {
    if (!companyId) return;
    // ORD-158 — validação client-side antes de bater no backend: evita a
    // viagem de rede pro caso mais comum de erro (aviso >= tempo total).
    if (inactivityWarnSec >= inactivityTimeoutMin * 60) {
      setSaveMsg({ ok: false, text: "Tempo de aviso não pode ser maior que o tempo de inatividade." });
      setTimeout(() => setSaveMsg(null), 4000);
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.patch(`/companies/${companyId}/appearance`, {
        theme: localTheme, mode: localMode, menu_layout: localMenuLayout,
        inactivity_timeout_min: inactivityTimeoutMin,
        inactivity_warn_sec: inactivityWarnSec,
      });
      setSaveMsg({ ok: true, text: "Aparência salva com sucesso!" });
    } catch {
      setSaveMsg({ ok: false, text: "Erro ao salvar. Tente novamente." });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  // ── Comportamento (ORD-108) ─────────────────────────────────────────────
  const [consumptionModeEnabled, setConsumptionModeEnabled] = useState(false);
  // ORD-118 — "por_item" (padrão, ticket unitário por item) ou
  // "retirada_unica" (produção centralizada, QR único por pedido).
  const [fulfillmentMode, setFulfillmentMode] = useState<string>("por_item");
  // ORD-119 — minutos até um pedido em preparo virar "urgente" (laranja na
  // metade do tempo, vermelho ao passar) no painel de retirada e na tela
  // de Preparo do admin. Só relevante com fulfillmentMode="retirada_unica".
  const [prepUrgencyMinutes, setPrepUrgencyMinutes] = useState<number>(10);
  const [savingBehavior, setSavingBehavior] = useState(false);
  const [saveBehaviorMsg, setSaveBehaviorMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const FULFILLMENT_MODE_OPTIONS: DropdownOptions[] = [
    { value: "por_item", label: "Por item — ticket individual, retirada por unidade" },
    { value: "retirada_unica", label: "Retirada única — QR único, pedido inteiro de uma vez" },
  ];

  async function saveBehavior() {
    if (!companyId) return;
    setSavingBehavior(true);
    setSaveBehaviorMsg(null);
    try {
      await api.patch(`/companies/${companyId}/behavior`, {
        consumption_mode_enabled: consumptionModeEnabled,
        fulfillment_mode: fulfillmentMode,
        prep_urgency_minutes: prepUrgencyMinutes,
      });
      setSaveBehaviorMsg({ ok: true, text: "Comportamento salvo com sucesso!" });
    } catch {
      setSaveBehaviorMsg({ ok: false, text: "Erro ao salvar. Tente novamente." });
    } finally {
      setSavingBehavior(false);
      setTimeout(() => setSaveBehaviorMsg(null), 3000);
    }
  }

  // ── Vídeos em modo espera do totem (ORD-115) ────────────────────────────
  const VIDEO_MAX_SIZE_MB = 500;
  const VIDEO_TYPES = ["video/mp4"];

  const [videos, setVideos] = useState<TotemVideo[]>([]);
  const [videoName, setVideoName] = useState("");
  const [videoUploadFiles, setVideoUploadFiles] = useState<UploadFile[]>([]);
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);
  const [confirmDeleteVideo, setConfirmDeleteVideo] = useState<TotemVideo | null>(null);

  function refreshVideos() {
    if (!companyId) return;
    api.get(`/companies/${companyId}/totem-videos`).then((r) => setVideos(r.data.videos)).catch(() => null);
  }
  useEffect(refreshVideos, [companyId]);

  async function uploadVideo(files: UploadFile[]) {
    const picked = files[0];
    if (!picked) return;
    if (picked.status === "error-read") {
      setVideoUploadFiles([picked]);
      return;
    }
    if (!videoName.trim()) {
      makeToast("error", "Dê um nome ao vídeo antes de enviar.");
      return;
    }
    if (!companyId) return;
    setVideoUploadFiles([{ ...picked, status: "loading" }]);
    setVideoUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append("name", videoName.trim());
      formData.append("video", picked.file);
      await api.post(`/companies/${companyId}/totem-videos`, formData, {
        onUploadProgress: (e) => {
          if (e.total) setVideoUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      setVideoName("");
      setVideoUploadFiles([]);
      makeToast("success", "Vídeo enviado com sucesso!");
      refreshVideos();
    } catch {
      setVideoUploadFiles([{ ...picked, status: "error-send" }]);
      makeToast("error", "Erro ao enviar o vídeo. Tente novamente.");
    } finally {
      setVideoUploadProgress(null);
    }
  }

  async function toggleVideo(video: TotemVideo) {
    if (!companyId) return;
    await api.patch(`/companies/${companyId}/totem-videos/${video.id}`, { active: !video.active });
    refreshVideos();
  }

  function deleteVideo(video: TotemVideo) {
    setConfirmDeleteVideo(video);
  }

  async function doDeleteVideo() {
    if (!companyId || !confirmDeleteVideo) return;
    await api.delete(`/companies/${companyId}/totem-videos/${confirmDeleteVideo.id}`);
    setConfirmDeleteVideo(null);
    refreshVideos();
  }

  // Reordenar por arrastar — mesmo padrão de produtos no catálogo
  // (CatalogScreen.tsx handleProductDrop).
  const [draggedVideoId, setDraggedVideoId] = useState<number | null>(null);

  function handleVideoDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  async function handleVideoDrop(e: DragEvent<HTMLDivElement>, targetId: number) {
    e.preventDefault();
    const sourceId = draggedVideoId;
    setDraggedVideoId(null);
    if (sourceId === null || sourceId === targetId || !companyId) return;
    const fromIndex = videos.findIndex((v) => v.id === sourceId);
    const toIndex = videos.findIndex((v) => v.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...videos];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setVideos(reordered);
    await api.put(`/companies/${companyId}/totem-videos/reorder`, {
      video_ids: reordered.map((v) => v.id),
    });
  }

  // Renomear em modal específica, pedida pelo usuário. Input NÃO
  // controlado (defaultValue + ref), mesmo padrão já usado no modal de
  // terminal do CompanyScreen.tsx — um input controlado (value/onChange)
  // re-renderiza o componente a cada tecla, e digitar dentro de um Modal
  // do design-system enquanto o pai re-renderiza tem bugs conhecidos de
  // perda de foco (ver patches em vendor/design-system/Modal.js). O resto
  // do sistema evita esse problema inteiro não usando input controlado
  // dentro de modal — seguindo o mesmo caminho aqui em vez de insistir em
  // mais patch no vendor.
  const [renameVideo, setRenameVideo] = useState<TotemVideo | null>(null);
  const [renameModalKey, setRenameModalKey] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  function openRenameVideo(video: TotemVideo) {
    setRenameVideo(video);
    setRenameModalKey((k) => k + 1);
  }

  const closeRenameModal = useCallback(() => setRenameVideo(null), []);

  async function saveRenameVideo() {
    const value = renameInputRef.current?.value.trim() ?? "";
    if (!companyId || !renameVideo || !value) return;
    setRenaming(true);
    try {
      await api.patch(`/companies/${companyId}/totem-videos/${renameVideo.id}`, { name: value });
      setRenameVideo(null);
      refreshVideos();
    } catch {
      makeToast("error", "Erro ao renomear o vídeo. Tente novamente.");
    } finally {
      setRenaming(false);
    }
  }

  const themes = Object.entries(THEME_REGISTRY) as [ThemeName, (typeof THEME_REGISTRY)[ThemeName]][];
  const showEmptyState = isPlatformAdmin && !companyId;
  // ORD-095: admin/superadmin "dentro" de uma empresa cliente (suporte) —
  // o 2FA da própria conta administrativa (empresa interna, ORD-093) não
  // tem nenhuma relação com a empresa selecionada, então não faz sentido
  // mostrar o card "Minha segurança" nesse contexto.
  const inSupportMode = isPlatformAdmin && !!companyId;

  // ── Segurança da empresa (política de MFA) ──────────────────────────────────
  const [mfaPolicy, setMfaPolicy] = useState<string>("disabled");
  const [mfaPolicySaving, setMfaPolicySaving] = useState(false);
  const MFA_POLICY_OPTIONS: DropdownOptions[] = [
    { value: "disabled", label: "Desativado — 2FA indisponível" },
    { value: "optional", label: "Opcional — cada usuário decide" },
    { value: "required", label: "Obrigatório — todo usuário precisa ativar" },
  ];

  useEffect(() => {
    if (!companyId) return;
    api.get(`/companies/${companyId}`).then((r) => {
      setMfaPolicy(r.data.mfa_policy ?? "disabled");
    }).catch(() => null);
  }, [companyId]);

  async function saveMfaPolicy(policy: string) {
    if (!companyId) return;
    setMfaPolicySaving(true);
    try {
      await api.put(`/companies/${companyId}/security`, { mfa_policy: policy });
      setMfaPolicy(policy);
      // ORD-094: sem isso, "Minha segurança" só reflete a política nova
      // depois de um refresh manual da tela (achado ao vivo pelo usuário).
      refreshMyMfaStatus();
      makeToast("success", "Política de duplo fator atualizada.");
    } catch {
      makeToast("error", "Erro ao salvar a política. Tente novamente.");
    } finally {
      setMfaPolicySaving(false);
    }
  }

  // ORD-095: desativar a política da empresa apaga o 2FA e os dispositivos
  // confiáveis de TODOS os usuários dela (cascata no backend) — ação
  // destrutiva demais pra aplicar direto no onValueSelected, precisa de
  // confirmação. Trocar entre "opcional"/"obrigatório" continua imediato.
  const [confirmDisableMfa, setConfirmDisableMfa] = useState(false);

  function onMfaPolicySelected(policy: string) {
    if (policy === "disabled" && mfaPolicy !== "disabled") {
      setConfirmDisableMfa(true);
      return;
    }
    saveMfaPolicy(policy);
  }

  // ── Minha segurança (2FA pessoal) — independente da empresa selecionada,
  // opera sobre o próprio usuário logado (JWT), não sobre `companyId`.
  const [myMfaEnabled, setMyMfaEnabled] = useState<boolean | null>(null);
  const [myMfaCompanyPolicy, setMyMfaCompanyPolicy] = useState<string>("disabled");
  const [mfaStep, setMfaStep] = useState<"idle" | "setup" | "backup-codes">("idle");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaUri, setMfaUri] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaBackupCodes, setMfaBackupCodes] = useState<string[]>([]);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaDisablePassword, setMfaDisablePassword] = useState("");
  const [mfaShowDisable, setMfaShowDisable] = useState(false);

  function refreshMyMfaStatus() {
    api.get("/users/me/mfa/status").then((r) => {
      setMyMfaEnabled(r.data.mfa_enabled);
      setMyMfaCompanyPolicy(r.data.mfa_policy);
    }).catch(() => null);
  }

  useEffect(refreshMyMfaStatus, []);

  // ── ORD-092: dispositivos confiáveis ────────────────────────────────────
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);

  function refreshTrustedDevices() {
    api.get("/users/me/trusted-devices").then((r) => setTrustedDevices(r.data.devices)).catch(() => null);
  }

  useEffect(refreshTrustedDevices, []);

  async function revokeTrustedDevice(id: number) {
    await api.delete(`/users/me/trusted-devices/${id}`);
    refreshTrustedDevices();
    makeToast("success", "Dispositivo revogado.");
  }

  function forgetThisDevice() {
    // Só limpa o token guardado neste navegador — sem ele, este navegador
    // nunca mais consegue provar que já passou pelo 2FA, mesmo que a linha
    // no servidor ainda exista (expira sozinha em 7 dias, sem uso).
    clearDeviceTrustToken();
    makeToast("success", "Este dispositivo não será mais reconhecido automaticamente.");
  }

  async function startMfaSetup() {
    setMfaBusy(true);
    setMfaError(null);
    try {
      const r = await api.post("/users/me/mfa/setup");
      setMfaSecret(r.data.secret);
      setMfaUri(r.data.provisioning_uri);
      setMfaStep("setup");
    } catch {
      makeToast("error", "Não foi possível iniciar a ativação. Tente novamente.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function confirmMfaSetup() {
    setMfaBusy(true);
    setMfaError(null);
    try {
      const r = await api.post("/users/me/mfa/confirm", { code: mfaCode });
      setMfaBackupCodes(r.data.backup_codes);
      setMfaStep("backup-codes");
      // myMfaEnabled só vira true no fim (finishMfaSetup) — enquanto fica
      // true aqui, a renderização (que checa myMfaEnabled antes de mfaStep)
      // pula direto pro estado "ativo" e nunca mostra os códigos de backup,
      // a única chance que o usuário tem de salvá-los (achado ao vivo).
    } catch {
      setMfaError("Código inválido. Confira o app autenticador e tente de novo.");
    } finally {
      setMfaBusy(false);
    }
  }

  function finishMfaSetup() {
    setMfaStep("idle");
    setMfaCode("");
    setMfaSecret("");
    setMfaUri("");
    setMfaBackupCodes([]);
    setMyMfaEnabled(true);
  }

  async function disableMyMfa() {
    setMfaBusy(true);
    setMfaError(null);
    try {
      await api.post("/users/me/mfa/disable", { password: mfaDisablePassword });
      setMyMfaEnabled(false);
      setMfaShowDisable(false);
      setMfaDisablePassword("");
      refreshTrustedDevices();
      makeToast("success", "Duplo fator desativado.");
    } catch (e: unknown) {
      // ORD-096, achado ao vivo: erro genérico "Senha incorreta" também
      // aparecia quando o motivo real era a conta ser de plataforma (403,
      // duplo fator obrigatório e permanente) — mensagem enganosa, já que
      // a senha estava certa.
      const axErr = e as { response?: { status?: number } };
      setMfaError(
        axErr?.response?.status === 403
          ? "Duplo fator é obrigatório para contas da plataforma e não pode ser desativado."
          : "Senha incorreta."
      );
    } finally {
      setMfaBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.title}>Configurações</div>

      {isPlatformAdmin && (
        <div className={styles.companySelector}>
          <Dropdown
            label="Empresa"
            placeholder="Selecionar empresa…"
            value={companyOptions.find((o) => o.value === String(companyId ?? "")) ?? null}
            onValueSelected={(opt) => setSelectedCompany(Number(opt.value))}
            options={companyOptions}
          />
        </div>
      )}

      {/* ── ORD-094: abas — só aparecem pra quem também gerencia a empresa
          (owner/manager/superadmin/admin). cashier só tem acesso ao
          conteúdo de Segurança, então vai direto pra ele, sem barra de
          abas com uma opção só. */}
      {canManageCompany && (
        <div className={styles.tabs}>
          <Tabs activeTab={tab} onSelectTab={(v) => setTab(v as typeof tab)}>
            <Tab value="security" label="Segurança" />
            <Tab value="pin" label="PIN do totem" />
            <Tab value="appearance" label="Aparência do totem" />
            <Tab value="behavior" label="Comportamento" />
          </Tabs>
        </div>
      )}

      {(!canManageCompany || tab === "security") && (
      <>
      {/* ── Card Segurança da empresa (política de MFA) ─────────────────── */}
      {canManageCompany && (
        showEmptyState ? (
          <div className={styles.empty}>Selecione uma empresa para gerenciar a segurança da empresa.</div>
        ) : (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Segurança da empresa</div>
            <div className={styles.cardDesc}>
              Define se o duplo fator de autenticação é opcional ou obrigatório para os usuários desta empresa.
            </div>
            <Dropdown
              label="Duplo fator (2FA)"
              value={MFA_POLICY_OPTIONS.find((o) => o.value === mfaPolicy) ?? null}
              onValueSelected={(opt) => onMfaPolicySelected(String(opt.value))}
              options={MFA_POLICY_OPTIONS}
              disabled={mfaPolicySaving}
            />
          </div>
        )
      )}

      {/* ── Card Minha segurança (2FA pessoal) ────────────────────────────
          Visível pra quem opera sobre o próprio usuário logado — não pra
          admin/superadmin em modo suporte (empresa cliente selecionada),
          já que o 2FA da própria conta administrativa não tem nenhuma
          relação com a empresa sendo suportada (ORD-095). */}
      {!inSupportMode && (
      <div className={styles.card}>
        <div className={styles.cardTitle}>Minha segurança</div>
        {myMfaCompanyPolicy === "disabled" ? (
          <div className={styles.cardDesc}>
            Duplo fator de autenticação não está disponível — a empresa ainda não habilitou essa opção.
          </div>
        ) : myMfaEnabled === null ? (
          <div className={styles.cardDesc}>Carregando…</div>
        ) : myMfaEnabled ? (
          <>
            <div className={styles.cardDesc}>
              Duplo fator está <strong>ativo</strong> na sua conta. A cada login, além da senha, você precisa
              informar o código do app autenticador.
            </div>
            {isPlatformAdmin ? (
              // ORD-096: duplo fator é obrigatório e permanente pra contas
              // de plataforma — nem oferece o botão, já que a tentativa
              // sempre seria rejeitada pelo backend (403).
              <div className={styles.cardDesc}>
                Duplo fator é obrigatório para contas da plataforma e não pode ser desativado.
              </div>
            ) : !mfaShowDisable ? (
              <Button variant="secondary" onClick={() => setMfaShowDisable(true)}>
                Desativar duplo fator
              </Button>
            ) : (
              <div className={styles.mfaInline}>
                <InputBase
                  type="password"
                  label="Confirme sua senha para desativar"
                  value={mfaDisablePassword}
                  onChange={(e) => setMfaDisablePassword(e.target.value)}
                  errorMessage={mfaError ?? undefined}
                />
                <div className={styles.formActions}>
                  <Button onClick={disableMyMfa} loading={mfaBusy} disabled={!mfaDisablePassword}>
                    Confirmar desativação
                  </Button>
                  <Button variant="secondary" onClick={() => { setMfaShowDisable(false); setMfaError(null); setMfaDisablePassword(""); }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            <div className={styles.trustedDevicesBlock}>
              <div className={styles.formLabel}>Dispositivos confiáveis</div>
              {trustedDevices.length === 0 ? (
                <div className={styles.cardDesc}>Nenhum dispositivo confiável ativo no momento.</div>
              ) : (
                trustedDevices.map((d) => (
                  <div key={d.id} className={styles.trustedDeviceRow}>
                    <div>
                      <div className={styles.trustedDeviceLabel}>{d.device_label || "Dispositivo sem identificação"}</div>
                      <div className={styles.trustedDeviceMeta}>
                        Válido até {new Date(d.expires_at).toLocaleString("pt-BR")}
                        {d.last_used_at && ` · último uso ${new Date(d.last_used_at).toLocaleString("pt-BR")}`}
                      </div>
                    </div>
                    <Button size="small" variant="secondary" onClick={() => revokeTrustedDevice(d.id)}>
                      Remover
                    </Button>
                  </div>
                ))
              )}
              <Button size="small" variant="secondary" onClick={forgetThisDevice}>
                Esquecer este dispositivo
              </Button>
            </div>
          </>
        ) : mfaStep === "idle" ? (
          <>
            <div className={styles.cardDesc}>
              Duplo fator está <strong>desativado</strong> na sua conta. Ative para exigir um código do app
              autenticador (Google Authenticator, Authy, 1Password…) a cada login, além da senha.
            </div>
            <Button onClick={startMfaSetup} loading={mfaBusy} disabled={mfaBusy}>
              Ativar duplo fator
            </Button>
          </>
        ) : mfaStep === "setup" ? (
          <div className={styles.mfaInline}>
            <div className={styles.cardDesc}>
              Escaneie o QR code com o app autenticador e digite o código de 6 dígitos gerado para confirmar.
            </div>
            <div className={styles.mfaQrRow}>
              <QRCodeSVG value={mfaUri} size={200} />
              <div className={styles.mfaSecretFallback}>
                Não consegue escanear? Digite o código manualmente: <code>{mfaSecret}</code>
              </div>
            </div>
            <InputBase
              label="Código de 6 dígitos"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              errorMessage={mfaError ?? undefined}
              maxLength={6}
            />
            <div className={styles.formActions}>
              <Button onClick={confirmMfaSetup} loading={mfaBusy} disabled={mfaCode.length !== 6}>
                Confirmar ativação
              </Button>
              <Button variant="secondary" onClick={finishMfaSetup}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.mfaInline}>
            <div className={styles.cardDesc}>
              Duplo fator ativado! Guarde estes 10 códigos de backup — cada um funciona uma única vez e serve
              para entrar caso você perca o acesso ao app autenticador. <strong>Eles não serão mostrados de novo.</strong>
            </div>
            <div className={styles.mfaBackupCodes}>
              {mfaBackupCodes.map((c) => <code key={c}>{c}</code>)}
            </div>
            <Button onClick={finishMfaSetup}>Já salvei meus códigos</Button>
          </div>
        )}
      </div>
      )}
      </>
      )}

      {canManageCompany && tab === "pin" && (
        showEmptyState ? (
          <div className={styles.empty}>Selecione uma empresa para gerenciar o PIN do totem.</div>
        ) : (
          <>
          {/* ── Card PIN ─────────────────────────────────────────────────── */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>PIN do totem</div>
            <div className={styles.cardDesc}>
              O PIN de 6 dígitos é usado pela equipe da loja para acessar o totem.
              Após regenerar, o PIN antigo é imediatamente invalidado.
            </div>
            <Button onClick={regenerate} disabled={!companyId} loading={pinLoading}>
              Regenerar PIN
            </Button>
            {pin && (
              <>
                <div className={styles.pinBox}>{pin}</div>
                <div className={styles.pinHint}>Anote este PIN — ele não será exibido novamente.</div>
              </>
            )}
          </div>
          </>
        )
      )}

      {canManageCompany && tab === "appearance" && (
        showEmptyState ? (
          <div className={styles.empty}>Selecione uma empresa para gerenciar a aparência do totem.</div>
        ) : (
          <>
          {/* ── Card Aparência ───────────────────────────────────────────── */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Aparência do totem</div>
            <div className={styles.cardDesc}>
              Escolha o tema visual e o modo de cor. O totem aplica a configuração automaticamente no próximo login.
            </div>

            {/* Grade de temas */}
            <div className={styles.themeGrid}>
              {themes.map(([key, entry]) => {
                const selected = localTheme === key;
                return (
                  <div
                    key={key}
                    onClick={() => setLocalTheme(key)}
                    className={`${styles.themeCard} ${selected ? styles.themeCardSelected : ""}`}
                  >
                    <div className={styles.themeCardHead}>
                      <div className={styles.themeCardLabel}>{entry.label}</div>
                      {selected && <div className={styles.themeCardCheck}>✓</div>}
                    </div>
                    <div className={styles.themeCardDesc}>{entry.description}</div>
                    <div className={styles.themeCardDots}>
                      {entry.colors.map((c: string, i: number) => (
                        <div key={i} className={styles.themeCardDot} style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modo light/dark */}
            <div className={styles.modeRow}>
              <span className={styles.modeLabel}>Modo:</span>
              <Toggle
                name="totem-appearance-mode"
                checked={localMode === "dark"}
                onChange={() => setLocalMode(localMode === "dark" ? "light" : "dark")}
              />
              <span className={styles.modeValueLabel}>{localMode === "dark" ? "Escuro" : "Claro"}</span>
            </div>

            {/* Menu de categorias (ORD-116) — útil pra empresas com muitas categorias */}
            <div className={styles.modeRow}>
              <span className={styles.modeLabel}>Menu de categorias:</span>
              <Toggle
                name="totem-catalog-menu-layout"
                checked={localMenuLayout === "vertical"}
                onChange={() => setLocalMenuLayout(localMenuLayout === "vertical" ? "horizontal" : "vertical")}
              />
              <span className={styles.modeValueLabel}>{localMenuLayout === "vertical" ? "Vertical" : "Horizontal"}</span>
            </div>

            {/* Timeout de inatividade (ORD-158) — antes era constante fixa
                no totem (ver ORD-155), agora configurável por empresa. */}
            <div className={styles.cardTitle} style={{ marginTop: 24 }}>Inatividade do totem</div>
            <div className={styles.cardDesc}>
              Tempo sem toque até o totem limpar o carrinho e voltar pra tela de boas-vindas, e
              quanto tempo antes disso o aviso "Ainda está aí?" aparece. Padrão: 5 minutos / 30
              segundos.
            </div>
            <div className={styles.formRow}>
              <InputBase
                type="number"
                label="Minutos até resetar"
                value={String(inactivityTimeoutMin)}
                onChange={(e) => setInactivityTimeoutMin(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                disabled={saving}
              />
              <InputBase
                type="number"
                label="Segundos de aviso antes do reset"
                value={String(inactivityWarnSec)}
                onChange={(e) => setInactivityWarnSec(Math.max(5, Math.min(120, Number(e.target.value) || 5)))}
                disabled={saving}
              />
            </div>

            {/* Preview ao vivo */}
            <div className={styles.previewSection}>
              <div className={styles.previewLabel}>Preview ao vivo</div>
              <TotemPreview name={localTheme} mode={localMode} />
            </div>

            {/* Salvar */}
            <div className={styles.saveRow}>
              <Button
                onClick={saveAppearance}
                disabled={!companyId}
                loading={saving}
              >
                Salvar aparência
              </Button>
              {saveMsg && (
                <span className={`${styles.saveMsg} ${saveMsg.ok ? styles.saveMsgOk : styles.saveMsgErr}`}>
                  {saveMsg.text}
                </span>
              )}
            </div>
          </div>

          {/* ── Card Vídeos em modo espera (ORD-115) ─────────────────────── */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Vídeos em modo espera</div>
            <div className={styles.cardDesc}>
              Enquanto o totem está ocioso, ele mostra os vídeos ativos em loop, um após o outro,
              no lugar da tela estática. Sem nenhum vídeo ativo, a tela estática continua normalmente.
            </div>

            <div className={styles.formLabel}>Nome do vídeo</div>
            <InputBase
              aria-label="Nome do vídeo"
              value={videoName}
              onChange={(e) => setVideoName(e.target.value)}
              maxLength={100}
              placeholder="Ex: Promoção combo verão"
            />

            <div style={{ marginTop: 16 }}>
              <Upload
                fullWidth
                maxFileSize={VIDEO_MAX_SIZE_MB}
                multipleFiles={false}
                types={VIDEO_TYPES}
                showMaxFileSize={false}
                helperMessage="MP4, até 500 MB"
                errorMessage="Envie um arquivo MP4 de até 500 MB"
                onCallbackUpload={uploadVideo}
              />
              <UploadListFiles items={videoUploadFiles} removable={false} />
              {videoUploadProgress !== null && (
                <div className={styles.cardDesc} style={{ marginTop: 8, marginBottom: 0 }}>
                  Enviando… {videoUploadProgress}%
                </div>
              )}
            </div>

            <div className={styles.trustedDevicesBlock} style={{ marginTop: 20 }}>
              {videos.length === 0 ? (
                <div className={styles.cardDesc} style={{ marginBottom: 0 }}>Nenhum vídeo enviado ainda.</div>
              ) : (
                videos.map((v) => (
                  <div
                    key={v.id}
                    className={`${styles.trustedDeviceRow} ${draggedVideoId === v.id ? styles.itemDragging : ""}`}
                    draggable
                    onDragStart={() => setDraggedVideoId(v.id)}
                    onDragOver={handleVideoDragOver}
                    onDrop={(e) => handleVideoDrop(e, v.id)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={styles.dragHandle} title="Arraste para reordenar">⠿</span>
                      <div>
                        <div className={styles.trustedDeviceLabel}>{v.name}</div>
                        <div className={styles.trustedDeviceMeta}>{v.active ? "Ativo" : "Inativo"}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <Toggle
                        name={`video-active-${v.id}`}
                        checked={v.active}
                        onChange={() => toggleVideo(v)}
                      />
                      <Button size="small" variant="secondary" onClick={() => openRenameVideo(v)}>
                        Editar
                      </Button>
                      <Button size="small" variant="secondary" onClick={() => deleteVideo(v)}>
                        Excluir
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          </>
        )
      )}

      {canManageCompany && tab === "behavior" && (
        showEmptyState ? (
          <div className={styles.empty}>Selecione uma empresa para gerenciar o comportamento do totem.</div>
        ) : (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Consumo no local ou para levar</div>
            <div className={styles.cardDesc}>
              Quando ativado, o totem pergunta ao cliente se o pedido é pra comer no local ou pra levar,
              antes do pagamento. A escolha aparece pro atendimento/cozinha junto do pedido.
            </div>

            <div className={styles.modeRow}>
              <Toggle
                name="consumption-mode-enabled"
                checked={consumptionModeEnabled}
                onChange={() => setConsumptionModeEnabled((v) => !v)}
              />
              <span className={styles.modeValueLabel}>
                {consumptionModeEnabled ? "Ativado" : "Desativado"}
              </span>
            </div>

            <div className={styles.cardTitle} style={{ marginTop: 24 }}>Modelo de atendimento</div>
            <div className={styles.cardDesc}>
              "Por item" é o padrão hoje: cada unidade de cada item vira um ticket com QR
              próprio, retirado individualmente. "Retirada única" é pra quem tem produção
              centralizada (cozinha prepara tudo e entrega o pedido inteiro de uma vez, modelo
              McDonald's/Burger King) — o ticket impresso vira uma lista compacta com um único
              QR pro pedido inteiro.
            </div>
            <Dropdown
              label="Modelo de atendimento"
              value={FULFILLMENT_MODE_OPTIONS.find((o) => o.value === fulfillmentMode) ?? null}
              onValueSelected={(opt) => setFulfillmentMode(String(opt.value))}
              options={FULFILLMENT_MODE_OPTIONS}
              disabled={savingBehavior}
            />

            {fulfillmentMode === "retirada_unica" && (
              <>
                <div className={styles.cardTitle} style={{ marginTop: 24 }}>Tempo até urgência no preparo</div>
                <div className={styles.cardDesc}>
                  Minutos que um pedido pode ficar em preparo antes de ser sinalizado como
                  urgente no painel de retirada e na tela de Preparo — laranja na metade do
                  tempo, vermelho ao passar. Padrão: 10 minutos.
                </div>
                <InputBase
                  type="number"
                  label="Minutos até urgência"
                  value={String(prepUrgencyMinutes)}
                  onChange={(e) => setPrepUrgencyMinutes(Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
                  disabled={savingBehavior}
                />
              </>
            )}

            <div className={styles.saveRow} style={{ marginTop: 24 }}>
              <Button
                onClick={saveBehavior}
                disabled={!companyId}
                loading={savingBehavior}
              >
                Salvar comportamento
              </Button>
              {saveBehaviorMsg && (
                <span className={`${styles.saveMsg} ${saveBehaviorMsg.ok ? styles.saveMsgOk : styles.saveMsgErr}`}>
                  {saveBehaviorMsg.text}
                </span>
              )}
            </div>
          </div>
        )
      )}

      <ConfirmDialog
        open={confirmRegenerate}
        message="Gerar novo PIN? O PIN atual será invalidado."
        onConfirm={doRegenerate}
        onCancel={() => setConfirmRegenerate(false)}
      />

      <ConfirmDialog
        open={confirmDisableMfa}
        message="Desativar o duplo fator da empresa vai remover o 2FA e os dispositivos confiáveis de TODOS os usuários da empresa, imediatamente. Essa ação não pode ser desfeita. Deseja continuar?"
        onConfirm={() => { setConfirmDisableMfa(false); saveMfaPolicy("disabled"); }}
        onCancel={() => setConfirmDisableMfa(false)}
      />

      <ConfirmDialog
        open={!!confirmDeleteVideo}
        message={`Excluir o vídeo "${confirmDeleteVideo?.name}"? Essa ação não pode ser desfeita.`}
        onConfirm={doDeleteVideo}
        onCancel={() => setConfirmDeleteVideo(null)}
      />

      <Modal
        open={!!renameVideo}
        width={420}
        onClose={closeRenameModal}
        onBackdropClick={closeRenameModal}
        onCloseButtonClick={closeRenameModal}
      >
        <div key={renameModalKey}>
          <div className={styles.cardTitle} style={{ marginBottom: 16 }}>Editar nome do vídeo</div>
          <InputBase
            aria-label="Novo nome do vídeo"
            defaultValue={renameVideo?.name}
            ref={renameInputRef}
            maxLength={100}
            autoFocus
          />
          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <Button onClick={saveRenameVideo} loading={renaming}>
              Salvar
            </Button>
            <Button variant="secondary" onClick={() => setRenameVideo(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
