import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Exports tabular data to a CSV file.
 */
export const exportToCSV = (filename: string, headers: string[], rows: string[][]) => {
  const csvContent = [
    headers.join(','),
    ...rows.map(row => 
      row.map(val => {
        const cleanVal = val ? val.toString().replace(/"/g, '""') : '';
        return `"${cleanVal}"`;
      }).join(',')
    )
  ].join('\n');

  // Support Indonesian characters using BOM
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Exports tabular data to an Excel (XLS) file with gridlines.
 */
export const exportToExcel = (filename: string, headers: string[], rows: string[][]) => {
  const tableHeader = `<tr>${headers.map(h => `<th style="background-color: #1e40af; color: #ffffff; border: 1px solid #cbd5e1; padding: 8px; font-weight: bold;">${h}</th>`).join('')}</tr>`;
  const tableRows = rows.map(row => 
    `<tr>${row.map(cell => `<td style="border: 1px solid #cbd5e1; padding: 6px;">${cell}</td>`).join('')}</tr>`
  ).join('');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Analisis Kuis</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
      </head>
      <body style="font-family: sans-serif;">
        <table style="border-collapse: collapse;">
          <thead>${tableHeader}</thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Exports tabular data to a PDF report.
 */
export const exportToPDF = (filename: string, title: string, headers: string[], rows: string[][]) => {
  const doc = new jsPDF();
  
  // Set main title styling
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 64, 175); // Brand Blue (#1e40af)
  doc.text(title, 14, 22);
  
  // Set subtitle styling (generation timestamp)
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // Slate 500
  const printedDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  doc.text(`Dihasilkan oleh SINESA pada: ${printedDate}`, 14, 30);
  
  // Generate Table layout using imported function directly
  autoTable(doc, {
    startY: 36,
    head: [headers],
    body: rows,
    theme: 'grid',
    headStyles: { 
      fillColor: [30, 64, 175], 
      textColor: [255, 255, 255], 
      fontStyle: 'bold' 
    },
    styles: { 
      font: 'Helvetica', 
      fontSize: 9, 
      cellPadding: 3 
    },
    alternateRowStyles: { 
      fillColor: [248, 250, 252] // Slate 50
    },
    margin: { top: 35 }
  });
  
  doc.save(`${filename}.pdf`);
};
