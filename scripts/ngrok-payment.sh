#!/usr/bin/env bash
# Expõe o gateway nginx (:8000) publicamente via ngrok, para configurar o
# webhook do Mercado Pago (/payments/webhook) no painel de developers.
# Uso: ./scripts/ngrok-payment.sh
set -e

cd "$(dirname "$0")/.."

echo "→ Iniciando ngrok em http://localhost:8000..."
ngrok http 8000 --log=stdout > /tmp/ngrok-payment.log 2>&1 &
NGROK_PID=$!
echo "  PID: $NGROK_PID"

echo "→ Aguardando URL pública..."
for i in $(seq 1 20); do
  URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
    | python3 -c "import sys,json; t=json.load(sys.stdin)['tunnels']; print(next((x['public_url'] for x in t if x['public_url'].startswith('https')), ''))" 2>/dev/null)
  if [ -n "$URL" ]; then break; fi
  sleep 1
done

if [ -z "$URL" ]; then
  echo "✗ Não foi possível obter a URL do ngrok."
  echo "  Verifique: ngrok authtoken <seu-token>  →  https://dashboard.ngrok.com"
  kill $NGROK_PID 2>/dev/null
  exit 1
fi

echo "  URL pública: $URL"
echo ""
echo "✓ Pronto!"
echo ""
echo "  URL do webhook (colar no painel Mercado Pago):"
echo "  $URL/payments/webhook"
echo ""
echo "  No painel: Suas integrações → aplicação ORDIN → Webhooks →"
echo "  Configurar notificações → colar a URL acima → selecionar tópicos"
echo "  'Pagamentos' (payment) e 'Order (Mercado Pago)' (orders) → Salvar."
echo "  Copiar a 'Chave secreta' gerada e me passar para configurar"
echo "  MP_WEBHOOK_SECRET no .env do payment-service."
echo ""
echo "  Se o ngrok mostrar uma tela de aviso na primeira requisição, o"
echo "  Mercado Pago não vai conseguir clicar 'Visit Site' — pode ser"
echo "  necessário um domínio fixo (ngrok authtoken free já libera isso)."
echo ""
echo "  Para encerrar o ngrok: kill $NGROK_PID"
