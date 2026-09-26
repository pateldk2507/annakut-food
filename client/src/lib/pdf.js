import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function downloadNodeAsPdf(node, filename) {
  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#fffaf1",
  });

  const image = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - 16;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (imgHeight <= pageHeight - 16) {
    pdf.addImage(image, "PNG", 8, 8, imgWidth, imgHeight);
  } else {
    let remainingHeight = imgHeight;
    let offsetY = 0;

    while (remainingHeight > 0) {
      pdf.addImage(image, "PNG", 8, 8 - offsetY, imgWidth, imgHeight);
      remainingHeight -= pageHeight - 16;
      offsetY += pageHeight - 16;
      if (remainingHeight > 0) {
        pdf.addPage();
      }
    }
  }

  pdf.save(filename);
}
