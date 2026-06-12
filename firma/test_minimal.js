// Minimal test of the EXACT pattern from portfel.js
const expenses = [{ id: 'e1', date: '2026-01-01', linkedInvoiceId: 'inv1', title: '' }];
const firm = {
  invoices: [{ id: 'inv1', number: 'FV/01', amount: 100, kind: 'own', title: 'Test', attachmentIds: [] }]
};

// EXACT nesting: TL > ${ > map > arrow { > return TL > }
const result = `
  <tbody>
    ${expenses.map((entry, index) => {
      const linkedInv = firm.invoices.find(inv => inv.id === entry.linkedInvoiceId);
      const zwLabel = linkedInv ? (linkedInv.kind === 'own' ? 'W' : 'Z') : '-';
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${linkedInv?.number || '-'}</td>
          <td class="actions">
            ${linkedInv?.attachmentIds?.length ? `<button>${'icon'}</button>` : ''}
            <button>${'trash'}</button>
          </td>
        </tr>
      `;
    }).join('')}
  </tbody>
`;

console.log('SUCCESS');
console.log(result);
