import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { vendorEcomDeleteProduct, vendorEcomListProducts } from "../../api/vendorEcom.js";
import { ProductCard } from "../../components/ecom/ProductCard.jsx";
import { VendorSearchField } from "../../components/VendorSearchField.jsx";

export function EcomProductsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { items } = await vendorEcomListProducts({ limit: 100 });
      setProducts(items ?? []);
    } catch (err) {
      setError(err.message || "Could not load products.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) => {
      const name = String(product.name || "").toLowerCase();
      const category = String(product.category?.name || "").toLowerCase();
      const sub = String(product.subCategory?.name || "").toLowerCase();
      return name.includes(q) || category.includes(q) || sub.includes(q);
    });
  }, [products, search]);

  const handleDelete = async (product) => {
    const id = product._id || product.id;
    if (!id) return;
    const result = await Swal.fire({
      icon: "warning",
      title: "Delete product?",
      text: `Remove "${product.name || "this product"}" from your catalog?`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Delete",
    });
    if (!result.isConfirmed) return;

    try {
      await vendorEcomDeleteProduct(id);
      await loadProducts();
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Delete failed",
        text: err.message || "Could not delete product.",
        confirmButtonColor: "#141414",
      });
    }
  };

  return (
    <div className="vendor-venues-page">
      <header className="vendor-venues-page__head">
        <div>
          <h1 className="vendor-venues-page__title">Product Management</h1>
          <p className="vendor-venues-page__subtitle">
            Manage your shop catalog
            {!loading && !error && products.length > 0
              ? ` · ${products.length} product${products.length === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
        <div className="vendor-venues-page__head-actions">
          <Link to="/vendor/products/new" className="vendor-venues-add-btn">
            <span aria-hidden="true">+</span> Add Product
          </Link>
        </div>
      </header>

      <div className="vendor-list-toolbar">
        <VendorSearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products..."
          aria-label="Search products"
        />
      </div>

      {error ? (
        <p className="vendor-venues-empty vendor-venues-empty--error">
          {error}{" "}
          <button type="button" className="vendor-venues-retry" onClick={loadProducts}>
            Retry
          </button>
        </p>
      ) : null}

      {loading ? <p className="vendor-venues-empty">Loading your products…</p> : null}

      {!loading && !error ? (
        <div className="vendor-ecom-product-grid">
          {filtered.length === 0 ? (
            <div className="vendor-ecom-empty-state">
              <h3>{products.length === 0 ? "No products yet" : "No products match your search"}</h3>
              <p>
                {products.length === 0
                  ? "Add your first product to start selling from the vendor panel."
                  : "Try a different search term."}
              </p>
              {products.length === 0 ? (
                <Link to="/vendor/products/new" className="vendor-venues-add-btn">
                  <span aria-hidden="true">+</span> Add Product
                </Link>
              ) : null}
            </div>
          ) : (
            filtered.map((product) => (
              <ProductCard key={product._id || product.id} product={product} onDelete={handleDelete} />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
