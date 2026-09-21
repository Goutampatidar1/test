const path = require("path");
const {
  getUserOrderInvoice,
  getAdminOrderInvoice,
  getVendorOrderInvoice,
  resolveInvoicePdfAbsolutePath,
} = require("../utils/ecomInvoice");

async function sendInvoiceResponse(req, res, invoice, message = "Invoice fetched") {
  const format = String(req.query.format || "").toLowerCase();

  if (format === "html") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(invoice.invoiceHtml || "<p>Invoice unavailable</p>");
  }

  if (format === "pdf") {
    const pdfPath = resolveInvoicePdfAbsolutePath(invoice.invoicePdf);

    if (!pdfPath) {
      return res.status(404).json({
        status: false,
        message: "Invoice PDF not found",
        data: [],
      });
    }

    const fileName = `${invoice.invoiceNumber || invoice.orderNumber || "invoice"}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    return res.sendFile(path.resolve(pdfPath));
  }

  return res.status(200).json({
    status: true,
    message,
    data: [invoice],
  });
}

module.exports = {
  sendInvoiceResponse,
  getUserOrderInvoice,
  getAdminOrderInvoice,
  getVendorOrderInvoice,
};
