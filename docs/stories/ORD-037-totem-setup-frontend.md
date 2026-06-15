---
id: ORD-037
status: Done
fase: 1
sprint: setup-revisao
responsavel: Frontend
estimativa: 3 pontos
prioridade: P0
dependencias: ORD-036
---

# ORD-037 — Frontend totem: setup em 3 etapas (PIN → Terminal → Teste)

## Explorer

**Como** técnico de instalação ou operador,  
**quero** que o totem guie automaticamente a configuração inicial através de PIN → seleção de terminal → teste de conexão,  
**para** que não seja necessário saber IDs numéricos e a máquina de pagamento seja validada antes do serviço começar.

### Contexto e motivação

O `DeviceSetupScreen` atual exige que o instalador saiba e insira manualmente o `terminal_id`
(número inteiro do banco). Isso não é operacional — em uma loja com 3 totens, saber qual é o "ID 1"
vs "ID 2" exige consultar o Admin Panel.

O novo fluxo substitui essa tela por uma sequência automática em 3 etapas:

**Etapa 1 — PIN** (tela existente, sem mudança visual)
- Operador digita o PIN de 4 dígitos da empresa (ex: 1234)
- Frontend chama `POST /auth/validate-pin` → recebe `{company, terminals: [...]}`
- Se PIN inválido → shake + erro (comportamento atual mantido)

**Etapa 2 — Selecionar terminal** (tela nova)
- Lista os terminais disponíveis retornados pela etapa 1
- Card por terminal: label + terminal_code + tef_number
- Operador toca no terminal correspondente à máquina física
- Frontend chama `POST /auth/pin-login` com `{pin, terminal_id}` → kiosk JWT
- Salva `terminal_id` em localStorage para reconexão após refresh/crash

**Etapa 3 — Teste de conexão** (tela nova)
- Automático: começa imediatamente após `pin-login`
- Mostra spinner com "Testando conexão com a máquina de pagamento…"
- Chama `POST /payments/test-connection` (com JWT no header)
- Sucesso → toast verde "Máquina OK (R$ 0,01 cancelado)" → transição para catálogo
- Falha → mensagem de erro + botões "Tentar novamente" e "Selecionar outro terminal"

### Personas afetadas
- **Técnico de instalação**: não precisa mais saber IDs — vê labels legíveis
- **Gerente de loja**: pode iniciar o totem sem suporte técnico
- **Cliente final**: indiretamente — setup mais rápido, menos chance de erro de configuração

### Dependências
- ORD-036 (backend) — `validate-pin` retornando terminais, heartbeat endpoint, test-connection
- `frontend/totem/src/screens/DeviceSetupScreen.tsx` — será removido
- `frontend/totem/src/screens/PinScreen.tsx` — fluxo de sucesso será alterado
- `frontend/totem/src/App.tsx` — orquestra as telas

---

## QA Explorer

### Casos felizes
- PIN correto → 3 terminais disponíveis → seleciona um → teste OK → catálogo abre
- PIN correto → 1 terminal disponível → auto-seleciona? (UX: mostrar lista mesmo com 1 item, para o usuário confirmar)
- Teste de conexão com MockProvider → sucesso imediato (< 1s)
- Refresh de página com terminal_id em localStorage → vai para step 2 (terminal pré-selecionado) ou reabre o PIN

### Edge cases e riscos
1. **Nenhum terminal disponível**: validate-pin retorna `terminals: []` → mostrar mensagem "Nenhum terminal disponível. Verifique no Admin Panel se há terminais ativos." + botão "Tentar novamente"
2. **PIN correto mas test-connection falha**: Operador deve poder tentar novamente ou selecionar terminal diferente (voltar para etapa 2)
3. **localStorage tem terminal_id de sessão anterior**: Na nova tela de PIN, sempre começar do zero (PIN first). O localStorage só é usado para pré-selecionar na lista da etapa 2, não para pular etapas.
4. **Totem reiniciado durante sessão ativa**: localStorage tem terminal_id → na etapa 2, esse terminal aparece destacado como "usado recentemente" para seleção rápida. O heartbeat do totem anterior expirou em 5min → o terminal volta para a lista de disponíveis.
5. **Etapa 3 timeout (30s)**: Mostrar mensagem específica "Máquina não respondeu. Verifique a conexão do terminal." — diferente de erro genérico
6. **Teste de conexão cancelado pelo usuário na máquina**: PayGoProvider retorna `success: false` com detalhe "Cancelado pelo usuário" → frontend exibe e permite retry
7. **PIN digitado fica no estado durante navegação entre etapas**: O PIN não deve ser exibido após etapa 1. Limpar do estado antes de entrar na etapa 2.

### Testes de regressão
- Fluxo de compra (catálogo → CPF → pagamento → sucesso) não é afetado
- Modal de inatividade continua funcionando nas telas de catálogo/cpf/payment
- Heartbeat enviado a cada 2min enquanto na tela de catálogo (não durante setup)

---

## Tech Explorer

### Estrutura de telas

Substituir `DeviceSetupScreen` por um novo `SetupScreen` com 3 etapas internas.
O `PinScreen` passa a ser usado DENTRO do `SetupScreen` como a etapa 1, ou simplificado inline.

**Opção adotada**: novo `SetupScreen.tsx` que contém as 3 etapas. `PinScreen` é reutilizado como componente para a etapa 1. `DeviceSetupScreen` é deletado.

### `SetupScreen.tsx` (novo)

```tsx
type Step = "pin" | "terminal" | "testing" | "done";

interface AvailableTerminal {
  id: number;
  label: string;
  terminal_code: string;
  tef_number: string | null;
}

export default function SetupScreen({ T, onDone }: { T: Theme; onDone: (company: CompanyInfo, terminal: TerminalInfo, token: string) => void }) {
  const [step, setStep] = useState<Step>("pin");
  const [company, setCompany] = useState<{id: number; name: string} | null>(null);
  const [terminals, setTerminals] = useState<AvailableTerminal[]>([]);
  const [pin, setPin] = useState("");          // mantido para re-usar em pin-login
  const [token, setToken] = useState("");
  const [selectedTerminal, setSelectedTerminal] = useState<AvailableTerminal | null>(null);
  const [testResult, setTestResult] = useState<{success: boolean; detail: string} | null>(null);

  // Etapa 1: validação de PIN
  async function handlePinSuccess(p: string, co: {id:number;name:string}, terms: AvailableTerminal[]) {
    setPin(p);
    setCompany(co);
    setTerminals(terms);
    setStep("terminal");
  }

  // Etapa 2: seleção de terminal
  async function handleTerminalSelect(t: AvailableTerminal) {
    setSelectedTerminal(t);
    const r = await axios.post("/auth/pin-login", { pin, terminal_id: t.id });
    const { access_token, company: co, terminal: term } = r.data;
    localStorage.setItem("ordin_terminal_id", String(t.id));
    setToken(access_token);
    // guarda para onDone depois do teste
    setStep("testing");
    runTestConnection(access_token, co, term);
  }

  // Etapa 3: teste de conexão
  async function runTestConnection(tok: string, co: CompanyInfo, term: TerminalInfo) {
    setTestResult(null);
    try {
      const r = await axios.post("/payments/test-connection", {}, {
        headers: { Authorization: `Bearer ${tok}` },
        timeout: 32_000,
      });
      setTestResult(r.data);
      if (r.data.success) {
        setTimeout(() => onDone(co, term, tok), 1500);
      }
    } catch {
      setTestResult({ success: false, detail: "Erro de comunicação com o servidor." });
    }
  }
  // ... render por step
}
```

### `PinScreen.tsx` — mudança no `tryLogin`

Antes: `tryLogin` chamava `validate-pin` + `pin-login` e chamava `onSuccess(company, terminal, token)`.

Agora: `tryLogin` chama apenas `validate-pin`. Se OK, chama `onPinValid(pin, company, terminals)`. 
O `pin-login` é movido para a etapa 2 (SetupScreen.handleTerminalSelect).

```tsx
// PinScreen.tsx — props novas:
interface Props {
  T: Theme;
  savedTerminalId?: number | null;  // para pré-selecionar
  onPinValid: (pin: string, company: {id:number;name:string}, terminals: AvailableTerminal[]) => void;
}

async function tryLogin(p: string) {
  const r = await axios.post("/auth/validate-pin", { pin: p });
  const { company, terminals } = r.data;
  onPinValid(p, company, terminals);
}
```

### `App.tsx` — simplificar

```tsx
// Antes: if (!terminalId) → DeviceSetupScreen / else → PinScreen
// Depois: sempre começa em setup (PIN first)

const savedTerminalId = getStoredTerminalId();

if (screen === "pin" || screen === "setup") {
  return (
    <SetupScreen
      T={T}
      savedTerminalId={savedTerminalId}
      onDone={handlePinSuccess}
    />
  );
}
```

### Heartbeat no kiosk

Em `App.tsx`, após entrar em `screen === "catalog"`, iniciar interval de heartbeat:

```tsx
useEffect(() => {
  if (screen !== "catalog" || !company || !terminal) return;
  const iv = setInterval(async () => {
    try {
      await api.post(`/companies/${company.id}/terminals/${terminal.id}/heartbeat`);
    } catch { /* silencioso */ }
  }, 120_000); // 2 min
  return () => clearInterval(iv);
}, [screen, company, terminal]);
```

### Arquivos a criar/modificar/remover

| Arquivo | Mudança |
|---|---|
| `frontend/totem/src/screens/SetupScreen.tsx` | **novo** — orquestra 3 etapas |
| `frontend/totem/src/screens/PinScreen.tsx` | `onSuccess` → `onPinValid`; remove `pin-login` |
| `frontend/totem/src/screens/DeviceSetupScreen.tsx` | **deletar** |
| `frontend/totem/src/App.tsx` | usa `SetupScreen` em vez de `DeviceSetupScreen`+`PinScreen` no início; adiciona heartbeat |
| `frontend/totem/src/types.ts` | adicionar `AvailableTerminal` se não existir |

### Risco de regressão
- Fluxo de catálogo/pagamento: zero impacto (App.tsx apenas troca como chega em "catalog")
- localStorage `ordin_terminal_id`: continua sendo salvo na etapa 2; usado apenas para pré-seleção visual
- Rate limiting no validate-pin: comportamento mantido (cada chamada da etapa 1 conta)
