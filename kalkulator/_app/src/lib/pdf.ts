import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Order } from '../types';
import logoDataUrl from '../assets/logo.png?inline';

export const downloadOrderPDF = (order: Order) => {
  const doc = new jsPDF();
  
  // Header
  doc.addImage(logoDataUrl, 'PNG', 172, 10, 24, 24);

  doc.setFontSize(20);
  doc.text(`Zlecenie: ${order.name}`, 14, 22);

  const tableColumn = ["Lp.", "Usluga / Material", "Ilosc", "J.M.", "Cena jedn. (zl)", "Suma (zl)"];
  const tableRows: any[][] = [];

  order.items.forEach((item, index) => {
    const itemData = [
      index + 1,
      item.serviceName,
      item.quantity.toString(),
      item.unitMode === 'custom' ? item.unit : item.unit,
      item.price.toLocaleString('pl-PL'),
      item.total.toLocaleString('pl-PL')
    ];
    tableRows.push(itemData);
  });

  autoTable(doc, {
    startY: 34,
    head: [tableColumn],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129] }, // emerald-500 theme
    styles: { font: 'helvetica' },
    foot: [
      ['', '', '', '', 'Wartosc Calkowita:', order.total.toLocaleString('pl-PL') + ' zl']
    ],
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
  });

  const fileName = `Zlecenie_${order.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
  doc.save(fileName);
};
