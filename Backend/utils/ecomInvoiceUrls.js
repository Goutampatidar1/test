const { toAbsoluteUploadUrl } = require("./mediaUrl");

function resolveInvoiceUrls(order, baseUrl) {
  const invoicePdf = order?.invoicePdf ? String(order.invoicePdf) : "";
  const orderId = order?._id;

  return {
    invoicePdf,
    invoicePdfUrl: invoicePdf ? toAbsoluteUploadUrl(invoicePdf, baseUrl) : "",
    invoiceUrl: orderId && baseUrl ? `${baseUrl}/api/user/order-invoice/${orderId}` : "",
    invoiceHtmlUrl:
      orderId && baseUrl ? `${baseUrl}/api/user/order-invoice/${orderId}?format=html` : "",
    adminInvoiceUrl:
      orderId && baseUrl ? `${baseUrl}/api/admin/ecom/orders/${orderId}/invoice` : "",
    vendorInvoiceUrl:
      orderId && baseUrl ? `${baseUrl}/api/vendor/orders/${orderId}/invoice` : "",
  };
}

function attachInvoiceUrls(orders, baseUrl) {
  return (orders ?? []).map((order) => ({
    ...order,
    invoice: resolveInvoiceUrls(order, baseUrl),
  }));
}

module.exports = {
  resolveInvoiceUrls,
  attachInvoiceUrls,
};
