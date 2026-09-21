import { AppImage } from "../AppImage.jsx";
import { formatInr } from "../../utils/venueListMapper.js";

function productStatus(product) {
  if (product.adminApproved === false) {
    return { label: "Pending approval", tone: "pending" };
  }
  if (product.status === "inactive") {
    return { label: "Inactive", tone: "cancelled" };
  }
  return { label: "Active", tone: "confirmed" };
}

export function ProductCard({ product, onDelete }) {
  const status = productStatus(product);
  const image = product.thumbnail || product.images?.[0] || "";

  return (
    <article className="vendor-ecom-product-card">
      <div className="vendor-ecom-product-card__media">
        <AppImage src={image} alt="" className="vendor-ecom-product-card__img" />
      </div>
      <div className="vendor-ecom-product-card__body">
        <div className="vendor-ecom-product-card__head">
          <h3 className="vendor-ecom-product-card__name">{product.name || "Untitled product"}</h3>
          <span className={`vendor-dash-badge vendor-dash-badge--${status.tone}`}>{status.label}</span>
        </div>
        {product.subCategory?.name || product.category?.name ? (
          <p className="vendor-ecom-product-card__meta">
            {[product.category?.name, product.subCategory?.name].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        <p className="vendor-ecom-product-card__price">{formatInr(product.price ?? product.sellingPrice ?? 0)}</p>
        <div className="vendor-ecom-product-card__actions">
          <button type="button" className="vendor-ecom-product-card__delete" onClick={() => onDelete(product)}>
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}
