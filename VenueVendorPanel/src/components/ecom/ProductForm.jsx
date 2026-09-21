import { useEffect, useId, useRef, useState } from "react";
import Swal from "sweetalert2";
import { vendorEcomCreateProduct, vendorEcomListCategories, vendorEcomListSubCategories } from "../../api/vendorEcom.js";
import { reportStepValidity } from "../../utils/formValidation.js";

const MAX_IMAGES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function ProductForm({ initialCategoryId = "", onSuccess, onCancel }) {
  const formRef = useRef(null);
  const formId = useId();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: initialCategoryId,
    subCategory: "",
    price: "",
    stock: "",
  });
  const [photoPreview, setPhotoPreview] = useState([]);
  const [photoFiles, setPhotoFiles] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await vendorEcomListCategories({ limit: 100 });
        if (!cancelled) setCategories(items ?? []);
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!form.category) {
      setSubCategories([]);
      setForm((prev) => ({ ...prev, subCategory: "" }));
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const items = await vendorEcomListSubCategories({ category: form.category, limit: 100 });
        if (!cancelled) setSubCategories(items ?? []);
      } catch {
        if (!cancelled) setSubCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.category]);

  useEffect(
    () => () => {
      photoPreview.forEach((src) => {
        if (typeof src === "string" && src.startsWith("blob:")) URL.revokeObjectURL(src);
      });
    },
    [photoPreview],
  );

  const onChange = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handlePhotosChange = (fileList) => {
    const accepted = Array.from(fileList || []).filter((file) => {
      if (!file.type?.startsWith("image/")) return false;
      if (file.size > MAX_FILE_BYTES) return false;
      return true;
    });
    if (!accepted.length) return;

    const remaining = MAX_IMAGES - photoFiles.length;
    const nextFiles = accepted.slice(0, remaining);
    setPhotoFiles((prev) => [...prev, ...nextFiles]);
    setPhotoPreview((prev) => [...prev, ...nextFiles.map((file) => URL.createObjectURL(file))]);
  };

  const removePhoto = (index) => {
    setPhotoPreview((prev) => {
      const target = prev[index];
      if (typeof target === "string" && target.startsWith("blob:")) URL.revokeObjectURL(target);
      return prev.filter((_, idx) => idx !== index);
    });
    setPhotoFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reportStepValidity(formRef.current)) return;

    if (!form.name.trim()) {
      await Swal.fire({ icon: "error", title: "Required", text: "Product name is required.", confirmButtonColor: "#141414" });
      return;
    }
    if (!form.category) {
      await Swal.fire({ icon: "error", title: "Required", text: "Select a category.", confirmButtonColor: "#141414" });
      return;
    }
    if (!form.subCategory) {
      await Swal.fire({ icon: "error", title: "Required", text: "Select a sub-category.", confirmButtonColor: "#141414" });
      return;
    }
    if (!form.price || Number(form.price) < 1) {
      await Swal.fire({ icon: "error", title: "Invalid price", text: "Enter a valid price (minimum ₹1).", confirmButtonColor: "#141414" });
      return;
    }
    if (!photoFiles.length) {
      await Swal.fire({ icon: "error", title: "Required", text: "Upload at least one product image.", confirmButtonColor: "#141414" });
      return;
    }

    setLoading(true);
    try {
      const product = await vendorEcomCreateProduct(
        {
          name: form.name.trim(),
          description: form.description.trim(),
          category: form.category,
          subCategory: form.subCategory,
          price: form.price,
          stock: form.stock || "0",
        },
        { images: photoFiles },
      );
      onSuccess?.(product);
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Could not add product",
        text: err.message || "Please try again.",
        confirmButtonColor: "#141414",
      });
    } finally {
      setLoading(false);
    }
  };

  const id = (name) => `${formId}-${name}`;
  const canAddMorePhotos = photoPreview.length < MAX_IMAGES;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="service-add-form">
      <section className="service-add-form__section">
        <h3 className="service-add-form__title">Product details</h3>
        <div className="service-add-form__fields">
          <div className="service-add-form__field">
            <label htmlFor={id("name")} className="service-add-form__label">
              Product name *
            </label>
            <input
              id={id("name")}
              className="form-control service-add-form__input"
              value={form.name}
              onChange={onChange("name")}
              placeholder="Enter product name"
              required
            />
          </div>
          <div className="service-add-form__field">
            <label htmlFor={id("description")} className="service-add-form__label">
              Short description
            </label>
            <textarea
              id={id("description")}
              className="form-control service-add-form__input"
              rows={3}
              value={form.description}
              onChange={onChange("description")}
              placeholder="Brief description for customers"
            />
          </div>
          <div className="service-add-form__field">
            <label htmlFor={id("category")} className="service-add-form__label">
              Category *
            </label>
            <select
              id={id("category")}
              className="form-control service-add-form__input"
              value={form.category}
              onChange={onChange("category")}
              required
            >
              <option value="">Select category</option>
              {categories.map((cat) => (
                <option key={cat._id || cat.id} value={cat._id || cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="service-add-form__field">
            <label htmlFor={id("subCategory")} className="service-add-form__label">
              Sub-category *
            </label>
            <select
              id={id("subCategory")}
              className="form-control service-add-form__input"
              value={form.subCategory}
              onChange={onChange("subCategory")}
              required
              disabled={!form.category}
            >
              <option value="">Select sub-category</option>
              {subCategories.map((sub) => (
                <option key={sub._id || sub.id} value={sub._id || sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>
          <div className="service-add-form__field">
            <label htmlFor={id("price")} className="service-add-form__label">
              Price (₹) *
            </label>
            <input
              id={id("price")}
              className="form-control service-add-form__input"
              type="number"
              min="1"
              step="0.01"
              value={form.price}
              onChange={onChange("price")}
              placeholder="0.00"
              required
            />
          </div>
          <div className="service-add-form__field">
            <label htmlFor={id("stock")} className="service-add-form__label">
              Stock quantity
            </label>
            <input
              id={id("stock")}
              className="form-control service-add-form__input"
              type="number"
              min="0"
              value={form.stock}
              onChange={onChange("stock")}
              placeholder="0"
            />
          </div>
        </div>
      </section>

      <section className="service-add-form__section">
        <div className="service-add-form__title-row">
          <h3 className="service-add-form__title">Product photos</h3>
          <span className="service-add-form__hint">
            {photoPreview.length}/{MAX_IMAGES} · min 1 required
          </span>
        </div>
        <div className="service-photo-grid">
          {photoPreview.map((src, index) => (
            <div key={`${src}-${index}`} className="service-photo-grid__item">
              <img src={src} alt="" />
              <button type="button" className="service-photo-grid__remove" onClick={() => removePhoto(index)}>
                Remove
              </button>
            </div>
          ))}
          {canAddMorePhotos ? (
            <label htmlFor={id("photos")} className="service-photo-grid__add">
              <input
                id={id("photos")}
                type="file"
                accept="image/*"
                multiple
                className="service-photo-grid__input"
                onChange={(e) => {
                  handlePhotosChange(e.target.files);
                  e.target.value = "";
                }}
              />
              <span>+ Add photo</span>
            </label>
          ) : null}
        </div>
      </section>

      <div className="service-add-form__actions">
        <button type="button" className="btn btn-light border" onClick={onCancel} disabled={loading}>
          Cancel
        </button>
        <button type="submit" className="vendor-venues-add-btn" disabled={loading} style={{ border: 0 }}>
          {loading ? "Saving…" : "Save Product"}
        </button>
      </div>
    </form>
  );
}
