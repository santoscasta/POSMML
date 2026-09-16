import { getMailService, hash } from './service.js';
import { message } from './templates.js';

// Reporting must never alter the result of the customer's original operation.
export async function recordDocumentFailure(kind, reference) {
  try {
    const mail = getMailService();
    const day = new Date().toISOString().slice(0, 10);
    await mail.change(data => mail.internal(data, `document-failure:${kind}:${hash(reference || '')}:${day}`, 'deliveryFailures', message('Revisar envío de documento mediante Shopify', [
      `Documento: ${kind}`, `Referencia: ${String(reference || 'No indicada').slice(0, 150)}`,
      'Shopify no ha confirmado el envío solicitado. Revisa el pedido o vale antes de volver a enviarlo.',
    ])));
  } catch { console.error('No se pudo registrar el aviso de correo fallido.'); }
}
