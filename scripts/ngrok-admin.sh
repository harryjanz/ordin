#!/usr/bin/env bash
# Inicia ngrok no admin (:3001) e reinicia o auth-service com a URL pública.
# Uso: ./scripts/ngrok-admin.sh
set -e

COMPOSE_FILE="$(cd "$(dirname "$0")/.." && pwd)/docker-compose.yml"
cd "$(dirname "$0")/.."

echo "→ Iniciando ngrok em http://localhost:3001..."
ngrok http 3001 --log=stdout > /tmp/ngrok-admin.log 2>&1 &
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
echo "→ Reiniciando auth-service com ADMIN_BASE_URL=$URL..."
ADMIN_BASE_URL="$URL" docker compose up -d --no-deps auth-service

echo ""
echo "✓ Pronto!"
echo ""
echo "  QR do totem agora aponta para: $URL/pair?code=XXXXXX"
echo "  Escaneie o QR no totem com a câmera do celular."
echo "  Se o ngrok mostrar uma tela de aviso, clique em 'Visit Site' uma vez."
echo ""
echo "  Para encerrar o ngrok: kill $NGROK_PID"
