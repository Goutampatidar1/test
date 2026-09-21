import Swal from "sweetalert2";

const REJECTION_REASON_MIN = 3;
const REJECTION_REASON_MAX = 500;

export async function promptRejectionReason({
  title = "Reject vendor",
  text = "Please provide a reason for rejection.",
  confirmText = "Reject",
} = {}) {
  const { value, isConfirmed } = await Swal.fire({
    title,
    text,
    input: "textarea",
    inputPlaceholder: "Enter rejection reason...",
    inputAttributes: { maxlength: String(REJECTION_REASON_MAX), rows: "4" },
    showCancelButton: true,
    confirmButtonText: confirmText,
    confirmButtonColor: "#dc2626",
    cancelButtonText: "Cancel",
    inputValidator: (inputValue) => {
      const reason = String(inputValue ?? "").trim();
      if (!reason) return "Rejection reason is required.";
      if (reason.length < REJECTION_REASON_MIN) {
        return `Reason must be at least ${REJECTION_REASON_MIN} characters.`;
      }
      return undefined;
    },
  });

  if (!isConfirmed) return null;
  return String(value ?? "").trim();
}
