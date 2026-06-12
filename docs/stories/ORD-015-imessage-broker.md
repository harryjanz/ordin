---
id: ORD-015
status: Ready
fase: 1
sprint: 3
responsavel: Backend SR
---

# ORD-015 — Implementar IMessageBroker com RabbitMQBroker (local) e SQSBroker (produção)

## Explorer

**Como** time de desenvolvimento do Ordin,  
**quero** uma interface `IMessageBroker` com implementações plugáveis (RabbitMQ local / SQS produção),  
**para** que os serviços publiquem eventos de pagamento de forma desacoplada, sem conhecer o broker concreto e sem depender de chamadas HTTP síncronas entre serviços.

### Contexto e motivação

O `docker-compose.yml` já declara o container RabbitMQ, mas nenhum serviço publica ou consome mensagens. Hoje, quando um pagamento é aprovado, o `payment-service` chama diretamente o `order-service` via `PATCH /internal/orders/{ref}/status` — uma chamada HTTP síncrona e frágil: se o order-service estiver indisponível, o evento de pagamento se perde.

A interface `IMessageBroker` (definida em `docs/ARQUITETURA.md` §8) resolve isso:
- **Local/CI:** `RabbitMQBroker` publica em filas do container RabbitMQ
- **Produção:** `SQSBroker` publica em filas SQS FIFO (pagamentos) e SQS Standard (volume)

O código de negócio só conhece `IMessageBroker.publish(event, payload)` — a implementação é injetada no startup conforme `MESSAGE_BROKER=rabbitmq|sqs`.

### Dependências
- RabbitMQ já disponível no `docker-compose.yml`
- ORD-025 (PayGo) publica `payment.approved`, `payment.refused`, `payment.cancelled` — depende desta story
- SQSBroker é scaffolding para Fase 2 (implementação real na ORD-008/infra AWS)

### Eventos do Sprint 3

| Evento | Publicado por | Consumido por | Fila (local) |
|---|---|---|---|
| `payment.approved` | payment-service | order-service | `payment.events` |
| `payment.refused` | payment-service | order-service | `payment.events` |
| `payment.cancelled` | payment-service | order-service | `payment.events` |

---

## QA Explorer

### Cenário 1 — Publicação com RabbitMQ (happy path)
```gherkin
Dado que MESSAGE_BROKER=rabbitmq e o container RabbitMQ está disponível
Quando o payment-service publica o evento "payment.approved" com payload válido
Então a mensagem aparece na fila "payment.events" do RabbitMQ
E o payload contém company_id, order_ref, amount, nsu e transaction_id
E nenhuma chamada HTTP direta ao order-service é feita pelo broker
```

### Cenário 2 — SQSBroker em modo stub (scaffolding)
```gherkin
Dado que MESSAGE_BROKER=sqs
Quando o payment-service publica qualquer evento
Então o SQSBroker loga a mensagem sem lançar exceção
E nenhuma chamada real à AWS é feita (stub sem credenciais)
```

### Cenário 3 — Falha no broker não derruba o pagamento
```gherkin
Dado que MESSAGE_BROKER=rabbitmq e o RabbitMQ está indisponível
Quando o payment-service tenta publicar "payment.approved"
Então o pagamento continua aprovado no MySQL
E o erro de publicação é logado com nível WARNING
E o serviço não retorna erro 500 ao cliente
```

### Cenário 4 — Evento com payload inválido é rejeitado antes de publicar
```gherkin
Dado que o payment-service tenta publicar um evento sem "order_ref"
Quando o broker valida o payload
Então uma exceção ValueError é lançada antes de qualquer conexão ao RabbitMQ
E o erro é logado com nível ERROR
```

### Cenário 5 — Broker correto é injetado conforme variável de ambiente
```gherkin
Dado que MESSAGE_BROKER=rabbitmq
Quando o serviço inicia
Então a instância injetada é do tipo RabbitMQBroker

Dado que MESSAGE_BROKER=sqs
Quando o serviço inicia
Então a instância injetada é do tipo SQSBroker
```

---

## Tech Explorer

### Estrutura de diretórios (no payment-service)
```
services/payment/
  domain/
    interfaces/
      message_broker.py     # IMessageBroker ABC
    events.py               # dataclasses dos eventos (PaymentApprovedEvent, etc.)
  infrastructure/
    brokers/
      rabbitmq.py           # RabbitMQBroker — usa aio-pika
      sqs.py                # SQSBroker — stub agora, aioboto3 na Fase 2
    broker_factory.py       # get_broker(name) → IMessageBroker
```

### IMessageBroker — contrato
```python
class IMessageBroker(ABC):
    @abstractmethod
    async def publish(self, event: str, payload: dict) -> None: ...

    @abstractmethod
    async def close(self) -> None: ...
```

### Eventos — dataclasses tipados
```python
@dataclass
class PaymentApprovedEvent:
    event:          str = "payment.approved"
    company_id:     int  = 0
    order_ref:      str  = ""
    transaction_id: int  = 0
    amount:         str  = ""   # "26.00"
    nsu:            str  = ""
    authorization:  str  = ""
    provider:       str  = ""
```

### RabbitMQBroker
- Biblioteca: `aio-pika` (async, compatível com FastAPI)
- Exchange: `ordin.events` (topic)
- Routing key: nome do evento (`payment.approved`)
- Fila local: `payment.events` (bind em `payment.*`)
- Conexão criada no startup do FastAPI (`lifespan`) e fechada no shutdown

### SQSBroker (stub)
- Loga o evento e payload com `logger.info("SQS stub: %s", event)`
- Não requer credenciais AWS nem conexão real
- Pronto para receber implementação real na Fase 2 (aioboto3 + ARN da fila)

### Factory
```python
def get_broker(name: str) -> IMessageBroker:
    match name:
        case "rabbitmq": return RabbitMQBroker(url=require_env("RABBITMQ_URL"))
        case "sqs":      return SQSBroker()
        case _:          raise ValueError(f"Broker '{name}' não suportado")
```

### Variáveis de ambiente
```
MESSAGE_BROKER=rabbitmq      # rabbitmq | sqs
RABBITMQ_URL=amqp://ordin:PASSWORD@rabbitmq:5672/   # já existe no .env
```

### Impacto em outros serviços
- `payment-service`: único publicador no Sprint 3
- `order-service`: consumidor futuro (Sprint 4+) — fora do escopo desta story
- A chamada HTTP síncrona `PATCH /internal/orders/{ref}/status` **permanece** no Sprint 3 como fallback — o broker é adicionado em paralelo, não substitui ainda

### Estimativa
3 pontos — 1 dia de desenvolvimento + testes unitários.
