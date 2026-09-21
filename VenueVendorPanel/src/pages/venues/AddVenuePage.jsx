import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import { VenueForm } from "../../components/venues/VenueForm.jsx";

export function AddVenuePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCategoryId = searchParams.get("category") || "";

  return (
    <div className="user-page vendor-editor-page vendor-venues-add-page">
      <div className="user-page__toolbar d-flex flex-wrap align-items-center gap-3">
        <Link to="/vendor/venues" className="user-back-btn btn btn-light border" aria-label="Back to services">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </Link>
        <div className="flex-grow-1">
          <p className="vendor-editor-page__eyebrow text-secondary small text-uppercase mb-1">Add service</p>
          <h2 className="user-page__title h4 mb-0">Add new service</h2>
        </div>
      </div>

      <div className="user-page__card vendor-editor-page__card card shadow-sm border-0">
        <div className="card-body p-3 p-md-4">
          <VenueForm
            initialCategoryId={initialCategoryId}
            onCancel={() => navigate("/vendor/venues")}
            onSuccess={async (venue) => {
              const approved = Boolean(venue?.adminApproved);
              await Swal.fire({
                icon: "success",
                title: "Service created",
                text: approved
                  ? "Your service is live and visible to users."
                  : "Your service was submitted and will appear after admin approval.",
                confirmButtonColor: "#141414",
              });
              navigate("/vendor/venues", { replace: true });
            }}
          />
        </div>
      </div>
    </div>
  );
}
