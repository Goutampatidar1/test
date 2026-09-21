const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpayScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay is only available in the browser"));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Razorpay));
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay")));
      if (window.Razorpay) resolve(window.Razorpay);
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error("Failed to load Razorpay Checkout"));
    document.body.appendChild(script);
  });
}

/**
 * Open Razorpay Checkout and resolve with payment response fields.
 */
export async function openRazorpayCheckout({
  keyId,
  orderId,
  amountPaise,
  currency = "INR",
  name = "OHO E-Bazar",
  description = "Banner plan subscription",
  prefill = {},
}) {
  const Razorpay = await loadRazorpayScript();
  if (!Razorpay) {
    throw new Error("Razorpay Checkout is unavailable");
  }

  return new Promise((resolve, reject) => {
    const options = {
      key: keyId,
      amount: amountPaise,
      currency,
      name,
      description,
      order_id: orderId,
      prefill: {
        name: prefill.name || "",
        email: prefill.email || "",
        contact: prefill.contact || prefill.phone || "",
      },
      theme: { color: "#fe7000" },
      handler(response) {
        resolve({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss() {
          reject(new Error("Payment cancelled"));
        },
      },
    };

    const checkout = new Razorpay(options);
    checkout.on("payment.failed", (response) => {
      const message =
        response?.error?.description ||
        response?.error?.reason ||
        "Payment failed";
      reject(new Error(message));
    });
    checkout.open();
  });
}
