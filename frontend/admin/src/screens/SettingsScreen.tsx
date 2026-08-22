import { useState, useEffect, type DragEvent } from "react";
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

// Mini-preview da WelcomeScreen do totem (~220px altura)
// Mantido como está — é branding/preview do totem, não do admin (fora do
// escopo da reconstrução visual do admin com o design system).
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
      gap: 12,
      position: "relative",
    }}>
      {/* Logo */}
      <svg width={36} height={36} viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill={T.roxo} />
        <circle cx="24" cy="22" r="10" stroke="white" strokeWidth="3.5" fill="none" />
        <circle cx="24" cy="22" r="4" fill="white" />
        <rect x="14" y="34" width="20" height="3" rx="1.5" fill="white" opacity="0.4" />
      </svg>
      <div style={{ fontFamily: FONT_D, fontWeight: 900, fontSize: 18, color: T.text, letterSpacing: "-0.5px" }}>
        Sua empresa
      </div>
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: T.roxoSubtle,
          border: `2px solid ${T.roxo}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16,
        }}>
          👆
        </div>
        <div style={{ fontFamily: FONT_D, fontSize: 14, fontWeight: 700, color: T.text }}>
          Toque para começar
        </div>
        <div style={{ fontFamily: FONT_B, fontSize: 11, color: T.muted }}>
          Faça seu pedido em minutos
        </div>
      </div>
      {/* Pill de botão de exemplo */}
      <div style={{
        position: "absolute", bottom: 12, left: 12, right: 12,
        background: T.btn, color: T.btnText,
        borderRadius: 999, padding: "6px 0",
        textAlign: "center",
        fontFamily: FONT_D, fontWeight: 800, fontSize: 11,
        boxShadow: T.glow,
      }}>
        Ver cardápio →
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
  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    api.get(`/companies/${companyId}`).then((r) => {
      setLocalTheme(r.data.visual_theme ?? "ordin");
      setLocalMode(r.data.visual_mode  ?? "light");
      setConsumptionModeEnabled(r.data.consumption_mode_enabled ?? false);
    }).catch(() => null);
  }, [companyId]);

  async function saveAppearance() {
    if (!companyId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.patch(`/companies/${companyId}/appearance`, { theme: localTheme, mode: localMode });
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
  const [savingBehavior, setSavingBehavior] = useState(false);
  const [saveBehaviorMsg, setSaveBehaviorMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveBehavior() {
    if (!companyId) return;
    setSavingBehavior(true);
    setSaveBehaviorMsg(null);
    try {
      await api.patch(`/companies/${companyId}/behavior`, { consumption_mode_enabled: consumptionModeEnabled });
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

  // Renomear em modal específica, pedida pelo usuário.
  const [renameVideo, setRenameVideo] = useState<TotemVideo | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  function openRenameVideo(video: TotemVideo) {
    setRenameVideo(video);
    setRenameValue(video.name);
  }

  async function saveRenameVideo() {
    if (!companyId || !renameVideo || !renameValue.trim()) return;
    setRenaming(true);
    try {
      await api.patch(`/companies/${companyId}/totem-videos/${renameVideo.id}`, { name: renameValue.trim() });
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
                        Editar nome
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

            <div className={styles.saveRow}>
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
        onClose={() => setRenameVideo(null)}
        onBackdropClick={() => setRenameVideo(null)}
        onCloseButtonClick={() => setRenameVideo(null)}
      >
        <div className={styles.cardTitle} style={{ marginBottom: 16 }}>Editar nome do vídeo</div>
        <InputBase
          aria-label="Novo nome do vídeo"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          maxLength={100}
        />
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <Button onClick={saveRenameVideo} disabled={!renameValue.trim()} loading={renaming}>
            Salvar
          </Button>
          <Button variant="secondary" onClick={() => setRenameVideo(null)}>
            Cancelar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
