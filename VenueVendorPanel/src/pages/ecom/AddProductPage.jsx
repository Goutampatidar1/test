import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import { ProductForm } from "../../components/ecom/ProductForm.jsx";

export function AddProductPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCategoryId = searchParams.get("category") || "";

  return (
    <div className="user-page vendor-editor-page vendor-venues-add-page">
      <div className="user-page__toolbar d-flex flex-wrap align-items-center gap-3">
        <Link to="/vendor/products" className="user-back-btn btn btn-light border" aria-label="Back to products">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </Link>
        <div className="flex-grow-1">
          <p className="vendor-editor-page__eyebrow text-secondary small text-uppercase mb-1">Add product</p>
          <h2 className="user-page__title h4 mb-0">Add new product</h2>
        </div>
      </div>

      <div className="user-page__card vendor-editor-page__card card shadow-sm border-0">
        <div className="card-body p-3 p-md-4">
          <ProductForm
            initialCategoryId={initialCategoryId}
            onCancel={() => navigate("/vendor/products")}
            onSuccess={async (product) => {
              const approved = Boolean(product?.adminApproved);
              await Swal.fire({
                icon: "success",
                title: "Product added",
                text: approved
                  ? "Your product is live in the store."
                  : "Product saved. It will appear after admin approval if required.",
                confirmButtonColor: "#141414",
              });
              navigate("/vendor/products", { replace: true });
            }}
          />
        </div>
      </div>
    </div>
  );
}
