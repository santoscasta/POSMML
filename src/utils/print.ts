import { recordDiagnostic, flushDiagnostics } from './diagnostics';

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const thermalStyles = `
  @page { margin: 0; }
  * { box-sizing: border-box; color: #000 !important; }
  /* Rollos de 70 mm: dejamos 3 mm de margen a cada lado para evitar recortes. */
  body { width: 70mm; max-width: 100%; margin: 0 auto; padding: 3mm; font: 12px/1.3 Arial, sans-serif; }
  .center, .footer { text-align: center; }
  .receipt-logo-window { width: 100%; height: 18mm; overflow: hidden; display: flex; align-items: center; justify-content: center; margin-bottom: 1mm; }
  .receipt-logo { display: block; width: 145%; max-width: none; height: auto; flex: 0 0 auto; filter: grayscale(1) brightness(0.7) contrast(10); }
  .brand, .total { font-size: 16px; font-weight: bold; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
  .row span { overflow-wrap: anywhere; }
  .bold { font-weight: bold; }
  .item { padding: 2px 0; break-inside: avoid; }
  .footer { margin-top: 8px; font-size: 11px; }
  .code { font: bold 16px monospace; overflow-wrap: anywhere; }
  @media screen { body { padding-top: 16px; } }
`;

// Serialized into the ticket document. Keep this function self-contained: the
// print dialog must run in the independent tab, never in the POS's event loop.
async function initializePrintWindow(channelName: string) {
  const started = performance.now();
  const channel = new BroadcastChannel(channelName);
  const report = (event: string, count?: number) => {
    try { channel.postMessage({ event, count, durationMs: Math.round(performance.now() - started) }); }
    catch { /* A closed monitor must not prevent printing. */ }
  };
  const print = () => {
    try { window.print(); report('print.returned'); }
    catch { report('print.error'); }
  };
  window.addEventListener('beforeprint', () => report('print.dialog_open'));
  window.addEventListener('afterprint', () => report('print.dialog_closed'));
  window.addEventListener('pagehide', () => { report('print.window_closed'); channel.close(); });
  const controls = document.createElement('div');
  controls.className = 'print-controls';
  const printButton = document.createElement('button');
  printButton.textContent = 'Imprimir';
  printButton.disabled = true;
  printButton.addEventListener('click', print);
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Cerrar';
  closeButton.addEventListener('click', () => window.close());
  controls.append(printButton, closeButton);
  document.body.prepend(controls);

  report('print.ready');

  const images = Array.from(document.images);
  const imagesReady = images.map(image => image.decode().catch(() => {}));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  // A stalled logo/font must not leave the ticket waiting indefinitely.
  await Promise.race([
    Promise.allSettled([document.fonts.ready, ...imagesReady]),
    new Promise(resolve => { timeout = setTimeout(resolve, 5000); }),
  ]);
  clearTimeout(timeout);
  let fallbackCount = 0;
  for (const image of images) {
    if (!image.complete || !image.naturalWidth) {
      const fallback = document.createElement('div');
      fallback.className = 'center brand';
      fallback.textContent = image.alt;
      image.replaceWith(fallback);
      fallbackCount++;
    }
  }
  printButton.disabled = false;
  report('print.assets_ready', fallbackCount);
  print();
}

export function printDocument(html: string): Promise<boolean> {
  const printId = crypto.randomUUID();
  const channelName = `pos-print-${printId}`;
  const started = performance.now();
  recordDiagnostic('print.requested', { printId });
  void flushDiagnostics();
  const base = `<meta charset="utf-8"><base href="${escapeHtml(window.location.href)}">`;
  const style = '<style>.print-controls{display:flex;gap:12px;margin-bottom:16px}.print-controls button{padding:8px 16px}@media print{.print-controls{display:none!important}}</style>';
  const script = `<script>(${initializePrintWindow.toString()})(${JSON.stringify(channelName)});</script>`;
  const documentHtml = html.replace(/<head\b[^>]*>/i, match => `${match}${base}${style}`)
    // Lazy images do not hold the document's load event open. Otherwise the
    // native print() can wait forever even after our image timeout expires.
    .replace(/<img\b/gi, '<img loading="lazy"')
    .replace(/<\/body>/i, () => `${script}</body>`);
  const url = URL.createObjectURL(new Blob([documentHtml], { type: 'text/html;charset=utf-8' }));

  return new Promise(resolve => {
    const channel = new BroadcastChannel(channelName);
    let acknowledged = false;
    const close = () => {
      clearTimeout(timeout);
      clearTimeout(monitor);
      channel.close();
      URL.revokeObjectURL(url);
    };
    // noopener deliberately returns null even on success. The ticket signals
    // that it loaded so blocked popups still produce the existing UI warning.
    const timeout = setTimeout(() => {
      recordDiagnostic('print.open_timeout', { printId, durationMs: performance.now() - started });
      resolve(false);
      close();
    }, 5000);
    const monitor = setTimeout(() => {
      recordDiagnostic('print.monitor_expired', { printId, durationMs: performance.now() - started });
      close();
    }, 600000);
    const events = new Set(['print.ready', 'print.assets_ready', 'print.dialog_open', 'print.dialog_closed', 'print.returned', 'print.error', 'print.window_closed']);
    channel.onmessage = event => {
      const data = event.data === 'ready' ? { event: 'print.ready' } : event.data;
      if (!data || !events.has(data.event)) return;
      recordDiagnostic(data.event, { printId, durationMs: performance.now() - started, count: data.count });
      if (data.event === 'print.ready' && !acknowledged) {
        acknowledged = true;
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        resolve(true);
      }
      if (data.event === 'print.window_closed') {
        if (!acknowledged) resolve(false);
        close();
      }
    };
    try { window.open(url, '_blank', 'noopener'); }
    catch { recordDiagnostic('print.error', { printId }); resolve(false); close(); }
  });
}
