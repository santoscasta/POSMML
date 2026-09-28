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

export function printDocument(html: string) {
  const popup = window.open('', '_blank', 'width=400,height=700');
  if (!popup) return false;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  // Image decoding must finish before printing, including on a cold cache.
  const imagesReady = Array.from(popup.document.images).map(async image => {
    try { await image.decode(); }
    catch {
      const fallback = popup.document.createElement('div');
      fallback.className = 'center brand';
      fallback.textContent = image.alt;
      image.replaceWith(fallback);
    }
  });
  void Promise.all([popup.document.fonts.ready, ...imagesReady]).then(() => {
    if (!popup.closed) { popup.focus(); popup.print(); }
  });
  return true;
}
