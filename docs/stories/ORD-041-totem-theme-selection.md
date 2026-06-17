# ORD-041 — Seleção de tema visual por empresa no admin

**Status:** New
**Tipo:** Feature — UX / Design System / Full-stack
**Referência:** `docs/design-system-3themes.html`

---

## Contexto

Após a implementação do DS v2 (ORD-040), o totem usa Ordin light como padrão fixo. Clientes da plataforma (Burger House, Pasta & Co, etc.) são operadores multi-marca: alguns já têm identidade visual própria ou preferem um layout que se alinha com outra rede conhecida (McDonald's, Burger King). A liberdade de escolha de tema aumenta o valor percebido do produto ordin.

O arquivo `docs/design-system-3themes.html` define os tokens de 3 temas (Ordin, McDonald's, Burger King) em modo light e dark — 6 combinações no total. Ele também implementa um seletor interativo com cards e preview ao vivo que deve servir de referência direta para a UI do admin.

---

## Problema

1. O tema é fixo (`"light"` hardcoded em `App.tsx`) — não há forma de o cliente escolher outro visual.
2. Não há campo no banco para armazenar a preferência de tema por empresa.
3. O admin não tem interface de personalização visual — apenas regeneração de PIN.
4. Não existe estrutura extensível para adicionar novos temas no futuro sem refatoração.

---

## Solução proposta

### Visão geral do fluxo

```
Admin configura tema/modo  →  PATCH /companies/{id}/appearance
                            →  campo salvo no banco (company-service)

Totem faz PIN login        →  /internal/verify-pin retorna visual_theme + visual_mode
                            →  App.tsx aplica tema sem toggle manual
```

### Extensibilidade

- `themes.ts` expõe um `THEME_REGISTRY` indexado por `ThemeName` (string literal union)
- Adicionar um novo tema = adicionar uma chave ao `THEME_REGISTRY` + card no admin
- Backend valida contra whitelist = `Object.keys(THEME_REGISTRY)` (ou lista equivalente)
- Nenhuma outra mudança estrutural necessária

---

## Fora do escopo

- Criação de temas customizados (paleta livre) — próxima fase
- Temas para balcão ou admin — apenas totem nesta história
- Upload de logo ou imagens de marca

---

## Explorer

### Análise de viabilidade técnica

**Backend — company-service (`services/company/main.py`):**
- Adicionar `visual_theme VARCHAR(32) NOT NULL DEFAULT 'ordin'` e `visual_mode VARCHAR(8) NOT NULL DEFAULT 'light'` à tabela `Company`
- Migração Alembic: `alembic revision --autogenerate -m "add_visual_theme_to_company"`
- Incluir campos em `CompanyOut` (já retornado em todos os endpoints de empresa)
- Novo endpoint `PATCH /companies/{id}/appearance` com `{ theme: str, mode: "light"|"dark" }`
- Incluir `visual_theme` + `visual_mode` na resposta de `/internal/verify-pin` (totem lê no login)

**Totem frontend:**
- `themes.ts` → refatorar de `THEMES` para `THEME_REGISTRY` (estrutura extensível)
- `types.ts` → adicionar `visual_theme` e `visual_mode` ao tipo `CompanyInfo`
- `App.tsx` → ler tema do `company` após login; remover `useState<ThemeKey>` manual
- `WelcomeScreen.tsx` → remover toggle (tema vem do backend); ou manter oculto para debug

**Admin frontend (`frontend/admin/src/screens/SettingsScreen.tsx`):**
- Nova seção "Aparência do totem" abaixo do card de PIN
- Cards de tema (Ordin, McDonald's, Burger King) com mini-preview de cores
- Toggle Light/Dark
- Preview ao vivo de uma versão simplificada da WelcomeScreen do totem
- Botão salvar → PATCH para `/companies/{id}/appearance`

**Riscos:**
- Totem em produção pode não ter acesso ao Google Fonts — irrelevante para temas, fontes já são Lexend/Inter
- Temas não-ordin (McD, BK) são identidades de terceiros; deixar claro na UI que são "inspirados em" sem uso de logos/marcas oficiais. Os nomes na UI devem ser neutros ou eufêmicos se necessário (ex: "Vermelho e Amarelo", "Laranja e Marrom").

---

## QA Explorer

### Cenários de teste

**Admin — seleção de tema:**
1. Acessar Configurações da empresa → seção "Aparência do totem" deve estar visível
2. Clicar em cada card de tema → card fica marcado com borda/check, preview atualiza ao vivo
3. Clicar em "Claro" / "Escuro" → preview atualiza imediatamente sem salvar
4. Clicar em "Salvar aparência" → toast de sucesso; recarregar página → seleção persiste
5. Salvar com tema inválido (via API direta) → 422 com mensagem clara

**Totem — aplicação do tema:**
6. Após PIN login com empresa que tem tema McD light → totem abre com fundo `#F5F0E5`, primary `#DA291C`
7. Após PIN login com empresa que tem tema BK dark → totem abre com fundo `#0E0C0A`, primary `#FF8732`
8. Empresa sem tema configurado (padrão) → totem abre com Ordin light
9. Fluxo completo (catálogo, CPF, pagamento, sucesso) mantém o tema da empresa sem alterações

**Regressão:**
10. Empresa Ordin light → fluxo completo sem regressão visual vs. ORD-040
11. Toggle dark/light no WelcomeScreen (se mantido) continua funcionando como override local

---

## Tech Explorer

### 1. Backend — `services/company/main.py`

**Modelo:**
```python
class Company(Base):
    # ... campos existentes ...
    visual_theme = Column(String(32), nullable=False, default="ordin")
    visual_mode  = Column(String(8),  nullable=False, default="light")
```

**Schema Pydantic — adicionar em `CompanyOut`:**
```python
class CompanyOut(BaseModel):
    # ... campos existentes ...
    visual_theme: str = "ordin"
    visual_mode:  str = "light"
```

**Endpoint de aparência:**
```python
VALID_THEMES = {"ordin", "mc", "bk"}
VALID_MODES  = {"light", "dark"}

class AppearanceIn(BaseModel):
    theme: str
    mode:  str

@app.patch("/companies/{company_id}/appearance")
async def update_appearance(
    company_id: int,
    body: AppearanceIn,
    current_user: TokenPayload = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if body.theme not in VALID_THEMES:
        raise HTTPException(422, f"Tema inválido. Temas disponíveis: {VALID_THEMES}")
    if body.mode not in VALID_MODES:
        raise HTTPException(422, f"Modo inválido. Use 'light' ou 'dark'.")
    if current_user.company_id != company_id and current_user.role != "superadmin":
        raise HTTPException(403)
    co = await session.get(Company, company_id)
    if not co:
        raise HTTPException(404)
    co.visual_theme = body.theme
    co.visual_mode  = body.mode
    await session.commit()
    return {"ok": True}
```

**`/internal/verify-pin` — incluir visual_theme e visual_mode na resposta:**
```python
# já retorna company como dict — adicionar os novos campos ao serializar:
"visual_theme": co.visual_theme,
"visual_mode":  co.visual_mode,
```

**Migração Alembic:**
```python
# migrations/YYYYMMDD_HHMM_add_visual_theme_to_company.py
def upgrade():
    op.add_column("companies", sa.Column("visual_theme", sa.String(32), nullable=False, server_default="ordin"))
    op.add_column("companies", sa.Column("visual_mode",  sa.String(8),  nullable=False, server_default="light"))

def downgrade():
    op.drop_column("companies", "visual_theme")
    op.drop_column("companies", "visual_mode")
```

---

### 2. Totem — `frontend/totem/src/themes.ts` (refatoração para registry)

```typescript
// Token único compartilhado entre temas
export interface ThemeTokens {
  bg: string; surface: string; header: string;
  border: string; borderNeutral: string;
  text: string; muted: string;
  roxo: string; roxoSubtle: string;
  btn: string; btnText: string;
  glow: string; radial: string;
  priceColor: string;
  cardShadow: string;
  catActive: string; catText: string;
  numBg: string; numHover: string;
  successColor: string;
  errorBg: string; errorText: string;
  placeholderA: string; placeholderB: string;
}

export type ThemeMode = "light" | "dark";

export interface ThemeEntry {
  label: string;
  description: string;
  colors: string[];          // dots de preview no admin [primary, accent, bg]
  modes: Record<ThemeMode, ThemeTokens>;
}

export type ThemeName = keyof typeof THEME_REGISTRY;

export const THEME_REGISTRY = {
  ordin: {
    label: "Ordin",
    description: "Identidade roxa vibrante com acento teal — padrão da plataforma.",
    colors: ["#9900ff", "#1a9999", "#DFE8ED"],
    modes: {
      light: {
        bg: "#DFE8ED", surface: "#ffffff", header: "#ffffff",
        border: "rgba(153,0,255,0.18)", borderNeutral: "rgba(0,0,0,0.08)",
        text: "#1d1434", muted: "rgba(29,20,52,0.45)",
        roxo: "#9900ff", roxoSubtle: "rgba(153,0,255,0.12)",
        btn: "#9900ff", btnText: "#ffffff",
        glow: "0 4px 20px rgba(153,0,255,0.35)",
        radial: "radial-gradient(ellipse at 60% 0%,rgba(153,0,255,0.07) 0%,transparent 55%),#DFE8ED",
        priceColor: "#1a9999",
        cardShadow: "0 2px 12px rgba(153,0,255,0.10)",
        catActive: "#9900ff", catText: "#ffffff",
        numBg: "rgba(153,0,255,0.10)", numHover: "rgba(153,0,255,0.22)",
        successColor: "#198737",
        errorBg: "rgba(255,77,109,0.08)", errorText: "#ff4d6d",
        placeholderA: "linear-gradient(135deg,#3a0080,#9900ff)",
        placeholderB: "linear-gradient(135deg,#0d3333,#33cccc)",
      },
      dark: {
        bg: "#0e0b1a", surface: "#1d1434", header: "#1d1434",
        border: "rgba(153,0,255,0.22)", borderNeutral: "rgba(255,255,255,0.07)",
        text: "#DFE8ED", muted: "rgba(223,232,237,0.45)",
        roxo: "#9900ff", roxoSubtle: "rgba(153,0,255,0.12)",
        btn: "#9900ff", btnText: "#ffffff",
        glow: "0 4px 20px rgba(153,0,255,0.35)",
        radial: "radial-gradient(ellipse at 60% 0%,rgba(153,0,255,0.18) 0%,transparent 60%),#0e0b1a",
        priceColor: "#33cccc",
        cardShadow: "0 2px 16px rgba(153,0,255,0.20)",
        catActive: "#9900ff", catText: "#ffffff",
        numBg: "rgba(153,0,255,0.12)", numHover: "rgba(153,0,255,0.25)",
        successColor: "#198737",
        errorBg: "rgba(255,77,109,0.10)", errorText: "#ff4d6d",
        placeholderA: "linear-gradient(135deg,#1d0040,#9900ff)",
        placeholderB: "linear-gradient(135deg,#051212,#33cccc)",
      },
    },
  },
  mc: {
    label: "Clássico Vermelho",
    description: "Vermelho vibrante com amarelo dourado — alto contraste e apetência.",
    colors: ["#DA291C", "#FFC72C", "#F5F0E5"],
    modes: {
      light: {
        bg: "#F5F0E5", surface: "#ffffff", header: "#ffffff",
        border: "rgba(218,41,28,0.20)", borderNeutral: "rgba(0,0,0,0.08)",
        text: "#27251F", muted: "rgba(39,37,31,0.45)",
        roxo: "#DA291C", roxoSubtle: "rgba(218,41,28,0.08)",
        btn: "#DA291C", btnText: "#ffffff",
        glow: "0 4px 20px rgba(218,41,28,0.30)",
        radial: "radial-gradient(ellipse at 60% 0%,rgba(218,41,28,0.06) 0%,transparent 55%),#F5F0E5",
        priceColor: "#DA291C",
        cardShadow: "0 2px 12px rgba(218,41,28,0.08)",
        catActive: "#FFC72C", catText: "#27251F",
        numBg: "rgba(255,199,44,0.15)", numHover: "rgba(255,199,44,0.30)",
        successColor: "#264F36",
        errorBg: "rgba(218,41,28,0.08)", errorText: "#DA291C",
        placeholderA: "linear-gradient(135deg,#8B0000,#DA291C)",
        placeholderB: "linear-gradient(135deg,#7A6000,#FFC72C)",
      },
      dark: {
        bg: "#1c1a16", surface: "#27251F", header: "#27251F",
        border: "rgba(255,199,44,0.20)", borderNeutral: "rgba(255,255,255,0.07)",
        text: "#F5F0E5", muted: "rgba(245,240,229,0.45)",
        roxo: "#DA291C", roxoSubtle: "rgba(218,41,28,0.15)",
        btn: "#DA291C", btnText: "#ffffff",
        glow: "0 4px 20px rgba(218,41,28,0.40)",
        radial: "radial-gradient(ellipse at 60% 0%,rgba(218,41,28,0.12) 0%,transparent 60%),#1c1a16",
        priceColor: "#FFC72C",
        cardShadow: "0 2px 16px rgba(218,41,28,0.20)",
        catActive: "#FFC72C", catText: "#27251F",
        numBg: "rgba(255,199,44,0.12)", numHover: "rgba(255,199,44,0.25)",
        successColor: "#5DD490",
        errorBg: "rgba(255,107,91,0.10)", errorText: "#ff6b5b",
        placeholderA: "linear-gradient(135deg,#5C0000,#DA291C)",
        placeholderB: "linear-gradient(135deg,#4A3800,#FFC72C)",
      },
    },
  },
  bk: {
    label: "Laranja Grelhado",
    description: "Laranja quente com vermelho — associação imediata a sabor e fogo.",
    colors: ["#FF8732", "#D62300", "#FFF8F0"],
    modes: {
      light: {
        bg: "#FFF8F0", surface: "#ffffff", header: "#ffffff",
        border: "rgba(255,135,50,0.25)", borderNeutral: "rgba(0,0,0,0.08)",
        text: "#1A0A00", muted: "rgba(26,10,0,0.45)",
        roxo: "#FF8732", roxoSubtle: "rgba(255,135,50,0.12)",
        btn: "#FF8732", btnText: "#0E0C0A",
        glow: "0 4px 20px rgba(255,135,50,0.40)",
        radial: "radial-gradient(ellipse at 60% 0%,rgba(255,135,50,0.08) 0%,transparent 55%),#FFF8F0",
        priceColor: "#D62300",
        cardShadow: "0 2px 12px rgba(255,135,50,0.12)",
        catActive: "#FF8732", catText: "#0E0C0A",
        numBg: "rgba(255,135,50,0.12)", numHover: "rgba(255,135,50,0.25)",
        successColor: "#198737",
        errorBg: "rgba(214,35,0,0.08)", errorText: "#D62300",
        placeholderA: "linear-gradient(135deg,#7A3200,#FF8732)",
        placeholderB: "linear-gradient(135deg,#6B0C00,#D62300)",
      },
      dark: {
        bg: "#0E0C0A", surface: "#1A1612", header: "#1A1612",
        border: "rgba(255,135,50,0.25)", borderNeutral: "rgba(255,255,255,0.07)",
        text: "#F5EBDC", muted: "rgba(245,235,220,0.40)",
        roxo: "#FF8732", roxoSubtle: "rgba(255,135,50,0.14)",
        btn: "#FF8732", btnText: "#0E0C0A",
        glow: "0 4px 20px rgba(255,135,50,0.40)",
        radial: "radial-gradient(ellipse at 60% 0%,rgba(255,135,50,0.14) 0%,transparent 60%),#0E0C0A",
        priceColor: "#FF8732",
        cardShadow: "0 2px 16px rgba(255,135,50,0.20)",
        catActive: "#FF8732", catText: "#0E0C0A",
        numBg: "rgba(255,135,50,0.12)", numHover: "rgba(255,135,50,0.25)",
        successColor: "#5DD490",
        errorBg: "rgba(255,106,74,0.12)", errorText: "#FF6B4A",
        placeholderA: "linear-gradient(135deg,#3A1600,#FF8732)",
        placeholderB: "linear-gradient(135deg,#2E0500,#D62300)",
      },
    },
  },
} as const satisfies Record<string, ThemeEntry>;

// Tipo derivado dos tokens — igual ao anterior (retrocompatível)
export type Theme = ThemeTokens;

// Helper de resolução com fallback seguro
export function resolveTheme(name: string, mode: string): Theme {
  const entry = THEME_REGISTRY[name as ThemeName];
  const m = (mode === "dark" ? "dark" : "light") as ThemeMode;
  return (entry ?? THEME_REGISTRY.ordin).modes[m];
}
```

> **Nota de extensibilidade:** Para adicionar um novo tema basta adicionar uma chave ao objeto `THEME_REGISTRY` com `label`, `description`, `colors` e `modes.{light,dark}`. O admin lê `Object.entries(THEME_REGISTRY)` dinamicamente — nenhuma outra alteração de código é necessária. No backend, `VALID_THEMES` deve ser atualizado para incluir o novo nome.

---

### 3. Totem — `types.ts`

```typescript
export interface CompanyInfo {
  id: number;
  name: string;
  plan: string;
  visual_theme: string;   // novo
  visual_mode: string;    // novo
}
```

---

### 4. Totem — `App.tsx`

```typescript
// Remover:
const [themeKey, setThemeKey] = useState<ThemeKey>("light");

// Substituir por (derivado do company após login):
const T = resolveTheme(company?.visual_theme ?? "ordin", company?.visual_mode ?? "light");

// WelcomeScreen — remover props de toggle (não precisa mais)
<WelcomeScreen T={T} companyName={company?.name ?? "ordin"} onStart={...} />
```

---

### 5. Admin — `SettingsScreen.tsx`

Nova seção "Aparência do totem" que replica a experiência do `design-system-3themes.html`:

**Estrutura de componentes:**
```
SettingsScreen
├── Card PIN (existente)
└── Card Aparência (novo)
    ├── ThemePicker
    │   └── ThemeCard × N  (gerado de Object.entries(THEME_REGISTRY))
    ├── ModePicker (Claro | Escuro)
    ├── TotemPreview (mini WelcomeScreen ~200px de altura)
    └── Botão "Salvar aparência"
```

**`TotemPreview`:** componente React puro que recebe `T: Theme` e renderiza um mini-totem (logo + "Toque para começar") em escala para dar feedback visual imediato sem precisar abrir o totem.

**Fluxo:**
1. `useEffect` carrega `company.visual_theme` e `company.visual_mode` da API ao montar
2. Usuário clica em card → `localTheme` atualiza → preview atualiza ao vivo
3. Usuário clica em modo → `localMode` atualiza → preview atualiza ao vivo
4. "Salvar" → `PATCH /companies/{id}/appearance` → toast de confirmação

**API call:**
```typescript
await api.patch(`/companies/${companyId}/appearance`, {
  theme: localTheme,
  mode: localMode,
});
```

---

### 6. WelcomeScreen — remover toggle

O toggle dark/light era provisório para testes. Com o tema vindo do backend, deve ser removido para não confundir o operador.

---

### Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `services/company/main.py` | Colunas `visual_theme`/`visual_mode`, endpoint `/appearance`, resposta verify-pin |
| `services/company/migrations/` | Nova migration Alembic |
| `frontend/totem/src/themes.ts` | Refatorar para `THEME_REGISTRY`, adicionar mc + bk, exportar `resolveTheme` |
| `frontend/totem/src/types.ts` | `CompanyInfo` + `visual_theme`/`visual_mode` |
| `frontend/totem/src/App.tsx` | `resolveTheme(company)` em vez de `useState<ThemeKey>` |
| `frontend/totem/src/screens/WelcomeScreen.tsx` | Remover toggle + props `themeKey`/`onThemeToggle` |
| `frontend/admin/src/screens/SettingsScreen.tsx` | Seção "Aparência do totem" com picker + preview + save |

---

## Critérios de aceite

- [ ] Empresa sem configuração → totem abre em Ordin light (padrão)
- [ ] Admin: seção "Aparência" visível em Configurações com 3 cards de tema
- [ ] Cards mostram cores representativas de cada tema (dots coloridos)
- [ ] Preview ao vivo atualiza ao selecionar tema ou modo sem salvar
- [ ] Salvar persiste; ao recarregar o admin a seleção é mantida
- [ ] Totem: após PIN login, aplica o tema salvo no admin (verificar com tema BK dark)
- [ ] Fluxo completo (catálogo → pagamento → sucesso) mantém o tema da empresa
- [ ] `THEME_REGISTRY` aceita nova chave sem outras mudanças de código

---

**Status:** Ready
