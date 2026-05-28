import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Order } from '../types';
import logoDataUrl from '../assets/logo-pdf.png?inline';

export const downloadOrderPDF = (order: Order) => {
  const doc = new jsPDF();

  const drawCornerLogo = () => {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.addImage(logoDataUrl, 'PNG', pageWidth - 34, 10, 24, 24);
  };
 
  // Header
  drawCornerLogo();

  const isManualList = order.type === 'lista_reczna';

  doc.setFontSize(20);
  doc.text(`Zlecenie: ${order.name}`, 14, 22);

  const tableColumn = isManualList
    ? ["Lp.", "Nazwa", "Cena (zl)"]
    : ["Lp.", "Usluga / Material", "Ilosc", "J.M.", "Cena jedn. (zl)", "Suma (zl)"];
  const tableRows: any[][] = [];

  order.items.forEach((item, index) => {
    if (isManualList) {
      tableRows.push([
        index + 1,
        item.serviceName,
        item.price.toLocaleString('pl-PL')
      ]);
    } else {
      tableRows.push([
        index + 1,
        item.serviceName,
        item.quantity.toString(),
        item.unitMode === 'custom' ? item.unit : item.unit,
        item.price.toLocaleString('pl-PL'),
        item.total.toLocaleString('pl-PL')
      ]);
    }
  });

  autoTable(doc, {
    startY: 34,
    head: [tableColumn],
    body: tableRows,
    willDrawPage: () => {
      drawCornerLogo();
    },
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 0] },
    styles: { font: 'helvetica' },
    columnStyles: isManualList
      ? {
          0: { cellWidth: 10 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 30 },
        }
      : {
          0: { cellWidth: 10 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 15 },
          3: { cellWidth: 15 },
          4: { cellWidth: 25 },
          5: { cellWidth: 28 },
        },
    foot: isManualList
      ? [
          ['', 'Wartosc Calkowita:', order.total.toLocaleString('pl-PL') + ' zl']
        ]
      : [
          ['', '', '', '', 'Wartosc Calkowita:', order.total.toLocaleString('pl-PL') + ' zl']
        ],
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
  });

  const prefix = 'Zlecenie';
  const fileName = `${prefix}_${order.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
  doc.save(fileName);
};
