import api from "../api";

export interface CollectResult {
  isOrderQr: boolean;
  orderRef: string;
}

// Lógica de coleta via QR compartilhada entre a fila (QueueScreen, coleta
// genérica sem pedido pré-selecionado) e o detalhe do pedido
// (OrderDetailScreen). QR de pedido (ORD-118, prefixo "ORDER|") baixa tudo
// de uma vez; QR de ticket individual baixa só aquela unidade — ambos
// resolvem o pedido a partir do próprio QR, sem precisar de contexto extra.
export async function collectByQr(qrData: string): Promise<CollectResult> {
  const isOrderQr = qrData.startsWith("ORDER|");

  if (isOrderQr) {
    const orderRef = qrData.split("|")[1];
    await api.post(`/orders/${orderRef}/collect`, {
      collected_by: "balcao",
      collection_device: "balcao-web",
      qr_data: qrData,
    });
    return { isOrderQr: true, orderRef };
  }

  const isFullQr = qrData.includes("|");
  const ticketCode = isFullQr ? qrData.split("|")[0] : qrData;
  const r = await api.post(`/tickets/${ticketCode}/collect`, {
    collected_by: "balcao",
    collection_device: "balcao-web",
    ...(isFullQr ? { qr_data: qrData } : {}),
  });
  return { isOrderQr: false, orderRef: r.data.order_ref };
}
