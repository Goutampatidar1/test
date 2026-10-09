const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function formatINR(amount?: number | null) {
  return typeof amount === "number" && amount > 0 ? inr.format(amount) : null;
}
