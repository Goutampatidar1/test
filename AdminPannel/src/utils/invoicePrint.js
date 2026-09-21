function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInr(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "₹0";
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const PRINT_STYLES = `
  body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; padding: 28px; color: #111827; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 1.35rem; margin: 0 0 4px; letter-spacing: 0.02em; }
  .tag { font-size: 0.8rem; color: #6b7280; margin-bottom: 20px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; font-size: 0.875rem; margin-bottom: 20px; padding: 14px; background: #f9fafb; border-radius: 8px; }
  .meta dt { color: #6b7280; font-weight: 500; margin: 0; }
  .meta dd { margin: 2px 0 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  td.num, th.num { text-align: right; }
  .totals { margin-top: 18px; text-align: right; font-size: 0.9rem; }
  .totals div { margin: 4px 0; }
  .grand { font-size: 1.1rem; font-weight: 700; margin-top: 8px; padding-top: 8px; border-top: 2px solid #111827; }
  @media print { body { padding: 12px; } .no-print { display: none; } }
`;

      /**
 * Prints without opening a new window (avoids pop-up blockers). Uses a hidden iframe in the current document.
 * @returns {boolean}
 */
function printHtmlDocument(title, innerHtml) {
  let iframe;
  try {
    iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("title", String(title || "Invoice"));
    iframe.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;border:0;margin:0;padding:0;opacity:0;overflow:hidden;pointer-events:none;";
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      return false;
    }
    const doc = iframe.contentDocument || win.document;
    doc.open();
    doc.write(
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${esc(title)}</title><style>${PRINT_STYLES}</style></head><body>${innerHtml}<p class="no-print" style="margin-top:20px;font-size:0.85rem;color:#6b7280">Use Print → Save as PDF if needed.</p></body></html>`
    );
    doc.close();

    const cleanup = () => {
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
    };
    win.addEventListener("afterprint", cleanup);
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        cleanup();
      }
    }, 150);
    setTimeout(cleanup, 120000);
    return true;
  } catch {
    try {
      iframe?.remove();
    } catch {
      /* ignore */
    }
    return false;
  }
}

/**
 * Always fetch via authenticated API (regenerates PDF). Do not open /uploads/... URLs —
 * Apache often 404s those even when Node has the file.
 */
export async function openAdminEcomOrderInvoicePdf(fetchPdfBlob, orderId) {
  const blob = await fetchPdfBlob(orderId);
  const objectUrl = URL.createObjectURL(blob);
  const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
  if (!opened) {
    const err = new Error("Pop-up blocked. Allow pop-ups to view the invoice PDF.");
    throw err;
  }
  return true;
}

/**
 * @param {{ kind: 'ecom' | 'venue', row: Record<string, unknown> }} opts
 */
export function openOrderInvoice({ kind, row }) {
  const label = kind === "venue" ? "Booking" : "E-commerce order";
  const items = Array.isArray(row.items) ? row.items : [];
  const user = row.user && typeof row.user === "object" ? row.user : {};

  const itemRows =
    items.length === 0
      ? `<tr><td colspan="${kind === "venue" ? 6 : 5}">No line items in list view.</td></tr>`
      : items
          .map((item) => {
            if (kind === "venue") {
              const venue = item.venue && typeof item.venue === "object" ? item.venue.name : "";
              return `<tr>
              <td>${esc(item.name)}</td>
              <td>${esc(venue)}</td>
              <td class="num">${esc(item.quantity)}</td>
              <td class="num">${esc(formatInr(item.unitPrice))}</td>
              <td class="num">${esc(formatInr(item.totalPrice))}</td>
              <td>${esc(formatDate(item.bookingDate))}${item.bookingSlot ? ` · ${esc(item.bookingSlot)}` : ""}</td>
            </tr>`;
            }
            return `<tr>
            <td>${esc(item.name)}</td>
            <td>${esc(item.sku || "—")}</td>
            <td class="num">${esc(item.quantity)}</td>
            <td class="num">${esc(formatInr(item.unitPrice))}</td>
            <td class="num">${esc(formatInr(item.totalPrice))}</td>
          </tr>`;
          })
          .join("");

  const thead =
    kind === "venue"
      ? `<tr><th>Item</th><th>Service</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th><th>Booking</th></tr>`
      : `<tr><th>Item</th><th>SKU</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th></tr>`;

  const ship = Number(row.shippingCharge);
  const shipping =
    kind === "ecom" && Number.isFinite(ship) && ship > 0
      ? `<div>Shipping: <strong>${esc(formatInr(ship))}</strong></div>`
      : "";

  const inner = `
    <h1>Invoice</h1>
    <p class="tag">${esc(label)} · ${esc(row.orderNumber || row._id)}</p>
    <dl class="meta">
      <div><dt>Bill to</dt><dd>${esc(user.name || "—")}</dd></div>
      <div><dt>Contact</dt><dd>${esc([user.phone, user.email].filter(Boolean).join(" · ") || "—")}</dd></div>
      <div><dt>Order status</dt><dd>${esc(row.orderStatus || "—")}</dd></div>
      <div><dt>Payment</dt><dd>${esc(row.paymentStatus || "—")} · ${esc(row.paymentMethod || "—")}</dd></div>
      <div><dt>Date</dt><dd>${esc(formatDate(row.placedAt || row.createdAt))}</dd></div>
      <div><dt>Notes</dt><dd>${esc(row.notes || "—")}</dd></div>
    </dl>
    <table><thead>${thead}</thead><tbody>${itemRows}</tbody></table>
    <div class="totals">
      <div>Subtotal: <strong>${esc(formatInr(row.subTotal))}</strong></div>
      <div>Discount: <strong>${esc(formatInr(row.discountTotal))}</strong></div>
      <div>Tax: <strong>${esc(formatInr(row.taxTotal))}</strong></div>
      ${shipping}
      <div class="grand">Grand total: ${esc(formatInr(row.grandTotal))}</div>
    </div>
  `;

  return printHtmlDocument(`Invoice ${row.orderNumber || row._id}`, inner);
}

/**
 * @param {{ tabKey: 'order' | 'booking' | 'recharge', row: { raw: Record<string, unknown>, transactionId: string, orderId: string, customer: string, amount: unknown, method: string, date: unknown, status: string } }} opts
 */
export function openTransactionInvoice({ tabKey, row }) {
  const raw = row.raw || {};
  const user = raw.user && typeof raw.user === "object" ? raw.user : {};
  const label =
    tabKey === "order" ? "Order payment" : tabKey === "booking" ? "Booking payment" : "Recharge payment";

  let extra = "";
  if (tabKey === "recharge") {
    const r = raw.recharge && typeof raw.recharge === "object" ? raw.recharge : {};
    extra = `
      <div><dt>Recharge type</dt><dd>${esc(raw.rechargeType || r.type || "—")}</dd></div>
      <div><dt>Contact / ref.</dt><dd>${esc(r.contactNumber || row.orderId)} · ${esc(r.referenceId || raw.referenceId || "—")}</dd></div>
      <div><dt>Provider</dt><dd>${esc(r.provider || "—")}</dd></div>
      <div><dt>Recharge status</dt><dd>${esc(r.status || "—")}</dd></div>
    `;
  } else {
    const ord = raw.order && typeof raw.order === "object" ? raw.order : {};
    extra = `
      <div><dt>Linked order</dt><dd>${esc(ord.orderNumber || row.orderId)}</dd></div>
      <div><dt>Order total</dt><dd>${esc(formatInr(ord.grandTotal))}</dd></div>
      <div><dt>Order status</dt><dd>${esc(ord.orderStatus || "—")}</dd></div>
      <div><dt>Order payment</dt><dd>${esc(ord.paymentStatus || "—")}</dd></div>
    `;
  }

  const inner = `
    <h1>Payment receipt</h1>
    <p class="tag">${esc(label)} · ${esc(row.transactionId)}</p>
    <dl class="meta">
      <div><dt>Customer</dt><dd>${esc(row.customer || user.name || "—")}</dd></div>
      <div><dt>Email / phone</dt><dd>${esc([user.email, user.phone].filter(Boolean).join(" · ") || "—")}</dd></div>
      <div><dt>Amount</dt><dd>${esc(formatInr(row.amount))}</dd></div>
      <div><dt>Method</dt><dd>${esc(String(row.method || "—").replace(/_/g, " "))}</dd></div>
      <div><dt>Status</dt><dd>${esc(row.status || raw.status || "—")}</dd></div>
      <div><dt>Date</dt><dd>${esc(formatDate(row.date))}</dd></div>
      ${extra}
      <div><dt>Gateway</dt><dd>${esc(raw.gateway || "—")}</dd></div>
      <div><dt>Gateway order ID</dt><dd>${esc(raw.gatewayOrderId || "—")}</dd></div>
      <div><dt>Gateway payment ID</dt><dd>${esc(raw.gatewayPaymentId || "—")}</dd></div>
      <div><dt>Remarks</dt><dd>${esc(raw.remarks || "—")}</dd></div>
    </dl>
    <div class="totals"><div class="grand">Paid: ${esc(formatInr(raw.amount ?? row.amount))}</div></div>
  `;

  return printHtmlDocument(`Receipt ${row.transactionId}`, inner);
}

/**
 * Full transaction record from admin GET-by-id (same shape as list rows + populated fields).
 * @param {'ecom' | 'venue' | 'recharge'} kind URL segment
 * @param {Record<string, unknown>} tx
 */
export function openTransactionInvoiceFromDetail(kind, tx) {
  const tabKey = kind === "ecom" ? "order" : kind === "venue" ? "booking" : "recharge";
  const row =
    tabKey === "recharge"
      ? {
          raw: tx,
          transactionId: tx.transactionId || "—",
          orderId: tx.recharge?.referenceId || tx.referenceId || "—",
          customer: (tx.user && tx.user.name) || "—",
          amount: tx.amount,
          method: tx.paymentMethod,
          date: tx.createdAt || tx.processedAt,
          status: tx.status,
        }
      : {
          raw: tx,
          transactionId: tx.transactionId || "—",
          orderId: (tx.order && tx.order.orderNumber) || "—",
          customer: (tx.user && tx.user.name) || "—",
          amount: tx.amount,
          method: tx.paymentMethod,
          date: tx.createdAt || tx.processedAt,
          status: tx.status,
        };
  return openTransactionInvoice({ tabKey, row });
}
