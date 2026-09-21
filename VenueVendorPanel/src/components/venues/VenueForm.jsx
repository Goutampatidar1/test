import { useEffect, useId, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import {
  venueVendorListCategories,
} from "../../api/venueVendorCatalog.js";
import { publicListCategories } from "../../api/publicCatalog.js";
import { vendorCreateVenue, vendorUpdateVenue } from "../../api/vendorVenues.js";
import { mediaUrl } from "../../media.js";
import { resolveServiceCategoryImage } from "../../utils/serviceCategoryIcon.js";
import { logout } from "../../store/authSlice.js";
import { reportStepValidity } from "../../utils/formValidation.js";

const LIMITS = {
  name: 80,
  shortDescription: 200,
  maxPhotos: 6,
};

const PRICE_TYPES = [
  { id: "full", label: "Full booking" },
  { id: "hourly", label: "Per hour" },
  { id: "day", label: "Per day" },
];

function emptyForm() {
  return {
    name: "",
    shortDescription: "",
    category: "",
    priceType: "full",
    price: "",
    tokenAmount: "",
  };
}

function inferPriceType(venue) {
  if (venue?.priceType && PRICE_TYPES.some((item) => item.id === venue.priceType)) {
    return venue.priceType;
  }
  if (Number(venue?.hourlyPrice) > 0 && Number(venue?.dayPrice) <= 0 && Number(venue?.basePrice) <= 0) {
    return "hourly";
  }
  if (Number(venue?.dayPrice) > 0) return "day";
  return "full";
}

function inferPriceValue(venue, priceType) {
  if (priceType === "hourly") return venue?.hourlyPrice ?? "";
  if (priceType === "day") return venue?.dayPrice ?? venue?.basePrice ?? "";
  return venue?.basePrice ?? venue?.dayPrice ?? "";
}

function venueToFormValues(venue, initialCategoryId = "") {
  if (!venue) return { ...emptyForm(), category: initialCategoryId };
  const priceType = inferPriceType(venue);
  return {
    ...emptyForm(),
    name: venue.name || "",
    shortDescription: venue.shortDescription || venue.description || "",
    category: venue.category?._id || venue.category || initialCategoryId,
    priceType,
    price: inferPriceValue(venue, priceType),
    tokenAmount: venue.tokenAmount ?? "",
  };
}

function collectExistingPhotos(venue) {
  if (!venue) return [];
  const photos = [];
  if (venue.thumbnail) photos.push(mediaUrl(venue.thumbnail));
  if (Array.isArray(venue.images)) {
    venue.images.forEach((img) => {
      const url = mediaUrl(img);
      if (url && !photos.includes(url)) photos.push(url);
    });
  }
  return photos.slice(0, LIMITS.maxPhotos);
}

function validate(values, mode, photoCount) {
  if (!values.category) return "Select a service type.";
  if (!values.name.trim()) return "Service name is required.";
  if (values.name.trim().length > LIMITS.name) {
    return `Service name cannot exceed ${LIMITS.name} characters.`;
  }
  if (values.shortDescription.trim().length > LIMITS.shortDescription) {
    return `Short description cannot exceed ${LIMITS.shortDescription} characters.`;
  }
  if (photoCount < 1) return "Add at least one service photo.";
  if (photoCount > LIMITS.maxPhotos) {
    return `You can upload at most ${LIMITS.maxPhotos} photos.`;
  }
  const price = Number(values.price);
  if (values.price === "" || Number.isNaN(price) || price <= 0) {
    return "Enter a valid price greater than 0.";
  }
  const tokenAmount = Number(values.tokenAmount);
  if (values.tokenAmount === "" || Number.isNaN(tokenAmount) || tokenAmount < 0) {
    return "Enter a valid booking token amount.";
  }
  if (tokenAmount > price) return "Booking token cannot be greater than the service price.";
  return "";
}

export function VenueForm({
  mode = "create",
  venueId = "",
  initialVenue = null,
  initialCategoryId = "",
  onCancel,
  onSuccess,
}) {
  const formId = useId();
  const formRef = useRef(null);
  const dispatch = useDispatch();
  const token = useSelector((s) => s.auth.token);
  const user = useSelector((s) => s.auth.user);
  const vendorId = user?._id || user?.id || "";

  const [values, setValues] = useState(() => venueToFormValues(initialVenue, initialCategoryId));
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreview, setPhotoPreview] = useState(() => collectExistingPhotos(initialVenue));
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");

  useEffect(() => {
    setValues(venueToFormValues(initialVenue, initialCategoryId));
    setPhotoFiles([]);
    setPhotoPreview(collectExistingPhotos(initialVenue));
  }, [initialCategoryId, initialVenue]);

  useEffect(() => {
    return () => {
      photoPreview.forEach((src) => {
        if (typeof src === "string" && src.startsWith("blob:")) {
          URL.revokeObjectURL(src);
        }
      });
    };
  }, [photoPreview]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    (async () => {
      setCatalogLoading(true);
      setCatalogError("");
      try {
        let rows = await venueVendorListCategories({ limit: 100 });
        if (!rows.length) {
          rows = await publicListCategories({ mode: "venue", limit: 100, includeEmpty: true });
        }
        if (!cancelled) setCategories(rows);
      } catch (error) {
        if (!cancelled) {
          setCategories([]);
          setCatalogError(error?.message || "Could not load service types.");
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleChange = (field) => (e) => {
    setValues((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handlePhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = LIMITS.maxPhotos - photoPreview.length;
    if (remaining <= 0) {
      await Swal.fire({
        icon: "info",
        title: "Photo limit reached",
        text: `You can add up to ${LIMITS.maxPhotos} photos per service.`,
        confirmButtonColor: "#141414",
      });
      e.target.value = "";
      return;
    }

    const accepted = files.slice(0, remaining);
    if (files.length > remaining) {
      await Swal.fire({
        icon: "info",
        title: "Photo limit",
        text: `Only ${remaining} more photo${remaining === 1 ? "" : "s"} added (maximum ${LIMITS.maxPhotos}).`,
        confirmButtonColor: "#141414",
      });
    }

    setPhotoFiles((prev) => [...prev, ...accepted]);
    setPhotoPreview((prev) => [...prev, ...accepted.map((file) => URL.createObjectURL(file))]);
    e.target.value = "";
  };

  const removePhoto = (index) => {
    const existingCount = collectExistingPhotos(initialVenue).length;
    setPhotoPreview((prev) => {
      const target = prev[index];
      if (typeof target === "string" && target.startsWith("blob:")) {
        URL.revokeObjectURL(target);
      }
      return prev.filter((_, idx) => idx !== index);
    });
    if (index >= existingCount) {
      const fileIndex = index - existingCount;
      setPhotoFiles((prev) => prev.filter((_, idx) => idx !== fileIndex));
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!reportStepValidity(formRef.current)) return;
    if (!token || !vendorId) return;

    const message = validate(values, mode, photoPreview.length);
    if (message) {
      await Swal.fire({ icon: "error", title: "Validation error", text: message, confirmButtonColor: "#141414" });
      return;
    }

    const payload = {
      name: values.name.trim(),
      shortDescription: values.shortDescription.trim(),
      description: values.shortDescription.trim(),
      category: values.category,
      priceType: values.priceType,
      price: values.price,
      tokenAmount: values.tokenAmount,
      amenities: [],
      address: "",
    };

    const files = {};
    if (photoFiles.length > 0) {
      files.thumbnail = photoFiles[0];
      if (photoFiles.length > 1) {
        files.images = photoFiles.slice(1);
      }
    }

    setSubmitting(true);
    try {
      const venue =
        mode === "create"
          ? await vendorCreateVenue(payload, files)
          : await vendorUpdateVenue(venueId, payload, files);
      onSuccess?.(venue);
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Save failed",
        text: error.message || "Could not save service.",
        confirmButtonColor: "#141414",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const id = (name) => `${formId}-${name}`;
  const canAddMorePhotos = photoPreview.length < LIMITS.maxPhotos;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="service-add-form">
      <section className="service-add-form__section">
        <h3 className="service-add-form__title">Select service type</h3>
        {catalogLoading ? (
          <div className="form-text">Loading service types…</div>
        ) : (
          <div
            className="service-form-category-grid service-form-category-grid--compact"
            role="radiogroup"
            aria-label="Service type"
          >
            {categories.map((item) => {
              const selected = String(values.category) === String(item._id);
              const iconSrc = resolveServiceCategoryImage(item);
              return (
                <button
                  key={item._id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`service-form-category-card service-form-category-card--compact${selected ? " is-selected" : ""}`}
                  onClick={() => setValues((prev) => ({ ...prev, category: String(item._id) }))}
                >
                  <span className="service-form-category-card__image">
                    <img src={iconSrc} alt="" loading="lazy" />
                  </span>
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
        )}
        {catalogError ? <div className="form-text text-danger">{catalogError}</div> : null}
        {!catalogLoading && !catalogError && categories.length === 0 ? (
          <div className="form-text text-warning">No service types found. Ask admin to add categories.</div>
        ) : null}
      </section>

      <section className="service-add-form__section">
        <div className="service-add-form__title-row">
          <h3 className="service-add-form__title">Add service photos</h3>
          <span className="service-add-form__hint">
            {photoPreview.length}/{LIMITS.maxPhotos} photos (min 1)
          </span>
        </div>
        <div className="service-photo-grid">
          {photoPreview.map((src, index) => (
            <div key={`${src}-${index}`} className="service-photo-grid__item">
              <img src={src} alt="" />
              <button
                type="button"
                className="service-photo-grid__remove"
                onClick={() => removePhoto(index)}
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
          ))}
          {canAddMorePhotos ? (
            <label htmlFor={id("photos")} className="service-photo-grid__add">
              <span aria-hidden="true">+</span>
              <span>Add photo</span>
              <input id={id("photos")} type="file" accept="image/*" multiple hidden onChange={handlePhotos} />
            </label>
          ) : null}
        </div>
      </section>

      <section className="service-add-form__section service-add-form__section--details">
        <h3 className="service-add-form__title">Service details</h3>
        <div className="service-add-form__fields">
          <div className="service-add-form__field">
            <label htmlFor={id("name")} className="service-add-form__label">
              Service name
            </label>
            <input
              id={id("name")}
              className="form-control service-add-form__input"
              value={values.name}
              onChange={handleChange("name")}
              placeholder="e.g. DJ Booking Service"
              maxLength={LIMITS.name}
              required
            />
          </div>

          <div className="service-add-form__field">
            <label htmlFor={id("shortDescription")} className="service-add-form__label">
              Short description
            </label>
            <input
              id={id("shortDescription")}
              className="form-control service-add-form__input"
              value={values.shortDescription}
              onChange={handleChange("shortDescription")}
              placeholder="e.g. DJ + Sound + Light"
              maxLength={LIMITS.shortDescription}
            />
          </div>

          <div className="service-add-form__field">
            <label htmlFor={id("price")} className="service-add-form__label">
              Price (₹)
            </label>
            <input
              id={id("price")}
              className="form-control service-add-form__input"
              type="number"
              min="1"
              step="1"
              value={values.price}
              onChange={handleChange("price")}
              placeholder="15000"
              required
            />
            <div className="service-price-type-toggle" role="radiogroup" aria-label="Price type">
              {PRICE_TYPES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={values.priceType === item.id}
                  className={`service-price-type-toggle__btn${values.priceType === item.id ? " is-active" : ""}`}
                  onClick={() => setValues((prev) => ({ ...prev, priceType: item.id }))}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="service-add-form__field">
            <label htmlFor={id("tokenAmount")} className="service-add-form__label">
              Booking token (₹)
            </label>
            <input
              id={id("tokenAmount")}
              className="form-control service-add-form__input"
              type="number"
              min="0"
              step="1"
              value={values.tokenAmount}
              onChange={handleChange("tokenAmount")}
              placeholder="3000"
              required
            />
            <div className="form-text service-add-form__help">
              Paid by the customer at booking time.
            </div>
          </div>
        </div>
      </section>

      <div className="service-add-form__actions">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary px-4" disabled={submitting}>
          {submitting ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
              Saving…
            </>
          ) : mode === "edit" ? (
            "Save changes"
          ) : (
            "Create service"
          )}
        </button>
      </div>
    </form>
  );
}
