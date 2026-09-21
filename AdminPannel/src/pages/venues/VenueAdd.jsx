import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import Select from "react-select";
import { adminCreateVenue, adminUpdateVenue } from "../../api/adminVenues.js";
import { adminListCategories } from "../../api/adminCategories.js";
import { adminListSubCategories } from "../../api/adminSubCategories.js";
import { adminListAmenities } from "../../api/adminAmenities.js";
import { adminListCities } from "../../api/adminCities.js";
import { adminListSubDistricts } from "../../api/adminSubDistricts.js";
import { mediaUrl } from "../../media.js";
import { logout } from "../../store/authSlice.js";
import { reportStepValidity } from "../../utils/formValidation.js";

const multiSelectStyles = {
  control: (base) => ({
    ...base,
    minHeight: 42,
  }),
  valueContainer: (base) => ({
    ...base,
    paddingTop: 4,
    paddingBottom: 4,
  }),
  menu: (base) => ({
    ...base,
    zIndex: 20,
  }),
};

const LIMITS = {
  name: 80,
  description: 1200,
  address: 250,
};

function emptyForm() {
  return {
    name: "",
    description: "",
    category: "",
    subCategory: "",
    address: "",
    cityId: "",
    subDistrictId: "",
    dayPrice: "",
    tokenAmountPercentage: "",
    amenities: [],
    status: "active",
  };
}

function venueToFormValues(venue) {
  if (!venue) return emptyForm();
  return {
    ...emptyForm(),
    ...venue,
    category: venue.category?._id || venue.category || "",
    subCategory: venue.subCategory?._id || venue.subCategory || "",
    dayPrice: venue.dayPrice ?? venue.basePrice ?? "",
    tokenAmountPercentage: venue.tokenAmountPercentage ?? "",
    amenities: Array.isArray(venue.amenities)
      ? venue.amenities.map((item) => (typeof item === "string" ? item : item?._id || item?.id || "")).filter(Boolean)
      : [],
    cityId: "",
    subDistrictId: "",
  };
}

function validateStep1(values) {
  if (!values.name.trim()) return "Service name is required.";
  if (values.name.trim().length > LIMITS.name) return `Service name cannot exceed ${LIMITS.name} characters.`;
  if (values.description.trim().length > LIMITS.description) {
    return `Description cannot exceed ${LIMITS.description} characters.`;
  }
  if (!values.category) return "Category is required.";
  if (!values.subDistrictId) return "Sub-district is required.";
  if (values.dayPrice !== "") {
    const dayPrice = Number(values.dayPrice);
    if (Number.isNaN(dayPrice) || dayPrice < 0) return "Day price must be a valid non-negative number.";
  }
  return "";
}

function validateStep2(values, mode, initialVenue, thumbnailFile) {
  if (!values.address.trim()) return "Address is required.";
  if (values.address.trim().length > LIMITS.address) return `Address cannot exceed ${LIMITS.address} characters.`;
  if (values.tokenAmountPercentage === "" || values.tokenAmountPercentage === null || values.tokenAmountPercentage === undefined) {
    return "Token amount percentage is required.";
  }
  const tokenAmountPercentage = Number(values.tokenAmountPercentage);
  if (Number.isNaN(tokenAmountPercentage) || tokenAmountPercentage < 1 || tokenAmountPercentage > 99) {
    return "Token amount percentage must be between 1 and 99.";
  }
  if (!Array.isArray(values.amenities) || values.amenities.length === 0) return "Select at least one facility.";
  if (mode === "create" && !thumbnailFile && !initialVenue?.thumbnail) {
    return "Thumbnail is required.";
  }
  return "";
}

function validate(values, mode, initialVenue, thumbnailFile) {
  return validateStep1(values) || validateStep2(values, mode, initialVenue, thumbnailFile);
}

function FormSectionTitle({ children }) {
  return (
    <div className="col-12">
      <h6 className="text-secondary text-uppercase small fw-semibold mb-0 mt-1 border-bottom pb-2">{children}</h6>
    </div>
  );
}

function VenueWizardHeader({ step }) {
  return (
    <div className="venue-wizard" aria-label="Service form steps">
      <div className={`venue-wizard__item${step === 1 ? " is-current" : " is-complete"}`}>
        <span className="venue-wizard__index">1</span>
        <span className="venue-wizard__label">Basic details</span>
      </div>
      <div className={`venue-wizard__track${step === 2 ? " is-active" : ""}`} aria-hidden="true" />
      <div className={`venue-wizard__item${step === 2 ? " is-current" : ""}`}>
        <span className="venue-wizard__index">2</span>
        <span className="venue-wizard__label">More details</span>
      </div>
    </div>
  );
}

export function VenueForm({ mode = "create", venueId = "", initialVenue = null, onCancel, onSuccess }) {
  const formId = useId();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const admin = useSelector((s) => s.auth.admin);
  const adminId = admin?._id || admin?.id || "";

  const [step, setStep] = useState(1);
  const step1Ref = useRef(null);
  const step2Ref = useRef(null);
  const [values, setValues] = useState(() => venueToFormValues(initialVenue));
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [galleryFiles, setGalleryFiles] = useState([]);
  const [thumbnailPreview, setThumbnailPreview] = useState("");
  const [galleryPreview, setGalleryPreview] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [subDistrictOptions, setSubDistrictOptions] = useState([]);

  useEffect(() => {
    setValues(venueToFormValues(initialVenue));
  }, [initialVenue]);

  useEffect(() => {
    if (!initialVenue) return;
    setThumbnailPreview(mediaUrl(initialVenue.thumbnail));
    setGalleryPreview(Array.isArray(initialVenue.images) ? initialVenue.images.map((img) => mediaUrl(img)) : []);
  }, [initialVenue]);

  useEffect(() => {
    return () => {
      if (thumbnailPreview && thumbnailPreview.startsWith("blob:")) {
        URL.revokeObjectURL(thumbnailPreview);
      }
      galleryPreview.forEach((src) => {
        if (typeof src === "string" && src.startsWith("blob:")) {
          URL.revokeObjectURL(src);
        }
      });
    };
  }, [galleryPreview, thumbnailPreview]);

  useEffect(() => {
    if (!adminToken) return;
    (async () => {
      try {
        const { categories: rows } = await adminListCategories(adminToken, { limit: 100, mode: "venue", status: "active" });
        setCategories(rows);
      } catch (error) {
        if (error?.status === 401) dispatch(logout());
      }
    })();
  }, [adminToken, dispatch]);

  useEffect(() => {
    if (!adminToken) {
      setCityOptions([]);
      setSubDistrictOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [{ cities }, { subDistricts }] = await Promise.all([
          adminListCities(adminToken, { all: true, status: "active", limit: 500 }),
          adminListSubDistricts(adminToken, { all: true, status: "active", limit: 500 }),
        ]);
        if (!cancelled) {
          setCityOptions(cities ?? []);
          setSubDistrictOptions(subDistricts ?? []);
        }
      } catch (error) {
        if (error?.status === 401) dispatch(logout());
        if (!cancelled) {
          setCityOptions([]);
          setSubDistrictOptions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch]);

  useEffect(() => {
    if (!initialVenue || (!cityOptions.length && !subDistrictOptions.length)) return;
    const subName = String(initialVenue.state || "").trim();
    const cityName = String(initialVenue.city || "").trim();
    if (!subName && !cityName) return;

    let matchedSubDistrictId = "";
    let matchedCityId = "";

    if (subName) {
      const row = subDistrictOptions.find((s) => {
        if (String(s.name || "").toLowerCase() !== subName.toLowerCase()) return false;
        if (!cityName) return true;
        return String(s.city?.name || "").toLowerCase() === cityName.toLowerCase();
      });
      if (row) {
        matchedSubDistrictId = String(row._id);
        matchedCityId = row.city?._id ? String(row.city._id) : "";
      }
    }
    if (!matchedCityId && cityName) {
      const city = cityOptions.find((c) => String(c.name || "").toLowerCase() === cityName.toLowerCase());
      if (city) matchedCityId = String(city._id);
    }

    setValues((prev) => {
      if (prev.subDistrictId === matchedSubDistrictId && prev.cityId === matchedCityId) return prev;
      return { ...prev, subDistrictId: matchedSubDistrictId, cityId: matchedCityId };
    });
  }, [initialVenue, cityOptions, subDistrictOptions]);

  const filteredSubDistrictOptions = values.cityId
    ? subDistrictOptions.filter((row) => String(row.city?._id || row.city || "") === values.cityId)
    : subDistrictOptions;

  useEffect(() => {
    if (!adminToken) return;
    if (!values.category) {
      setSubCategories([]);
      return;
    }
    (async () => {
      try {
        const { subCategories: rows } = await adminListSubCategories(adminToken, {
          limit: 200,
          mode: "venue",
          status: "active",
          category: values.category,
        });
        setSubCategories(rows);
      } catch (error) {
        if (error?.status === 401) dispatch(logout());
      }
    })();
  }, [adminToken, dispatch, values.category]);

  useEffect(() => {
    if (!adminToken) return;
    (async () => {
      try {
        const { amenities: rows } = await adminListAmenities(adminToken, { limit: 200, status: "active" });
        setAmenities(Array.isArray(rows) ? rows : []);
      } catch (error) {
        if (error?.status === 401) dispatch(logout());
      }
    })();
  }, [adminToken, dispatch]);

  const selectedSubCategoryValid = useMemo(
    () => subCategories.some((sc) => String(sc._id) === String(values.subCategory)),
    [subCategories, values.subCategory]
  );
  const amenityOptions = useMemo(
    () => amenities.map((item) => ({ value: String(item._id), label: item.name || "Unnamed facility" })),
    [amenities]
  );
  const selectedAmenityOptions = useMemo(
    () => amenityOptions.filter((option) => values.amenities.includes(option.value)),
    [amenityOptions, values.amenities]
  );

  useEffect(() => {
    if (!values.subCategory) return;
    if (!selectedSubCategoryValid) {
      setValues((prev) => ({ ...prev, subCategory: "" }));
    }
  }, [selectedSubCategoryValid, values.subCategory]);

  const handleChange = (field) => (e) => {
    const next = e.target.value;
    setValues((prev) => {
      const draft = { ...prev, [field]: next };
      if (field === "category") {
        draft.subCategory = "";
      }
      return draft;
    });
  };

  const handleCityChange = (e) => {
    const cityId = e.target.value;
    setValues((prev) => {
      const next = { ...prev, cityId };
      if (cityId && prev.subDistrictId) {
        const sd = subDistrictOptions.find((s) => String(s._id) === prev.subDistrictId);
        const sdCityId = String(sd?.city?._id || sd?.city || "");
        if (sdCityId && sdCityId !== cityId) {
          next.subDistrictId = "";
        }
      }
      return next;
    });
  };

  const handleSubDistrictChange = (e) => {
    const subDistrictId = e.target.value;
    setValues((prev) => {
      const next = { ...prev, subDistrictId };
      if (subDistrictId) {
        const sd = subDistrictOptions.find((s) => String(s._id) === subDistrictId);
        const parentCityId = sd?.city?._id ? String(sd.city._id) : "";
        if (parentCityId) next.cityId = parentCityId;
      }
      return next;
    });
  };

  const handleAmenitiesChange = (selectedOptions) => {
    const selected = Array.isArray(selectedOptions) ? selectedOptions.map((option) => option.value).filter(Boolean) : [];
    setValues((prev) => ({ ...prev, amenities: selected }));
  };

  const handleThumbnail = (e) => {
    const file = e.target.files?.[0] || null;
    if (thumbnailPreview && thumbnailPreview.startsWith("blob:")) {
      URL.revokeObjectURL(thumbnailPreview);
    }
    setThumbnailFile(file);
    if (file) {
      const preview = URL.createObjectURL(file);
      setThumbnailPreview(preview);
    } else if (initialVenue?.thumbnail) {
      setThumbnailPreview(mediaUrl(initialVenue.thumbnail));
    } else {
      setThumbnailPreview("");
    }
  };

  const handleGallery = (e) => {
    galleryPreview.forEach((src) => {
      if (typeof src === "string" && src.startsWith("blob:")) {
        URL.revokeObjectURL(src);
      }
    });
    const files = Array.from(e.target.files || []);
    setGalleryFiles(files);
    if (files.length > 0) {
      setGalleryPreview(files.map((file) => URL.createObjectURL(file)));
    } else if (Array.isArray(initialVenue?.images)) {
      setGalleryPreview(initialVenue.images.map((img) => mediaUrl(img)));
    } else {
      setGalleryPreview([]);
    }
  };

  const removeGalleryImage = (index) => {
    setGalleryFiles((prev) => prev.filter((_, idx) => idx !== index));
    setGalleryPreview((prev) => {
      const target = prev[index];
      if (typeof target === "string" && target.startsWith("blob:")) {
        URL.revokeObjectURL(target);
      }
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (step === 1) {
      if (!reportStepValidity(step1Ref.current)) return;
      const stepMessage = validateStep1(values);
      if (stepMessage) {
        await Swal.fire({ icon: "error", title: "Validation error", text: stepMessage });
        return;
      }
      setStep(2);
      return;
    }

    if (!reportStepValidity(step2Ref.current)) return;
    if (!adminToken || !adminId) return;

    const message = validate(values, mode, initialVenue, thumbnailFile);
    if (message) {
      await Swal.fire({ icon: "error", title: "Validation error", text: message });
      if (validateStep1(values)) setStep(1);
      return;
    }

    const selectedSubDistrict = subDistrictOptions.find((row) => String(row._id) === values.subDistrictId);
    const selectedCity = cityOptions.find((row) => String(row._id) === values.cityId);

    const payload = {
      name: values.name.trim(),
      description: values.description.trim(),
      category: values.category,
      ...(values.subCategory
        ? { subCategory: values.subCategory }
        : mode === "edit"
          ? { subCategory: "" }
          : {}),
      address: values.address.trim(),
      city: selectedCity?.name || selectedSubDistrict?.city?.name || "",
      state: selectedSubDistrict?.name || "",
      pincode: "",
      dayPrice: values.dayPrice === "" ? 0 : values.dayPrice,
      tokenAmountPercentage: values.tokenAmountPercentage,
      amenities: values.amenities,
      status: values.status,
      addedById: adminId,
    };

    setSubmitting(true);
    try {
      const venue =
        mode === "create"
          ? await adminCreateVenue(adminToken, payload, { thumbnail: thumbnailFile, images: galleryFiles })
          : await adminUpdateVenue(adminToken, venueId, payload, { thumbnail: thumbnailFile, images: galleryFiles });

      onSuccess?.(venue);
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Save failed", text: error.message || "Could not save service." });
    } finally {
      setSubmitting(false);
    }
  };

  const id = (name) => `${formId}-${name}`;

  return (
    <form onSubmit={onSubmit}>
      <VenueWizardHeader step={step} />

      <div ref={step1Ref} hidden={step !== 1} className="row g-3">
        <FormSectionTitle>Basic information</FormSectionTitle>

        <div className="col-12">
          <label htmlFor={id("name")} className="form-label">
            Name <span className="text-danger">*</span>
          </label>
          <input
            id={id("name")}
            className="form-control"
            value={values.name}
            onChange={handleChange("name")}
            placeholder="Enter service name"
            maxLength={LIMITS.name}
            required={step === 1}
          />
          <div className="form-text">{values.name.trim().length}/{LIMITS.name} characters</div>
        </div>

        <div className="col-12">
          <label htmlFor={id("description")} className="form-label">
            Description
          </label>
          <textarea
            id={id("description")}
            className="form-control"
            value={values.description}
            onChange={handleChange("description")}
            rows={4}
            maxLength={LIMITS.description}
            placeholder="Describe the service, facilities, and atmosphere"
          />
          <div className="form-text">{values.description.trim().length}/{LIMITS.description} characters</div>
        </div>

        <div className="col-12 col-md-6">
          <label htmlFor={id("category")} className="form-label">
            Category <span className="text-danger">*</span>
          </label>
          <select
            id={id("category")}
            className="form-select"
            value={values.category}
            onChange={handleChange("category")}
            required={step === 1}
          >
            <option value="">Select category</option>
            {categories.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="col-12 col-md-6">
          <label htmlFor={id("subCategory")} className="form-label">
            Sub-category
          </label>
          <select
            id={id("subCategory")}
            className="form-select"
            value={values.subCategory}
            onChange={handleChange("subCategory")}
            disabled={!values.category}
          >
            <option value="">Select sub-category</option>
            {subCategories.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="form-text">Optional. Leave blank if none apply to this category.</div>
        </div>

        <div className="col-12 col-md-6">
          <label htmlFor={id("dayPrice")} className="form-label">
            Day price
          </label>
          <input
            id={id("dayPrice")}
            className="form-control"
            type="number"
            min="0"
            value={values.dayPrice}
            onChange={handleChange("dayPrice")}
            placeholder="e.g. 25000"
          />
        </div>

        <div className="col-12 col-md-6">
          <label htmlFor={id("city")} className="form-label">
            City
          </label>
          <select id={id("city")} className="form-select" value={values.cityId} onChange={handleCityChange}>
            <option value="">Select city</option>
            {cityOptions.map((city) => (
              <option key={city._id} value={city._id}>
                {city.name}
                {city.state?.name ? `, ${city.state.name}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="col-12 col-md-6">
          <label htmlFor={id("subDistrict")} className="form-label">
            Sub-district <span className="text-danger">*</span>
          </label>
          <select
            id={id("subDistrict")}
            className="form-select"
            value={values.subDistrictId}
            onChange={handleSubDistrictChange}
            required={step === 1}
          >
            <option value="">Select sub-district</option>
            {filteredSubDistrictOptions.map((row) => (
              <option key={row._id} value={row._id}>
                {row.name}
                {row.city?.name ? ` · ${row.city.name}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div ref={step2Ref} hidden={step !== 2} className="row g-3">
        <FormSectionTitle>Location &amp; pricing</FormSectionTitle>

        <div className="col-12">
          <label htmlFor={id("address")} className="form-label">
            Address <span className="text-danger">*</span>
          </label>
          <input
            id={id("address")}
            className="form-control"
            value={values.address}
            onChange={handleChange("address")}
            maxLength={LIMITS.address}
            required={step === 2}
            placeholder="Street, area, landmark"
          />
          <div className="form-text">{values.address.trim().length}/{LIMITS.address} characters</div>
        </div>

        <div className="col-12 col-sm-6">
          <label htmlFor={id("tokenAmountPercentage")} className="form-label">
            Token amount (%) <span className="text-danger">*</span>
          </label>
          <input
            id={id("tokenAmountPercentage")}
            className="form-control"
            type="number"
            min="1"
            max="99"
            step="1"
            required={step === 2}
            value={values.tokenAmountPercentage}
            onChange={handleChange("tokenAmountPercentage")}
            placeholder="e.g. 20"
          />
          <div className="form-text">Advance due at booking. 20% of ₹1,00,000 = ₹20,000 token (pay rest later).</div>
        </div>

        <div className="col-12 col-md-4">
          <label htmlFor={id("status")} className="form-label">
            Status
          </label>
          <select id={id("status")} className="form-select" value={values.status} onChange={handleChange("status")}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="col-12">
          <label className="form-label" htmlFor={id("amenities-input")}>
            Facilities <span className="text-danger">*</span>
          </label>
          <Select
            inputId={id("amenities-input")}
            isMulti
            closeMenuOnSelect={false}
            classNamePrefix="react-select"
            styles={multiSelectStyles}
            options={amenityOptions}
            value={selectedAmenityOptions}
            onChange={handleAmenitiesChange}
            placeholder="Select one or more facilities…"
          />
          <div className="form-text">Choose all facilities that apply to this service.</div>
        </div>

        <FormSectionTitle>Media</FormSectionTitle>

        <div className="col-12 col-lg-6">
          <label htmlFor={id("thumbnail")} className="form-label">
            Thumbnail <span className="text-danger">*</span>
          </label>
          <input
            id={id("thumbnail")}
            type="file"
            accept="image/*"
            className="form-control"
            onChange={handleThumbnail}
            required={step === 2 && mode === "create" && !initialVenue?.thumbnail}
          />
          <div className="form-text">One cover image shown in service listings.</div>
          {thumbnailPreview ? (
            <div className="mt-2">
              <img src={thumbnailPreview} alt="Thumbnail preview" className="img-thumbnail rounded" style={{ maxHeight: 200, objectFit: "cover" }} />
            </div>
          ) : null}
        </div>

        <div className="col-12 col-lg-6">
          <label htmlFor={id("gallery")} className="form-label">
            Gallery images
          </label>
          <input id={id("gallery")} type="file" accept="image/*" multiple className="form-control" onChange={handleGallery} />
          <div className="form-text">Optional additional photos for the service detail page.</div>
          {galleryPreview.length ? (
            <div className="row row-cols-2 row-cols-sm-3 g-2 mt-2">
              {galleryPreview.map((src, idx) => (
                <div key={`${src}-${idx}`} className="col">
                  <div className="position-relative border rounded overflow-hidden bg-light">
                    <img src={src} alt="" className="w-100 d-block" style={{ height: 100, objectFit: "cover" }} />
                    <button
                      type="button"
                      className="btn btn-sm btn-danger position-absolute top-0 end-0 m-1 rounded-circle p-0"
                      style={{ width: "1.75rem", height: "1.75rem", lineHeight: 1 }}
                      onClick={() => removeGalleryImage(idx)}
                      aria-label="Remove image"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 justify-content-end pt-4 mt-3 border-top">
        {step === 2 ? (
          <button type="button" className="btn btn--ghost me-auto" onClick={() => setStep(1)} disabled={submitting}>
            Back
          </button>
        ) : null}
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
              Saving…
            </>
          ) : step === 1 ? (
            "Next"
          ) : mode === "create" ? (
            "Create service"
          ) : (
            "Save changes"
          )}
        </button>
      </div>
    </form>
  );
}

export function VenueAdd() {
  const navigate = useNavigate();
  return (
    <div className="user-page vendor-editor-page">
      <div className="user-page__toolbar d-flex flex-wrap align-items-center gap-3">
        <button type="button" className="user-back-btn btn btn-light border" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div className="flex-grow-1">
          <p className="vendor-editor-page__eyebrow text-secondary small text-uppercase mb-1">Add service</p>
          <h2 className="user-page__title h4 mb-0">Add new service</h2>
        </div>
      </div>
      <div className="user-page__card vendor-editor-page__card card shadow-sm border-0">
        <div className="card-body p-3 p-md-4">
        <VenueForm
          mode="create"
          onCancel={() => navigate("/admin/venues")}
          onSuccess={async () => {
            await Swal.fire({ icon: "success", title: "Service created", timer: 1500 });
            navigate("/admin/venues");
          }}
        />
        </div>
      </div>
    </div>
  );
}
