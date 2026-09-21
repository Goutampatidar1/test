import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import Swal from "sweetalert2";
import {
  vendorCreateVideoFeed,
  vendorDeleteVideoFeed,
  vendorListVideoFeeds,
  vendorUpdateVideoFeed,
} from "../../api/vendorVideoFeeds.js";
import {
  vendorEcomCreateProductVideoFeed,
  vendorEcomDeleteProductVideoFeed,
  vendorEcomListProductVideoFeeds,
  vendorEcomUpdateProductVideoFeed,
} from "../../api/vendorEcomProductVideoFeeds.js";
import { vendorEcomListProducts } from "../../api/vendorEcom.js";
import { vendorListVenues } from "../../api/vendorVenues.js";
import { mediaOpenUrl } from "../../media.js";
import { AppImage } from "../../components/AppImage.jsx";
import { DashboardSegmentToggle } from "../../components/DashboardSegmentToggle.jsx";
import { selectPanelMode } from "../../store/authSlice.js";
import { assertVideoMaxDuration, VIDEO_MAX_DURATION_SECONDS } from "../../utils/videoDuration.js";

const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

function emptyForm(kind = "service") {
  return kind === "shop"
    ? { title: "", productId: "", status: "active" }
    : { title: "", venueId: "", status: "active" };
}

function RequiredDot() {
  return <span className="required-dot"> *</span>;
}

function ReelFileSlot({
  label,
  hint,
  accept,
  file,
  previewUrl,
  required = false,
  isVideo = false,
  onFile,
  inputId,
}) {
  return (
    <div className="vendor-reels-upload">
      <span className="vendor-reels-upload__label">
        {label}
        {required ? <RequiredDot /> : null}
      </span>
      <label className={`vendor-reels-upload__box${file || previewUrl ? " has-file" : ""}`} htmlFor={inputId}>
        <input
          id={inputId}
          type="file"
          accept={accept}
          className="vendor-reels-upload__input"
          onChange={(e) => {
            onFile(e.target.files?.[0] || null);
            e.target.value = "";
          }}
        />
        {isVideo && previewUrl ? (
          <video src={previewUrl} className="vendor-reels-upload__media" muted playsInline />
        ) : null}
        {!isVideo && previewUrl ? (
          <img src={previewUrl} alt="" className="vendor-reels-upload__media" />
        ) : null}
        {!previewUrl ? (
          <span className="vendor-reels-upload__placeholder">
            <span className="vendor-reels-upload__cta">{isVideo ? "Choose video" : "Choose image"}</span>
            <span className="vendor-reels-upload__hint">{hint}</span>
          </span>
        ) : (
          <span className="vendor-reels-upload__replace">Click to replace</span>
        )}
      </label>
      {file ? <span className="vendor-reels-upload__name">{file.name}</span> : null}
      {file ? (
        <button type="button" className="vendor-reels-upload__clear" onClick={() => onFile(null)}>
          Remove
        </button>
      ) : null}
    </div>
  );
}

export function VideoFeedsPage() {
  const panelMode = useSelector(selectPanelMode);
  const serviceToken = useSelector((s) => s.auth.accounts?.service?.token || s.auth.token);
  const ecomToken = useSelector((s) => s.auth.accounts?.ecom?.token);

  const fixedKind = panelMode === "ecom" ? "shop" : panelMode === "service" ? "service" : null;
  const [reelKind, setReelKind] = useState(fixedKind || "service");
  const activeKind = fixedKind || reelKind;
  const isService = activeKind === "service";
  const showKindToggle = panelMode === "both";

  const videoInputId = useId();
  const thumbInputId = useId();
  const [rows, setRows] = useState([]);
  const [venues, setVenues] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm(activeKind));
  const [editId, setEditId] = useState("");
  const [editKind, setEditKind] = useState("");
  const [videoFile, setVideoFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState("");
  const [thumbPreview, setThumbPreview] = useState("");

  const authToken = isService ? serviceToken : ecomToken;

  const pageCopy = useMemo(() => {
    if (isService) {
      return {
        subtitle: "Upload service videos for the user app. Linking a service is optional.",
        linkLabel: "Service (optional)",
        linkEmpty: "No service linked",
        linkPlaceholder: "No service linked",
        browseLabel: "services",
      };
    }
    return {
      subtitle: "Upload product videos for the user app. Linking a product is optional.",
      linkLabel: "Product (optional)",
      linkEmpty: "No product linked",
      linkPlaceholder: "No product linked",
      browseLabel: "products",
    };
  }, [isService]);

  const resetForm = useCallback(() => {
    setForm(emptyForm(activeKind));
    setEditId("");
    setEditKind("");
    setVideoFile(null);
    setThumbnailFile(null);
  }, [activeKind]);

  const loadRows = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      if (isService) {
        const [{ feeds }, venueRes] = await Promise.all([
          vendorListVideoFeeds({ page: 1, limit: 100 }),
          vendorListVenues({ page: 1, limit: 200 }),
        ]);
        setRows(feeds || []);
        setVenues(venueRes?.venues || []);
        setProducts([]);
      } else {
        const [{ feeds }, productRes] = await Promise.all([
          vendorEcomListProductVideoFeeds({ page: 1, limit: 100 }),
          vendorEcomListProducts({ page: 1, limit: 200, status: "active" }),
        ]);
        setRows(feeds || []);
        setProducts(productRes?.items || []);
        setVenues([]);
      }
    } catch (e) {
      await Swal.fire({
        icon: "error",
        title: "Load failed",
        text: e.message || "Failed to load reels.",
        confirmButtonColor: "#141414",
      });
    } finally {
      setLoading(false);
    }
  }, [authToken, isService]);

  useEffect(() => {
    resetForm();
  }, [activeKind, resetForm]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (!(videoFile instanceof File)) {
      setVideoPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(videoFile);
    setVideoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  useEffect(() => {
    if (!(thumbnailFile instanceof File)) {
      setThumbPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(thumbnailFile);
    setThumbPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnailFile]);

  const onEdit = (row) => {
    const rowKind = row.kind || activeKind;
    setEditId(row._id);
    setEditKind(rowKind);
    if (rowKind === "shop") {
      setForm({
        title: (row.title || "").slice(0, 32),
        productId: row.product?._id || "",
        status: row.status || "active",
      });
    } else {
      setForm({
        title: (row.title || "").slice(0, 32),
        venueId: row.venue?._id || "",
        status: row.status || "active",
      });
    }
    setVideoFile(null);
    setThumbnailFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleVideoFile = async (file) => {
    if (!file) {
      setVideoFile(null);
      return;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      Swal.fire({
        icon: "error",
        title: "Video too large",
        text: "Max video size is 50 MB.",
        confirmButtonColor: "#141414",
      });
      return;
    }
    try {
      await assertVideoMaxDuration(file);
      setVideoFile(file);
    } catch (err) {
      setVideoFile(null);
      Swal.fire({
        icon: "error",
        title: "Video too long",
        text:
          err?.code === "VIDEO_TOO_LONG"
            ? `Max video length is ${VIDEO_MAX_DURATION_SECONDS} seconds (1 minute).`
            : err.message || "Could not read this video. Please try another file.",
        confirmButtonColor: "#141414",
      });
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const saveKind = editId ? editKind || activeKind : activeKind;
    const savingService = saveKind === "service";

    if (!editId && !(videoFile instanceof File)) {
      await Swal.fire({
        icon: "error",
        title: "Video required",
        text: "Please choose a video file.",
        confirmButtonColor: "#141414",
      });
      return;
    }
    if (videoFile instanceof File) {
      try {
        await assertVideoMaxDuration(videoFile);
      } catch (err) {
        await Swal.fire({
          icon: "error",
          title: "Video too long",
          text:
            err?.code === "VIDEO_TOO_LONG"
              ? `Max video length is ${VIDEO_MAX_DURATION_SECONDS} seconds (1 minute).`
              : err.message || "Could not read this video. Please try another file.",
          confirmButtonColor: "#141414",
        });
        return;
      }
    }

    setSaving(true);
    try {
      const files = { video: videoFile, thumbnail: thumbnailFile };
      if (savingService) {
        const fields = {
          title: form.title.trim().slice(0, 32),
          venueId: form.venueId || "",
          status: form.status,
        };
        if (editId) {
          await vendorUpdateVideoFeed(editId, fields, files);
        } else {
          await vendorCreateVideoFeed(fields, files);
        }
      } else {
        const fields = {
          title: form.title.trim().slice(0, 32),
          productId: form.productId || "",
          status: form.status,
        };
        if (editId) {
          await vendorEcomUpdateProductVideoFeed(editId, fields, files);
        } else {
          await vendorEcomCreateProductVideoFeed(fields, files);
        }
      }

      await Swal.fire({
        icon: "success",
        title: editId ? "Reel updated" : "Reel added",
        timer: 1400,
        showConfirmButton: false,
      });
      resetForm();
      await loadRows();
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Save failed",
        text: err.message || "Could not save reel.",
        confirmButtonColor: "#141414",
      });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (row) => {
    const rowKind = row.kind || activeKind;
    const confirm = await Swal.fire({
      icon: "warning",
      title: "Delete reel?",
      text: row.title || "This video will be removed from the user feed.",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
    });
    if (!confirm.isConfirmed) return;
    try {
      if (rowKind === "shop") {
        await vendorEcomDeleteProductVideoFeed(row._id);
      } else {
        await vendorDeleteVideoFeed(row._id);
      }
      if (editId === row._id) resetForm();
      await loadRows();
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Delete failed",
        text: err.message || "Could not delete reel.",
        confirmButtonColor: "#141414",
      });
    }
  };

  const linkedName = (row) => {
    if (row.kind === "shop" || (!row.venue && row.product)) {
      return row.product?.name || pageCopy.linkEmpty;
    }
    return row.venue?.name || pageCopy.linkEmpty;
  };

  const linkedThumb = (row) => {
    if (row.kind === "shop" || (!row.venue && row.product)) {
      return row.thumbnail || row.product?.thumbnail;
    }
    return row.thumbnail || row.venue?.thumbnail;
  };

  const formKind = editId ? editKind || activeKind : activeKind;
  const formIsService = formKind === "service";

  return (
    <div className="vendor-venues-page vendor-reels-page">
      <header className="vendor-venues-page__head">
        <div>
          <h1 className="vendor-venues-page__title">Reels</h1>
          <p className="vendor-venues-page__subtitle">{pageCopy.subtitle}</p>
        </div>
        {showKindToggle ? (
          <DashboardSegmentToggle
            value={activeKind}
            onChange={setReelKind}
            ariaLabel="Switch between service reels and product reels"
          />
        ) : null}
      </header>

      {!authToken ? (
        <p className="vendor-venues-empty vendor-venues-empty--error">
          {isService ? "Service account is not available." : "Shop account is not available."}
        </p>
      ) : null}

      <section className="vendor-dash-panel vendor-reels-panel">
        <h2 className="vendor-dash-panel__title">
          {editId ? "Edit reel" : isService ? "Add service reel" : "Add product reel"}
        </h2>
        <form className="vendor-reels-form" onSubmit={onSubmit}>
          <div className="vendor-reels-fields">
            <label className="vendor-plans__label">
              Title
              <input
                className="form-control"
                value={form.title}
                maxLength={32}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value.slice(0, 32) }))}
                placeholder="Optional reel title"
              />
            </label>

            {formIsService ? (
              <label className="vendor-plans__label">
                {pageCopy.linkLabel}
                <select
                  className="form-select"
                  value={form.venueId}
                  onChange={(e) => setForm((prev) => ({ ...prev, venueId: e.target.value }))}
                >
                  <option value="">{pageCopy.linkPlaceholder}</option>
                  {venues.map((venue) => (
                    <option key={venue._id} value={venue._id}>
                      {venue.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="vendor-plans__label">
                {pageCopy.linkLabel}
                <select
                  className="form-select"
                  value={form.productId}
                  onChange={(e) => setForm((prev) => ({ ...prev, productId: e.target.value }))}
                >
                  <option value="">{pageCopy.linkPlaceholder}</option>
                  {products.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="vendor-plans__label">
              Status
              <select
                className="form-select"
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="vendor-reels-media-row">
            <ReelFileSlot
              label="Video"
              hint={`MP4 / WebM / MOV · max 50 MB · max ${VIDEO_MAX_DURATION_SECONDS}s`}
              accept="video/*"
              file={videoFile}
              previewUrl={videoPreview}
              required={!editId}
              isVideo
              onFile={handleVideoFile}
              inputId={videoInputId}
            />
            <ReelFileSlot
              label="Thumbnail (optional)"
              hint="JPG / PNG · shown as cover"
              accept="image/*"
              file={thumbnailFile}
              previewUrl={thumbPreview}
              onFile={setThumbnailFile}
              inputId={thumbInputId}
            />
          </div>

          <div className="vendor-reels-actions">
            <button type="submit" className="vendor-venues-add-btn" disabled={saving || !authToken}>
              {saving ? "Saving..." : editId ? "Update reel" : "Add reel"}
            </button>
            {editId ? (
              <button type="button" className="vendor-venues-filter-btn" onClick={resetForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="vendor-dash-panel vendor-reels-panel">
        <div className="vendor-reels-list-head">
          <h2 className="vendor-dash-panel__title">
            Your {isService ? "service" : "product"} reels
          </h2>
          {!loading && rows.length > 0 ? (
            <span className="vendor-reels-count">
              {rows.length} reel{rows.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {loading ? <p className="vendor-venues-empty">Loading your reels…</p> : null}

        {!loading && rows.length === 0 ? (
          <p className="vendor-venues-empty">
            No {isService ? "service" : "product"} reels uploaded yet. Add your first reel above.
          </p>
        ) : null}

        {!loading && rows.length > 0 ? (
          <div className="vendor-venues-grid">
            {rows.map((row) => (
              <article key={row._id} className="vendor-venue-card">
                <div className="vendor-venue-card__top">
                  <AppImage src={linkedThumb(row)} alt="" className="vendor-venue-card__img" />
                  <div className="vendor-venue-card__main">
                    <div className="vendor-venue-card__head">
                      <h3 className="vendor-venue-card__name">{row.title || "Untitled reel"}</h3>
                    </div>
                    <p className="vendor-venue-card__category">{linkedName(row)}</p>
                    <div className="vendor-venue-card__badges">
                      <span
                        className={`vendor-venue-status vendor-venue-status--${
                          row.status === "active" ? "available" : "inactive"
                        }`}
                      >
                        {row.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </div>
                    {row.video ? (
                      <a
                        href={mediaOpenUrl(row.video)}
                        target="_blank"
                        rel="noreferrer"
                        className="vendor-venue-card__bookings"
                      >
                        Open video
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="vendor-venue-card__actions">
                  <button
                    type="button"
                    className="vendor-venue-btn vendor-venue-btn--edit"
                    onClick={() => onEdit({ ...row, kind: activeKind })}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="vendor-venue-btn vendor-venue-btn--delete"
                    onClick={() => onDelete({ ...row, kind: activeKind })}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
