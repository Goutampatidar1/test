import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { AiFillDelete } from "react-icons/ai";
import { MdEditSquare } from "react-icons/md";
import {
  adminCreateVideoFeed,
  adminDeleteVideoFeed,
  adminListVideoFeeds,
  adminUpdateVideoFeed,
} from "../../api/adminVideoFeeds.js";
import { adminListProducts } from "../../api/adminProducts.js";
import { adminListVenues } from "../../api/adminVenues.js";
import { adminListVendors } from "../../api/adminVendors.js";
import { adminListVenueVendors } from "../../api/adminVenueVendors.js";
import { logout } from "../../store/authSlice.js";
import { mediaDocumentUrl, mediaUrl } from "../../media.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { assertVideoMaxDuration, VIDEO_MAX_DURATION_SECONDS } from "../../utils/videoDuration.js";

const LIST_LIMIT = 10;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

function emptyForm() {
  return {
    type: "ecom",
    title: "",
    productId: "",
    vendorId: "",
    venueId: "",
    venueVendorId: "",
    status: "active",
  };
}

function ownerId(value) {
  if (!value) return "";
  if (typeof value === "object") return String(value._id || value.id || "");
  return String(value);
}

export function VideoFeedPage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState("");
  const [videoFile, setVideoFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);

  const [products, setProducts] = useState([]);
  const [venues, setVenues] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [venueVendors, setVenueVendors] = useState([]);

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const { videoFeeds, pagination } = await adminListVideoFeeds(adminToken, {
        page,
        limit: LIST_LIMIT,
        type: filterType,
      });
      setRows(videoFeeds);
      setPages(pagination?.pages || 1);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: e.message || "Failed to load reels." });
    } finally {
      setLoading(false);
    }
  }, [adminToken, dispatch, filterType, page]);

  const loadOwners = useCallback(async () => {
    if (!adminToken) return;
    try {
      const [vendorRes, venueVendorRes] = await Promise.all([
        adminListVendors(adminToken, { page: 1, limit: 200, approvalStatus: "approved" }),
        adminListVenueVendors(adminToken, { page: 1, limit: 200, approvalStatus: "approved" }),
      ]);
      setVendors(vendorRes?.vendors || []);
      setVenueVendors(venueVendorRes?.venueVendors || []);
    } catch (e) {
      if (e?.status === 401) dispatch(logout());
    }
  }, [adminToken, dispatch]);

  const loadOwnedItems = useCallback(async () => {
    if (!adminToken) return;

    if (form.type === "ecom") {
      if (!form.vendorId) {
        setProducts([]);
        return;
      }
      setOptionsLoading(true);
      try {
        const productRes = await adminListProducts(adminToken, {
          page: 1,
          limit: 200,
          status: "active",
          role: "Vendor",
          addedById: form.vendorId,
        });
        setProducts(productRes?.products || []);
      } catch (e) {
        if (e?.status === 401) return dispatch(logout());
        setProducts([]);
      } finally {
        setOptionsLoading(false);
      }
      return;
    }

    if (!form.venueVendorId) {
      setVenues([]);
      return;
    }
    setOptionsLoading(true);
    try {
      const venueRes = await adminListVenues(adminToken, {
        page: 1,
        limit: 200,
        status: "active",
        role: "VenueVendor",
        addedById: form.venueVendorId,
      });
      setVenues(venueRes?.venues || []);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      setVenues([]);
    } finally {
      setOptionsLoading(false);
    }
  }, [adminToken, dispatch, form.type, form.vendorId, form.venueVendorId]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    loadOwners();
  }, [loadOwners]);

  useEffect(() => {
    loadOwnedItems();
  }, [loadOwnedItems]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditId("");
    setVideoFile(null);
    setThumbnailFile(null);
    setProducts([]);
    setVenues([]);
  };

  const onEdit = (row) => {
    setEditId(row._id);
    const type = row.type === "venue" ? "venue" : "ecom";
    setForm({
      type,
      title: type === "venue" ? (row.title || "").slice(0, 32) : "",
      productId: row.product?._id || "",
      vendorId: ownerId(row.vendor) || ownerId(row.product?.addedById),
      venueId: row.venue?._id || "",
      venueVendorId: ownerId(row.venueVendor) || ownerId(row.venue?.addedById),
      status: row.status || "active",
    });
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
      await Swal.fire({ icon: "error", title: "Video too large", text: "Max video size is 50 MB." });
      return;
    }
    try {
      await assertVideoMaxDuration(file);
      setVideoFile(file);
    } catch (err) {
      setVideoFile(null);
      await Swal.fire({
        icon: "error",
        title: "Video too long",
        text:
          err?.code === "VIDEO_TOO_LONG"
            ? `Max video length is ${VIDEO_MAX_DURATION_SECONDS} seconds (1 minute).`
            : err.message || "Could not read this video. Please try another file.",
      });
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!adminToken) return;

    if (!editId && !(videoFile instanceof File)) {
      await Swal.fire({ icon: "error", title: "Video required", text: "Please choose a video file." });
      return;
    }
    if (videoFile instanceof File && videoFile.size > VIDEO_MAX_BYTES) {
      await Swal.fire({ icon: "error", title: "Video too large", text: "Max video size is 50 MB." });
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
        });
        return;
      }
    }
    if (form.type === "ecom" && !form.vendorId) {
      await Swal.fire({
        icon: "error",
        title: "Vendor required",
        text: "Select an ecom vendor for this reel.",
      });
      return;
    }
    if (form.type === "venue" && !form.venueVendorId) {
      await Swal.fire({
        icon: "error",
        title: "Service vendor required",
        text: "Select a service vendor for this reel.",
      });
      return;
    }

    const fields = {
      type: form.type,
      title: form.type === "ecom" ? "" : form.title.trim().slice(0, 32),
      status: form.status,
      productId: form.type === "ecom" ? form.productId : "",
      vendorId: form.type === "ecom" ? form.vendorId : "",
      venueId: form.type === "venue" ? form.venueId : "",
      venueVendorId: form.type === "venue" ? form.venueVendorId : "",
    };

    setSaving(true);
    try {
      if (editId) {
        await adminUpdateVideoFeed(adminToken, editId, fields, {
          video: videoFile,
          thumbnail: thumbnailFile,
        });
        await Swal.fire({ icon: "success", title: "Reel updated", timer: 1400, showConfirmButton: false });
      } else {
        await adminCreateVideoFeed(adminToken, fields, {
          video: videoFile,
          thumbnail: thumbnailFile,
        });
        await Swal.fire({ icon: "success", title: "Reel added", timer: 1400, showConfirmButton: false });
      }
      resetForm();
      await loadRows();
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Save failed", text: err.message || "Could not save reel." });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (row) => {
    const confirm = await Swal.fire({
      icon: "warning",
      title: "Delete reel?",
      text:
        row.type === "venue"
          ? row.title || "This video will be removed from the user feed."
          : "This video will be removed from the user feed.",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#b91c1c",
    });
    if (!confirm.isConfirmed) return;
    try {
      await adminDeleteVideoFeed(adminToken, row._id, row.type || "ecom");
      await loadRows();
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: err.message || "Could not delete reel." });
    }
  };

  return (
    <div className="user-page">
      <div className="user-page__toolbar">
        <div>
          <h2 className="user-page__title">Reels / Video Feeds</h2>
          <p className="text-muted small mb-0">
            Upload ecom or service reels (max {VIDEO_MAX_DURATION_SECONDS}s). Product / service selection is optional.
          </p>
        </div>
      </div>

      <form className="card border-0 shadow-sm mb-4" onSubmit={onSubmit}>
        <div className="card-body">
          <div className="row g-3">
            <div className={form.type === "venue" ? "col-md-3" : "col-md-4"}>
              <label className="form-label">Type</label>
              <select
                className="form-select"
                value={form.type}
                disabled={Boolean(editId)}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...emptyForm(),
                    type: e.target.value,
                    title: e.target.value === "venue" ? prev.title : "",
                    status: prev.status,
                  }))
                }
              >
                <option value="ecom">Ecom</option>
                <option value="venue">Service / Venue</option>
              </select>
            </div>
            {form.type === "venue" ? (
              <div className="col-md-5">
                <label className="form-label">Title</label>
                <input
                  className="form-control"
                  value={form.title}
                  maxLength={32}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value.slice(0, 32) }))}
                  placeholder="Optional reel title"
                />
              </div>
            ) : null}
            <div className={form.type === "venue" ? "col-md-4" : "col-md-8"}>
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {form.type === "ecom" ? (
              <>
                <div className="col-md-6">
                  <label className="form-label">Ecom vendor *</label>
                  <select
                    className="form-select"
                    value={form.vendorId}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        vendorId: e.target.value,
                        productId: "",
                      }))
                    }
                  >
                    <option value="">Select vendor</option>
                    {vendors.map((v) => (
                      <option key={v._id} value={v._id}>
                        {v.businessName || v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label">Product (optional)</label>
                  <select
                    className="form-select"
                    value={form.productId}
                    disabled={!form.vendorId || optionsLoading}
                    onChange={(e) => setForm((prev) => ({ ...prev, productId: e.target.value }))}
                  >
                    <option value="">
                      {!form.vendorId
                        ? "Select a vendor first"
                        : optionsLoading
                          ? "Loading products..."
                          : products.length === 0
                            ? "No products for this vendor"
                            : "No product linked"}
                    </option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="col-md-6">
                  <label className="form-label">Service vendor *</label>
                  <select
                    className="form-select"
                    value={form.venueVendorId}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        venueVendorId: e.target.value,
                        venueId: "",
                      }))
                    }
                  >
                    <option value="">Select service vendor</option>
                    {venueVendors.map((v) => (
                      <option key={v._id} value={v._id}>
                        {v.businessName || v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label">Service (optional)</label>
                  <select
                    className="form-select"
                    value={form.venueId}
                    disabled={!form.venueVendorId || optionsLoading}
                    onChange={(e) => setForm((prev) => ({ ...prev, venueId: e.target.value }))}
                  >
                    <option value="">
                      {!form.venueVendorId
                        ? "Select a service vendor first"
                        : optionsLoading
                          ? "Loading services..."
                          : venues.length === 0
                            ? "No services for this vendor"
                            : "No service linked"}
                    </option>
                    {venues.map((v) => (
                      <option key={v._id} value={v._id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="col-md-6">
              <label className="form-label">Video {editId ? "(optional replace)" : "*"}</label>
              <input
                type="file"
                accept="video/*"
                className="form-control"
                onChange={(e) => {
                  handleVideoFile(e.target.files?.[0] || null);
                  e.target.value = "";
                }}
              />
              <div className="form-text">
                MP4 / WebM / MOV · max 50 MB · max {VIDEO_MAX_DURATION_SECONDS}s
              </div>
              {videoFile ? <div className="small text-muted mt-1">{videoFile.name}</div> : null}
            </div>
            <div className="col-md-6">
              <label className="form-label">Thumbnail (optional)</label>
              <input
                type="file"
                accept="image/*"
                className="form-control"
                onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          <div className="d-flex gap-2 mt-3">
            <button type="submit" className="btn btn--accent" disabled={saving}>
              {saving ? "Saving..." : editId ? "Update reel" : "Add reel"}
            </button>
            {editId ? (
              <button type="button" className="btn btn--ghost" onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </div>
      </form>

      <div className="d-flex flex-wrap gap-2 mb-3">
        {[
          { value: "all", label: "All" },
          { value: "ecom", label: "Ecom" },
          { value: "venue", label: "Service" },
        ].map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`btn btn--sm ${filterType === opt.value ? "btn--accent" : "btn--ghost"}`}
            onClick={() => {
              setPage(1);
              setFilterType(opt.value);
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="table-responsive card border-0 shadow-sm">
        <table className="table data-table mb-0">
          <thead>
            <tr>
              <th>S.No</th>
              <th>Preview</th>
              <th>Type</th>
              <th>Title</th>
              <th>Linked to</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>
                  <p className="table-placeholder">Loading...</p>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <p className="table-placeholder">No reels found.</p>
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={`${row.type}-${row._id}`}>
                  <td>{(page - 1) * LIST_LIMIT + idx + 1}</td>
                  <td>
                    {row.thumbnail || row.video ? (
                      row.video ? (
                        <a href={mediaDocumentUrl(row.video)} target="_blank" rel="noreferrer" title="Open video">
                          <img
                            src={mediaUrl(row.thumbnail || row.video)}
                            alt=""
                            width={56}
                            height={56}
                            style={{ objectFit: "cover", borderRadius: 8, display: "block" }}
                          />
                        </a>
                      ) : (
                        <img
                          src={mediaUrl(row.thumbnail)}
                          alt=""
                          width={56}
                          height={56}
                          style={{ objectFit: "cover", borderRadius: 8 }}
                        />
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span className="pill">{row.type === "venue" ? "Service" : "Ecom"}</span>
                  </td>
                  <td>{row.type === "venue" ? row.title || "—" : "—"}</td>
                  <td>
                    {row.type === "venue"
                      ? row.venue?.name || row.venueVendor?.businessName || row.venueVendor?.name || "—"
                      : row.product?.name || row.vendor?.businessName || row.vendor?.name || "—"}
                  </td>
                  <td>
                    <span className={`pill ${row.status === "active" ? "pill--active" : "pill--inactive"}`}>
                      {row.status || "—"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(row)}>
                        <MdEditSquare />
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => onDelete(row)}>
                        <AiFillDelete />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ListPagination page={page} pages={pages} onPageChange={setPage} />
    </div>
  );
}
