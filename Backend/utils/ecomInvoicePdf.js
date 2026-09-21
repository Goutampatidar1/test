const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const uploadsRoot = require("./uploadsRoot");

/** Helvetica cannot render ₹ — use Rs. in PDFs to avoid garbled superscript characters. */
function formatPdfInrAmount(amount) {
  const n = Number(amount) || 0;
  return `Rs. ${n.toLocaleString("en-IN")}`;
}

function formatPdfInrLabel(label, amount) {
  const raw = String(label ?? "").trim();
  if (raw) {
    return raw.replace(/₹/g, "Rs. ");
  }
  return formatPdfInrAmount(amount);
}

function sanitizeFileStem(value) {
  return String(value || "order")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "order";
}

function ensureInvoiceDirectory() {
  const dir = path.join(uploadsRoot, "invoices");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function absoluteInvoicePath(relativePath) {
  const normalized = String(relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/?uploads\//, "");
  return path.join(uploadsRoot, normalized);
}

function writeInvoicePdfFile(invoiceData, relativePath) {
  const absolutePath = absoluteInvoicePath(relativePath);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const stream = fs.createWriteStream(absolutePath);

    doc.pipe(stream);

    const appName = invoiceData.appName || "OHO E-Bazar";
    const billTo = invoiceData.billTo || {};
    const payment = invoiceData.paymentDetail || {};
    const summary = invoiceData.summary || {};

    doc.fontSize(20).font("Helvetica-Bold").text("Invoice", { align: "left" });
    doc.moveDown(0.2);
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#666666")
      .text(`${appName} · ${invoiceData.invoiceNumber || ""}`);
    doc.fillColor("#000000");
    doc.moveDown(1);

    doc.fontSize(11).font("Helvetica-Bold").text("Bill to");
    doc.font("Helvetica").fontSize(10);
    doc.text(billTo.name || "—");
    if (billTo.phone) doc.text(billTo.phone);
    if (billTo.email) doc.text(billTo.email);
    if (billTo.address) doc.text(billTo.address);

    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").text("Order details");
    doc.font("Helvetica");
    doc.text(`Order: ${invoiceData.orderNumber || "—"}`);
    doc.text(`Date: ${invoiceData.placedAtLabel || "—"}`);
    doc.text(
      `Payment: ${payment.paymentStatus || "—"} · ${payment.paymentMethodLabel || payment.paymentMethod || "—"}`
    );

    doc.moveDown(1);
    const tableTop = doc.y;
    const colX = [48, 220, 280, 340, 410, 490];
    const headers = ["Item", "SKU", "Qty", "Unit", "Total"];

    doc.font("Helvetica-Bold").fontSize(9);
    headers.forEach((header, index) => {
      doc.text(header, colX[index], tableTop, { width: index === 0 ? 165 : 60, align: index >= 2 ? "right" : "left" });
    });

    let rowY = tableTop + 16;
    doc.font("Helvetica").fontSize(9);

    for (const item of invoiceData.items || []) {
      if (rowY > 700) {
        doc.addPage();
        rowY = 48;
      }

      doc.text(String(item.productName || "—"), colX[0], rowY, { width: 165 });
      doc.text(String(item.sku || "—"), colX[1], rowY, { width: 55 });
      doc.text(String(item.quantity ?? "—"), colX[2], rowY, { width: 50, align: "right" });
      doc.text(formatPdfInrLabel(item.unitPriceLabel, item.unitPrice), colX[3], rowY, {
        width: 60,
        align: "right",
      });
      doc.text(formatPdfInrLabel(item.totalPriceLabel, item.totalPrice), colX[4], rowY, {
        width: 70,
        align: "right",
      });
      rowY += 18;
    }

    doc.moveDown(2);
    const totalsY = Math.max(rowY + 12, doc.y);
    doc.font("Helvetica").fontSize(10);
    doc.text(`Subtotal: ${formatPdfInrLabel(summary.subTotalLabel, summary.subTotal)}`, 360, totalsY, {
      align: "right",
      width: 180,
    });
    doc.text(
      `Shipping: ${formatPdfInrLabel(summary.shippingCostLabel, summary.shippingCost)}`,
      360,
      totalsY + 16,
      { align: "right", width: 180 }
    );
    doc.font("Helvetica-Bold").fontSize(12);
    doc.text(
      `Grand total: ${formatPdfInrLabel(summary.totalAmountLabel, summary.totalAmount)}`,
      360,
      totalsY + 36,
      { align: "right", width: 180 }
    );

    doc.end();

    stream.on("finish", () => resolve(absolutePath));
    stream.on("error", reject);
    doc.on("error", reject);
  });
}

async function generateInvoicePdfFile(invoiceData, orderNumber) {
  ensureInvoiceDirectory();
  const fileName = `${sanitizeFileStem(orderNumber)}.pdf`;
  const relativePath = `/uploads/invoices/${fileName}`;
  const absolutePath = absoluteInvoicePath(relativePath);

  if (fs.existsSync(absolutePath)) {
    try {
      fs.unlinkSync(absolutePath);
    } catch {
      /* ignore */
    }
  }

  await writeInvoicePdfFile(invoiceData, relativePath);
  return relativePath;
}

module.exports = {
  generateInvoicePdfFile,
  ensureInvoiceDirectory,
  absoluteInvoicePath,
};
