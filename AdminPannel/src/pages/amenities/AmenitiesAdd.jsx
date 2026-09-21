import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import { adminCreateAmenity, adminUpdateAmenity } from "../../api/adminAmenities.js";
import { mediaUrl } from "../../media.js";
import { logout } from "../../store/authSlice.js";

function emptyForm() {
  return {
    name: "",
    description: "",
    status: "active",
  };
}

function amenityToFormValues(amenity) {
  if (!amenity) return emptyForm();
  return {
    ...emptyForm(),
    ...amenity,
  };
}

function validate(values) {
  if (!values.name.trim()) return "Amenity name is required.";
  return "";
}

export function AmenitiesForm({ mode = "create", amenityId = "", initialAmenity = null, onCancel, onSuccess }) {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);

  const [values, setValues] = useState(() => amenityToFormValues(initialAmenity));
  const [iconFile, setIconFile] = useState(null);
  const [iconPreview, setIconPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setValues(amenityToFormValues(initialAmenity));
    setIconFile(null);
    setIconPreview(mediaUrl(initialAmenity?.icon));
  }, [initialAmenity]);

  const handleChange = (field) => (e) => {
    const next = e.target.value;
    setValues((prev) => ({ ...prev, [field]: next }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!adminToken) return;

    const message = validate(values);
    if (message) {
      await Swal.fire({ icon: "error", title: "Validation error", text: message });
      return;
    }

    const payload = {
      name: values.name.trim(),
      description: values.description.trim(),
      status: values.status,
    };

    let requestPayload = payload;
    if (iconFile instanceof File) {
      const fd = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        fd.append(key, String(value));
      });
      fd.append("file", iconFile);
      requestPayload = fd;
    }

    setSubmitting(true);
    try {
      const amenity =
        mode === "create"
          ? await adminCreateAmenity(adminToken, requestPayload)
          : await adminUpdateAmenity(adminToken, amenityId, requestPayload);

      onSuccess?.(amenity);
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Save failed", text: error.message || "Could not save amenity." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="user-form" onSubmit={onSubmit}>
      <div className="user-form__grid">
        <label className="user-field">
          <span className="user-field__label">Name</span>
          <input value={values.name} onChange={handleChange("name")} required />
        </label>
        <label className="user-field">
          <span className="user-field__label">Icon File (optional)</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setIconFile(file);
              if (file) {
                setIconPreview(URL.createObjectURL(file));
              }
            }}
          />
          {iconPreview ? (
            <img src={iconPreview} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, marginTop: 8 }} />
          ) : null}
        </label>
        <label className="user-field">
          <span className="user-field__label">Status</span>
          <select value={values.status} onChange={handleChange("status")}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="user-field ">
          <span className="user-field__label">Description</span>
          <textarea className="user-field__input" value={values.description} onChange={handleChange("description")} rows={6} />
        </label>
      </div>
      <div className="user-form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? "Saving..." : mode === "create" ? "Create Amenity" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

export function AmenitiesAdd() {
  const navigate = useNavigate();
  return (
    <div className="user-page vendor-editor-page">
      <div className="user-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div>
          <p className="vendor-editor-page__eyebrow">Add Amenity</p>
          <h2 className="user-page__title">Add New Amenity</h2>
        </div>
      </div>
      <div className="user-page__card vendor-editor-page__card">
        <AmenitiesForm
          mode="create"
          onCancel={() => navigate("/admin/amenities")}
          onSuccess={async () => {
            await Swal.fire({ icon: "success", title: "Amenity created", timer: 1500 });
            navigate("/admin/amenities");
          }}
        />
      </div>
    </div>
  );
}
