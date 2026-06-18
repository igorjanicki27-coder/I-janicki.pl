import { formatCurrency, formatDate } from './logic.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildInvoiceHtml(invoice, firm, issuer, logoDataUri) {
  const buyer = invoice.buyerSnapshot || {
    name: firm.name,
    nip: firm.nip,
    address1: firm.address1,
    address2: firm.address2,
    phone: firm.phone,
    email: firm.email,
  };

  // Backward compat: old snapshots may have `address` instead of address1/address2
  const buyerAddr1 = buyer.address1 || buyer.address || '';
  const buyerAddr2 = buyer.address2 || '';

  const items = Array.isArray(invoice.items) && invoice.items.length > 0
    ? invoice.items
    : [{ description: invoice.title || 'Usługa', quantity: 1, unitPrice: invoice.amount || 0 }];

  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  const invoiceName = 'FAKTURA ZWOLNIONA';
  const footerNote = 'Działalność nierejestrowana prowadzona na podstawie art. 5 ust. 1 ustawy Prawo przedsiębiorców. Sprzedaż zwolniona z VAT na podstawie art. 113 ust. 1 ustawy o VAT.';

  const rowsMarkup = items
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.description)}</td>
          <td>${item.quantity}</td>
          <td>${formatCurrency(item.unitPrice)}</td>
          <td>zw.</td>
          <td>${formatCurrency(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</td>
        </tr>
      `
    )
    .join('');

  // Buyer lines – NIP nad adresem, pomiń puste
  const buyerLines = [];
  if (buyer.name) buyerLines.push(`<div class="party-name">${escapeHtml(buyer.name)}</div>`);
  if (buyer.nip) buyerLines.push(`<div class="party-detail">NIP: ${escapeHtml(buyer.nip)}</div>`);
  // Separator po NIP, przed adresem
  if (buyer.nip && (buyerAddr1 || buyerAddr2)) buyerLines.push(`<div class="party-sep"></div>`);
  if (buyerAddr1) buyerLines.push(`<div class="party-addr">${escapeHtml(buyerAddr1)}</div>`);
  if (buyerAddr2) buyerLines.push(`<div class="party-addr">${escapeHtml(buyerAddr2)}</div>`);
  // Separator po adresie, przed tel/email
  if ((buyerAddr1 || buyerAddr2) && (buyer.phone || buyer.email)) buyerLines.push(`<div class="party-sep"></div>`);
  if (buyer.phone) buyerLines.push(`<div class="party-detail">tel. ${escapeHtml(buyer.phone)}</div>`);
  if (buyer.email) buyerLines.push(`<div class="party-detail">${escapeHtml(buyer.email)}</div>`);

  return `<!doctype html>
  <html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(invoice.number)} — ${escapeHtml(invoiceName)}</title>
    <style>
      @page { size: A4; margin: 0; }
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #dbe3ee;
        color: #101827;
        font-family: Inter, Arial, sans-serif;
      }

      .page-stage {
        min-height: 100vh;
        padding: 24px 0 40px;
      }

      .sheet {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        padding: 14mm 14mm 10mm;
        background: white;
        box-shadow: 0 30px 80px rgba(15, 23, 42, 0.12);
      }
      /* === HEADER === */
      .inv-header {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: start;
        margin-bottom: 20px;
      }
      .inv-header-left {
        margin-left: -48px;
        margin-top: -56px;
        align-self: start;
        overflow: visible;
      }
      .inv-header-left img {
        max-height: 260px;
        max-width: 260px;
        display: block;
      }
      .inv-header-center {
        text-align: center;
      }
      .inv-header-center h1 {
        font-size: 14px;
        font-weight: 700;
        margin: 0 0 4px;
        letter-spacing: 0.04em;
        color: #475569;
      }
      .inv-header-center .inv-number {
        font-size: 20px;
        font-weight: 700;
        color: #0f172a;
        font-family: 'JetBrains Mono', monospace;
      }
      .inv-header-right {
        flex: 0 0 auto;
        text-align: right;
        font-size: 13px;
        color: #64748b;
        padding-top: 4px;
      }
      .inv-header-right strong {
        display: block;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #94a3b8;
        margin-bottom: 2px;
      }
      /* === PARTIES === */
      .parties {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
        margin-bottom: 16px;
      }
      .party {
        font-size: 14px;
        line-height: 1.7;
        text-align: center;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 24px 20px;
        background: #f8fafc;
      }
      .party > strong {
        display: block;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #64748b;
        margin-bottom: 10px;
        text-align: center;
      }
      .party .party-name {
        font-weight: 700;
        font-size: 15px;
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid #e7edf4;
        max-width: 60%;
        margin-left: auto;
        margin-right: auto;
      }
      .party .party-addr {
        color: #334155;
      }
      .party .party-sep {
        margin: 8px auto 0;
        padding-top: 8px;
        border-top: 1px solid #e7edf4;
        color: #334155;
        max-width: 60%;
      }
      .party .party-detail {
        color: #334155;
        font-size: 13px;
      }
      .party .party-email-placeholder {
        color: #94a3b8;
        font-style: italic;
      }
      /* === ITEMS BOX === */
      .items-box {
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 16px 20px;
        background: #f8fafc;
        margin-bottom: 10px;
      }
      /* === TABLE === */
      table {
        width: 100%;
        border-collapse: collapse;
      }
      thead th {
        padding: 10px 10px;
        border-bottom: 2px solid #dbe4ef;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        text-align: center;
      }
      thead th:nth-child(2) {
        text-align: left;
      }
      tbody td {
        padding: 14px 10px;
        border-bottom: 1px solid #eef2f7;
        vertical-align: top;
        font-size: 13px;
        text-align: center;
      }
      tbody td:nth-child(2) {
        text-align: left;
      }

      tbody tr:last-child td {
        border-bottom: 0;
      }
      .invoice-bottom {
        margin-top: auto;
      }
      /* === SIGNATURE === */
      .signature-area {
        margin-top: 10px;
        display: flex;
        justify-content: space-between;
        flex-shrink: 0;
      }
      .signature-area > div {
        width: 180px;
        border-top: 1px solid #94a3b8;
        padding-top: 6px;
        font-size: 11px;
        color: #94a3b8;
        text-align: center;
      }
      /* === TOTAL === */
      .total-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 20px;
        padding-top: 16px;
        border-top: 2px solid #101827;
        font-size: 18px;
        font-weight: 800;
      }
      .total-row .total-label {
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      /* === NOTES === */
      .notes-block {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid #dbe4ef;
        font-size: 13px;
        color: #475569;
        line-height: 1.6;
      }
      /* === FOOTER === */
      .footnote {
        margin-top: 6px;
        padding-top: 10px;
        border-top: 1px solid #dbe4ef;
        margin-left: -2mm;
        margin-right: -2mm;
        font-size: 8.2px;
        line-height: 1.15;
        letter-spacing: -0.015em;
        color: #64748b;
        flex-shrink: 0;
        white-space: nowrap;
        text-align: center;
      }
      @media print {
        body { background: white; }
        .page-stage { min-height: auto; padding: 0; }
        .sheet { box-shadow: none; }
      }
      @media (max-width: 800px) {
        .page-stage { min-height: auto; padding: 0; }
        .sheet {
          width: auto;
          min-height: auto;
          margin: 0;
          padding: 24px;
        }
        .inv-header {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .inv-header-left {
          margin: 0;
          align-self: center;
        }
        .inv-header-left img {
          max-height: 120px;
          max-width: 120px;
        }
        .inv-header-center { text-align: left; }
        .inv-header-right { text-align: left; }
        .parties { grid-template-columns: 1fr; }
        .invoice-bottom { margin-top: 24px; }
        .footnote {
          margin-left: 0;
          margin-right: 0;
          font-size: 10px;
          line-height: 1.5;
          white-space: normal;
          text-align: left;
        }
      }
    </style>
  </head>
  <body>
    <div class="page-stage">
    <section class="sheet">
      <!-- HEADER -->
      <div class="inv-header">
        <div class="inv-header-left">
          ${logoDataUri ? `<img src="${logoDataUri}" alt="Logo" />` : ''}
        </div>
        <div class="inv-header-center">
          <h1>${escapeHtml(invoiceName)}</h1>
          <div class="inv-number">${escapeHtml(invoice.number)}</div>
        </div>
        <div class="inv-header-right">
          <strong>Data wystawienia</strong>
          ${escapeHtml(formatDate(invoice.issueDate))}
        </div>
      </div>

      <!-- PARTIES -->
      <div class="parties">
        <div class="party">
          <strong>Sprzedawca</strong>
          <div class="party-name">Igor Janicki</div>
          <div class="party-detail">NIP: 899-304-70-85</div>
          <div class="party-sep"></div>
          <div class="party-addr">ul. Pułtuska 20/9</div>
          <div class="party-addr">53-116 Wrocław</div>
          <div class="party-sep"></div>
          <div class="party-detail">tel. 57 57 57 817</div>
          <div class="party-detail">igor.janicki27@gmail.com</div>
        </div>

        <div class="party">
          <strong>Nabywca</strong>
          ${buyerLines.join('\n          ') || '<div>—</div>'}
        </div>
      </div>

      <!-- ITEMS -->
      <div class="items-box">
      <table>
        <thead>
          <tr>
            <th>Lp.</th>
            <th>Pozycja</th>
            <th>Ilość</th>
            <th>Cena netto</th>
            <th>VAT</th>
            <th>Wartość</th>
          </tr>
        </thead>
        <tbody>
          ${rowsMarkup}
        </tbody>
      </table>
      </div>

      <!-- TOTAL -->
      <div class="invoice-bottom">
        <div class="total-row">
          <span class="total-label">Razem</span>
          <span>${formatCurrency(subtotal)}</span>
        </div>

        <!-- NOTES -->
        ${invoice.notes ? `
        <div class="notes-block">
          ${escapeHtml(invoice.notes)}
        </div>
        ` : ''}

        <!-- SIGNATURE -->
        <div class="signature-area">
          <div>Podpis sprzedawcy</div>
          <div>Podpis nabywcy</div>
        </div>

        <!-- FOOTER -->
        <div class="footnote">
          ${escapeHtml(footerNote)}
        </div>
      </div>
    </section>
    </div>
  </body>
  </html>`;
}

export function openInvoicePreview({ invoice, firm, issuer, onSave, onCancel }) {
  // Absolutny URL do logo – iframe z srcdoc nie wspiera względnych ścieżek
  const logoUrl = new URL('../logo_i-janicki.png', window.location.href).href;
  const html = buildInvoiceHtml(invoice, firm, issuer, logoUrl);

  // Usuń poprzedni overlay jeśli istnieje
  const existing = document.getElementById('invoicePreviewOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'invoicePreviewOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#0f172a;display:flex;flex-direction:column;';

  const topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 20px;background:#1e293b;border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;';
  topBar.innerHTML = `
    <strong style="color:#fff;font-size:14px">Podgląd faktury · ${escapeHtml(invoice.number)}</strong>
    <div style="display:flex;gap:8px">
      <button class="preview-btn preview-btn-secondary" data-action="cancel">Anuluj</button>
      <button class="preview-btn preview-btn-secondary" data-action="print">Drukuj</button>
      <button class="preview-btn" data-action="save">Zapisz</button>
    </div>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'flex:1;width:100%;border:0;background:#eef2f7;';
  // Blob URL zamiast srcdoc – unikamy 'about:srcdoc' w wydruku
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  iframe.src = blobUrl;

  overlay.appendChild(topBar);
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);

  // Zapis stanu podglądu, aby po odświeżeniu strony można go było przywrócić
  const previewState = { invoice, firm, issuer };
  try {
    sessionStorage.setItem('ijanicki_firma_previewInvoice', JSON.stringify(previewState));
  } catch (_) { /* quota exceeded – pomiń */ }

  const beforeUnloadHandler = (e) => {
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);

  const close = () => {
    overlay.remove();
    URL.revokeObjectURL(blobUrl);
    sessionStorage.removeItem('ijanicki_firma_previewInvoice');
    window.removeEventListener('beforeunload', beforeUnloadHandler);
  };

  // Delegacja kliknięć w overlay
  overlay.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'cancel':
        if (onCancel) onCancel();
        close();
        break;
      case 'save':
        if (onSave) onSave();
        close();
        break;
      case 'print':
      case 'download':
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (_) {
          window.print();
        }
        break;
    }
  });

  // Escape anuluje
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      if (onCancel) onCancel();
      close();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}
