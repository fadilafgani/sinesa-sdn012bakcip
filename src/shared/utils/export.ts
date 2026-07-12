import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Extend jsPDF interface to include autoTable definition for compiler safety
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

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
 * Exports tabular data to a PDF report.
 */
export const exportToPDF = (filename: string, title: string, headers: string[], rows: string[][]) => {
  const doc = new jsPDF() as jsPDFWithAutoTable;
  
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
  
  // Generate Table layout
  doc.autoTable({
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
