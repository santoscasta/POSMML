import { computeKPIs, getPayments } from '../accounting.js';
import { message, closingMessage, money } from './templates.js';
import { hash } from './service.js';

import { businessDate as localDate } from '../businessTime.js';
export { localDate };
const hour = value => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date(value)));
const previousDay = date => new Date(Date.parse(`${date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
const nextDay = date => new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
function sessionFrom(node, dates) {
  const session = { id: node.id };
  for (const { key, value } of node.fields) session[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = value;
  session.openedAt ||= dates[node.id] || (session.status === 'OPEN' ? node.updatedAt : null);
  return session;
}
async function readSessions(gql, dates) {
  const sessions = [];
  let after = null;
  do {
    const data = await gql(`query PosMailSessions($after: String) {
      metaobjects(type: "$app:pos_session", first: 100, after: $after) {
        nodes { id updatedAt fields { key value } } pageInfo { hasNextPage endCursor }
      }
    }`, { after });
    sessions.push(...data.metaobjects.nodes.map(node => sessionFrom(node, dates)));
    after = data.metaobjects.pageInfo.hasNextPage ? data.metaobjects.pageInfo.endCursor : null;
  } while (after);
  return sessions;
}
async function readStock(gql) {
  const items = [];
  let after = null;
  do {
    const data = await gql(`query PosMailStock($after: String) {
      productVariants(first: 100, after: $after) {
        nodes { id displayName inventoryQuantity inventoryItem { tracked } product { status } }
        pageInfo { hasNextPage endCursor }
      }
    }`, { after });
    items.push(...data.productVariants.nodes.filter(v => v.inventoryItem.tracked && v.product.status === 'ACTIVE' && Number.isInteger(v.inventoryQuantity)));
    after = data.productVariants.pageInfo.hasNextPage ? data.productVariants.pageInfo.endCursor : null;
  } while (after);
  return items;
}
export function createMailMonitor({ mail, posStore, gql, now = () => Date.now(), credentials = () => `${process.env.POS_USERNAME || ''}:${process.env.POS_PASSWORD || ''}` }) {
  let running = false;
  async function scan() {
    const { settings } = mail.read();
    if (!settings.enabled) return;
    const time = now();
    const state = posStore.read();
    const today = localDate(time);
    await mail.change(data => {
      const fingerprint = hash(credentials());
      if (data.monitor.credentials && data.monitor.credentials !== fingerprint) mail.internal(data, `access:${fingerprint}`, 'security', message('Acceso al TPV modificado', ['Se ha detectado un cambio en el usuario o la contraseña configurados en el servidor.', 'Si no lo has solicitado, revisa la configuración del TPV.']));
      data.monitor.credentials = fingerprint;
      for (const op of Object.values(state.operations)) {
        if (op.result || time - Date.parse(op.createdAt) < settings.pendingMinutes * 60000) continue;
        const paid = state.movements.find(m => m.id === op.key && m.type === 'sale');
        const title = paid ? 'Pedido cobrado pendiente de preparación' : 'Operación pendiente de completar';
        mail.internal(data, `pending:${op.key}`, 'pending', message(title, [
          `Operación: ${op.key}`, `Tipo: ${op.kind}`, `Inicio: ${op.createdAt}`,
          paid ? `Pedido ${paid.shopifyOrderName} ya cobrado. No vuelvas a cobrar: reanuda la operación pendiente.` : 'El resultado aún no está confirmado. Consulta Operaciones pendientes antes de repetir la venta o devolución.',
        ]), { operationId: op.key });
      }
      for (const job of Object.values(data.jobs)) {
        if (job.status === 'queued' && job.context?.operationId && (!state.operations[job.context.operationId] || state.operations[job.context.operationId].result)) job.status = 'cancelled';
      }
    });

    // All remote reads finish before persisting snapshots: a truncated scan never
    // treats unseen variants as restocked or a partial report as complete.
    const sessions = await readSessions(gql, state.sessionDates);
    const current = mail.read();
    const newlyClosed = sessions.filter(s => s.status === 'CLOSED' && s.closedAt >= settings.enabledAt && !current.monitor.closed?.[s.id]);
    const reportEnd = previousDay(today);
    let reportStart = current.monitor.lastSalesDay ? nextDay(current.monitor.lastSalesDay) : localDate(settings.enabledAt);
    if (reportStart < localDate(settings.enabledAt)) reportStart = localDate(settings.enabledAt);
    const needSales = settings.dailySales && hour(time) >= settings.reportHour && reportStart <= reportEnd;
    const payments = ((newlyClosed.length && (settings.closing || settings.discrepancy)) || needSales) ? await getPayments(gql, posStore) : [];
    await mail.change(data => {
      data.monitor.closed ||= {};
      for (const session of newlyClosed) {
        if (settings.closing || settings.discrepancy) {
          const kpis = computeKPIs(payments.filter(p => p.sessionId === session.id), Number(session.openingAmount));
          mail.internal(data, `close:${session.id}`, 'closing', closingMessage(session, kpis));
          const difference = Number(session.closingAmount) - kpis.expectedCash;
          if (!session.notes?.includes('Cierre forzado') && Math.abs(Math.round(difference * 100)) > Math.round(settings.discrepancyLimit * 100)) mail.internal(data, `difference:${session.id}`, 'discrepancy', message('Descuadre de caja', [`Caja: ${session.id}`, `Diferencia: ${money(difference)}`, `Efectivo esperado: ${money(kpis.expectedCash)}`, `Efectivo contado: ${money(session.closingAmount)}`]));
        }
        data.monitor.closed[session.id] = true;
      }
      for (const session of sessions.filter(s => s.status === 'OPEN')) {
        if (hour(time) >= settings.closingHour || (session.openedAt && localDate(session.openedAt) < today)) mail.internal(data, `unclosed:${session.id}:${today}`, 'unclosed', message('Caja pendiente de cierre', [`Caja: ${session.id}`, `Cajero: ${session.cashierName || 'No registrado'}`, `Abierta desde: ${session.openedAt || 'Fecha desconocida'}`, 'Revisa la caja y realiza el cierre en el TPV.']), { sessionId: session.id });
      }
      for (const job of Object.values(data.jobs)) {
        if (job.status === 'queued' && job.context?.sessionId && sessions.find(s => s.id === job.context.sessionId)?.status === 'CLOSED') job.status = 'cancelled';
      }
      // Catch up completed days after downtime, bounded to seven per scan.
      for (let date = reportStart, count = 0; needSales && date <= reportEnd && count < 7; date = nextDay(date), count++) {
        const kpis = computeKPIs(payments.filter(p => localDate(p.createdAt) === date));
        mail.internal(data, `sales:${date}`, 'dailySales', message(`Resumen de ventas TPV · ${date}`, [
          `Ventas registradas en este TPV: ${kpis.totalOrders}`, `Importe vendido: ${money(kpis.grossSales)}`,
          `Devoluciones: ${money(kpis.refunds)} · Neto: ${money(kpis.grossSales - kpis.refunds)}`,
          `Efectivo: ${money(kpis.cashSales)} · Tarjeta: ${money(kpis.cardSales)} · Bizum: ${money(kpis.bizumSales)} · Vale: ${money(kpis.voucherSales)}`,
          'Periodo: día completo anterior, de 00:00 a 24:00, hora de Madrid. No incluye ventas de otros canales.',
        ]));
        data.monitor.lastSalesDay = date;
      }
    });
    if ((settings.stockAlerts || settings.stockSummary) && (!current.monitor.stockAt || time - current.monitor.stockAt >= 15 * 60000)) {
      const variants = await readStock(gql);
      await mail.change(data => {
        const previous = data.monitor.stock || {};
        const stock = {};
        const bucket = quantity => quantity < 0 ? 'negativo' : quantity === 0 ? 'agotado' : quantity <= settings.lowStock ? 'bajo' : 'normal';
        for (const item of variants) {
          const quantity = item.inventoryQuantity;
          const before = previous[item.id];
          const changed = before && bucket(before.quantity) !== bucket(quantity);
          const revision = (before?.revision || 0) + (changed ? 1 : 0);
          stock[item.id] = { quantity, revision, title: item.displayName };
          if (changed && bucket(quantity) !== 'normal') mail.internal(data, `stock:${item.id}:${revision}`, 'stockAlerts', message(`Stock ${bucket(quantity)} · ${item.displayName}`, [`Producto: ${item.displayName}`, `Stock anterior: ${before.quantity} · Actual: ${quantity}`, `Umbral de stock bajo: ${settings.lowStock}`, 'Existencias totales de todas las ubicaciones de Shopify.']));
        }
        data.monitor.stock = stock;
        data.monitor.stockAt = time;
        if (hour(time) >= settings.reportHour) {
          const low = variants.filter(v => v.inventoryQuantity <= settings.lowStock);
          mail.internal(data, `stock-summary:${today}`, 'stockSummary', message(`Reposición · ${today}`, [`Variantes con stock bajo, agotado o negativo: ${low.length}`, 'Existencias totales de todas las ubicaciones de Shopify.', ...low.map(v => `${v.displayName}: ${v.inventoryQuantity} unidades`)]));
        }
      });
    }
    await mail.change(data => {
      data.monitor.lastCheck = new Date(time).toISOString(); data.monitor.lastError = null;
      data.monitor.failures = 0; data.monitor.failureSince = null;
      for (const job of Object.values(data.jobs)) if (job.category === 'synchronization' && job.status === 'queued') job.status = 'cancelled';
    });
  }
  async function tick() {
    if (running) return;
    running = true;
    try {
      try { await scan(); }
      catch {
        await mail.change(data => {
          data.monitor.failures = (data.monitor.failures || 0) + 1;
          data.monitor.failureSince ||= new Date(now()).toISOString();
          data.monitor.lastError = 'No se pudo completar la comprobación de Shopify o de los datos contables. Revisa la conexión y las operaciones pendientes.';
          if (data.monitor.failures >= 3) mail.internal(data, `sync:${data.monitor.failureSince}`, 'synchronization', message('Error persistente de comprobación del TPV', [data.monitor.lastError, `Desde: ${data.monitor.failureSince}`, 'No se han modificado pedidos ni existencias.']));
        });
      }
      await mail.flush();
    } finally { running = false; }
  }
  return { scan, tick };
}
