export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const money = value => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
export function message(subject, lines) {
  const text = ['My mini Leo', subject, '', ...lines, '', 'My mini Leo · 607140250'].join('\n');
  return { subject, text, html: `<html lang="es"><body style="font-family:Arial,sans-serif;color:#222;max-width:640px;margin:auto;padding:24px"><h1>My mini Leo</h1><h2>${escapeHtml(subject)}</h2>${lines.map(line => `<p style="white-space:pre-wrap">${escapeHtml(line)}</p>`).join('')}<hr/><p>My mini Leo · 607140250</p></body></html>` };
}
export function closingMessage(session, kpis) {
  const forced = session.notes?.includes('Cierre forzado');
  return message(`Cierre de caja · ${session.cashierName || 'Tienda'}`, [
    `Caja: ${session.id}`, `Apertura: ${session.openedAt || 'No registrada'}`, `Cierre: ${session.closedAt}`,
    `Fondo inicial: ${money(session.openingAmount)}`, `Ventas: ${kpis.totalOrders} · ${money(kpis.grossSales)}`,
    `Efectivo: ${money(kpis.cashSales)} · Tarjeta: ${money(kpis.cardSales)} · Bizum: ${money(kpis.bizumSales)} · Vale: ${money(kpis.voucherSales)}`,
    `Devoluciones: ${money(kpis.refunds)} (efectivo: ${money(kpis.refundsCash)})`,
    `Efectivo esperado: ${money(kpis.expectedCash)}`,
    forced ? 'Cierre forzado: no se ha registrado un recuento de efectivo.' : `Efectivo contado: ${money(session.closingAmount)} · Diferencia: ${money(Number(session.closingAmount) - kpis.expectedCash)}`,
    session.notes ? `Notas: ${session.notes}` : '',
  ]);
}
export function giftMessage(order, items) {
  return message(`Ticket regalo · ${order.name}`, [
    'Clothes for your baby', 'Calle Asunción 38A · 41011 Sevilla · España', 'Instagram: @myminileo',
    `Pedido: ${order.name}`, `Fecha: ${new Date(order.createdAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`,
    ...items.map(item => `${item.quantity} × ${item.title}${item.variantTitle && item.variantTitle !== 'Default Title' ? ` (${item.variantTitle})` : ''}`),
    'El plazo para realizar cualquier cambio es de 15 días, podrá ser por otra prenda o un vale. Las prendas han de estar en perfectas condiciones y debidamente etiquetadas. Las prendas de outlet no podrán ser cambiadas ni se devolverá el dinero. Los chupetes, mordedores, chupeteros, botellas y cajitas no tendrán posibilidad de cambio por higiene. Todas nuestras prendas deben lavarse en frío y programa delicado.',
    'Gracias por su compra · myminileo.com',
  ]);
}
