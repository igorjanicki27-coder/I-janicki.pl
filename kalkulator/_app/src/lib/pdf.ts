import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Order } from '../types';
import logoDataUrl from '../assets/logo-pdf.png?inline';
import dejaVuSansBase64 from '../assets/fonts/DejaVuSans.base64';

const FONT_NAME = 'DejaVuSans';

/**
 * Rejestruje czcionkę DejaVu Sans w instancji jsPDF.
 * DejaVu Sans obsługuje polskie znaki diakrytyczne (ą, ć, ę, ł, ń, ó, ś, ź, ż).
 */
const registerFont = (doc: jsPDF) => {
  try {
    // Sprawdź czy czcionka jest już zarejestrowana (np. przy wielostronicowym PDF)
    doc.getFont(FONT_NAME);
  } catch {
    doc.addFileToVFS('DejaVuSans.ttf', dejaVuSansBase64);
    doc.addFont('DejaVuSans.ttf', FONT_NAME, 'normal');
  }
  doc.setFont(FONT_NAME);
};

export const downloadOrderPDF = (order: Order) => {
  const doc = new jsPDF();

  // Rejestruj czcionkę z polskimi znakami
  registerFont(doc);

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
    ? ['Lp.', 'Nazwa', 'Cena (zł)']
    : ['Lp.', 'Usługa / Materiał', 'Ilość', 'J.M.', 'Cena jedn. (zł)', 'Suma (zł)'];
  const tableRows: any[][] = [];

  order.items.forEach((item, index) => {
    if (isManualList) {
      tableRows.push([
        index + 1,
        item.serviceName,
        item.price.toLocaleString('pl-PL'),
      ]);
      // Sub-items (podpozycje) - wcięte pod pozycją główną
      item.children.forEach((child) => {
        tableRows.push([
          '',
          { content: `  └ ${child.name}`, styles: { fontStyle: 'normal', textColor: [100, 100, 100], fontSize: 8 } },
          '',
        ]);
      });
    } else {
      tableRows.push([
        index + 1,
        item.serviceName,
        item.quantity.toString(),
        item.unitMode === 'custom' ? item.unit : item.unit,
        item.price.toLocaleString('pl-PL'),
        item.total.toLocaleString('pl-PL'),
      ]);
      // Sub-items (podpozycje) - wcięte pod pozycją główną
      item.children.forEach((child) => {
        tableRows.push([
          '',
          { content: `  └ ${child.name}`, styles: { fontStyle: 'normal', textColor: [100, 100, 100], fontSize: 8 } },
          '',
          '',
          '',
          '',
        ]);
      });
    }
  });

  autoTable(doc, {
    startY: 34,
    head: [tableColumn],
    body: tableRows,
    willDrawPage: () => {
      drawCornerLogo();
      // Przywróć czcionkę po narysowaniu nowej strony
      doc.setFont(FONT_NAME);
    },
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 0], font: FONT_NAME, fontStyle: 'normal' },
    styles: { font: FONT_NAME, overflow: 'linebreak' },
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
          4: { cellWidth: 28 },
          5: { cellWidth: 30 },
        },
    foot: isManualList
      ? [['', 'Wartość Całkowita:', order.total.toLocaleString('pl-PL') + ' zł']]
      : [['', '', '', '', 'Wartość Całkowita:', order.total.toLocaleString('pl-PL') + ' zł']],
    footStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: 'normal',
      font: FONT_NAME,
    },
  });

  const fileName = `Zlecenie_${order.name.replace(/[^a-z0-9ąćęłńóśźż]/gi, '_').toLowerCase()}.pdf`;
  doc.save(fileName);
};
