import Swal from "sweetalert2";

export async function confirmLogout() {
  const { isConfirmed } = await Swal.fire({
    icon: "question",
    title: "Sign out?",
    text: "You will need to sign in again to access the service vendor panel.",
    showCancelButton: true,
    confirmButtonText: "Sign out",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#ea580c",
  });
  return isConfirmed;
}
