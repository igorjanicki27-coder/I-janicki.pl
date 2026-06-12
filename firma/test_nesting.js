// Test nesting of template literals with map + arrow function + return TL
const items = [1, 2, 3];
const invoices = [
  { id: 'inv1', number: 'FV/01', amount: 100, kind: 'own', attachmentIds: [] },
  { id: 'inv2', number: 'FV/02', amount: 200, kind: 'external', attachmentIds: ['att1'] },
];
const entry = { id: 'e1', date: '2026-01-15', linkedInvoiceId: 'inv1', title: '' };

// Simulate the EXACT nesting pattern from portfel.js
const html = `
  <table>
    <tbody>
      ${items.map((item, index) => {
        const linkedInv = invoices.find(inv => inv.id === 'inv1');
        const zwLabel = linkedInv ? (linkedInv.kind === 'own' ? 'W' : 'Z') : '-';
        return `
        <tr>
          <td>${index + 1}</td>
          <td>${linkedInv?.number || '-'}</td>
          <td class="tone-rose">${linkedInv?.amount || 0}</td>
          <td><span class="badge">${zwLabel}</span></td>
          <td class="table-actions">
            ${linkedInv?.attachmentIds?.length ? `<button>${'icon'}</button>` : ''}
            <button>${'trash-icon'}</button>
          </td>
        </tr>
        `;
      }).join('')}
    </tbody>
  </table>
`;

console.log('SUCCESS');
console.log(html);
