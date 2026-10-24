#!/usr/bin/env bash
# Repair stale token booking ledger (BK-619597-class):
# API wrongly has amountPaid=grandTotal + remainingAmount=0 after only the token was collected.
#
# Required env:
#   USER_JWT                 — user Bearer token (verify booking-detail)
#   ADMIN_JWT                — admin Bearer token (PATCH)
#   BOOKING_MONGO_ID         — VenueOrder _id
#
# Optional env:
#   API_BASE                 — default https://ohoebazar.com
#   ADMIN_BOOKING_PAYMENT_PATH — default /api/admin/venue/orders/$BOOKING_MONGO_ID
#   ORDER_NUMBER             — default BK-619597 (lookup helper only)
#   TOKEN_AMOUNT             — default 500
#   REMAINING_AMOUNT         — default 3000
#   GRAND_TOTAL              — default 3500 (sanity check only)
#
# Example (Git Bash / WSL):
#   export API_BASE=https://ohoebazar.com
#   export USER_JWT='...'
#   export ADMIN_JWT='...'
#   export BOOKING_MONGO_ID='...'
#   bash scripts/admin-fix-booking-bk619597.sh

set -euo pipefail

API_BASE="${API_BASE:-https://ohoebazar.com}"
API_BASE="${API_BASE%/}"
ORDER_NUMBER="${ORDER_NUMBER:-BK-619597}"
TOKEN_AMOUNT="${TOKEN_AMOUNT:-500}"
REMAINING_AMOUNT="${REMAINING_AMOUNT:-3000}"
GRAND_TOTAL="${GRAND_TOTAL:-3500}"

: "${USER_JWT:?Set USER_JWT}"
: "${ADMIN_JWT:?Set ADMIN_JWT}"
: "${BOOKING_MONGO_ID:?Set BOOKING_MONGO_ID (VenueOrder _id)}"

ADMIN_BOOKING_PAYMENT_PATH="${ADMIN_BOOKING_PAYMENT_PATH:-/api/admin/venue/orders/${BOOKING_MONGO_ID}}"
case "$ADMIN_BOOKING_PAYMENT_PATH" in
  http*|HTTP*) ADMIN_URL="$ADMIN_BOOKING_PAYMENT_PATH" ;;
  /*) ADMIN_URL="${API_BASE}${ADMIN_BOOKING_PAYMENT_PATH}" ;;
  *) ADMIN_URL="${API_BASE}/${ADMIN_BOOKING_PAYMENT_PATH}" ;;
esac

USER_DETAIL_URL="${API_BASE}/api/booking-detail/${BOOKING_MONGO_ID}"

echo "==> Pre-check (user booking-detail)"
curl -sS -H "Authorization: Bearer ${USER_JWT}" \
  -H "Accept: application/json" \
  "$USER_DETAIL_URL" | tee /tmp/bk-pre.json
echo

echo "==> Admin PATCH payment ledger → amountPaid=${TOKEN_AMOUNT}, remaining=${REMAINING_AMOUNT}, partially_paid"
curl -sS -X PATCH "$ADMIN_URL" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{
    \"paymentStatus\": \"partially_paid\",
    \"tokenAmount\": ${TOKEN_AMOUNT},
    \"amountPaid\": ${TOKEN_AMOUNT},
    \"remainingAmount\": ${REMAINING_AMOUNT},
    \"grandTotal\": ${GRAND_TOTAL}
  }" | tee /tmp/bk-patch.json
echo

echo "==> Verify (user booking-detail)"
curl -sS -H "Authorization: Bearer ${USER_JWT}" \
  -H "Accept: application/json" \
  "$USER_DETAIL_URL" | tee /tmp/bk-post.json
echo

if command -v python3 >/dev/null 2>&1; then
  TOKEN_AMOUNT="$TOKEN_AMOUNT" REMAINING_AMOUNT="$REMAINING_AMOUNT" python3 - <<'PY'
import json, os, sys
path = "/tmp/bk-post.json"
token = float(os.environ.get("TOKEN_AMOUNT", "500"))
remaining = float(os.environ.get("REMAINING_AMOUNT", "3000"))
with open(path, encoding="utf-8") as f:
    raw = json.load(f)
data = raw.get("data") or raw
payment = data.get("payment") or data.get("paymentSummary") or data
order = data.get("order") or data
paid = float(payment.get("amountPaid") if payment.get("amountPaid") is not None else order.get("amountPaid") or 0)
rem = float(payment.get("remainingAmount") if payment.get("remainingAmount") is not None else order.get("remainingAmount") or 0)
status = str(payment.get("paymentStatus") or order.get("paymentStatus") or "").lower()
ok = abs(paid - token) < 0.01 and abs(rem - remaining) < 0.01 and status == "partially_paid"
print(f"amountPaid={paid} remainingAmount={rem} paymentStatus={status}")
if not ok:
    print("VERIFY FAILED: expected token partial ledger", file=sys.stderr)
    sys.exit(1)
print("VERIFY OK")
PY
else
  echo "(python3 not found — skip numeric verify; inspect /tmp/bk-post.json)"
fi

echo
echo "Done. Optional lookup by order number:"
echo "  curl -sS -H \"Authorization: Bearer \$ADMIN_JWT\" \\"
echo "    \"${API_BASE}/api/admin/venue/orders?search=${ORDER_NUMBER}\""
