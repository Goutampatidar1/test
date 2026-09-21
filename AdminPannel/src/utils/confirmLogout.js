import Swal from "sweetalert2";

/** @returns {Promise<boolean>} whether user confirmed logout */
export async function confirmLogout() {
  const { isConfirmed } = await Swal.fire({
    title: "Log out?",
    text: "You will need to sign in again to access the admin panel.",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Yes, log out",
    cancelButtonText: "Cancel",
    reverseButtons: true,
    focusCancel: true,
    confirmButtonColor: "#ea580c",
    cancelButtonColor: "#64748b",
  });
  return isConfirmed;
}
