import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete } from "react-icons/ai";
import {
  adminApproveCategory,
  adminCreateCategory,
  adminDeleteCategory,
  adminListCategories,
  adminRejectCategory,
  adminUpdateCategory,
} from "../../api/adminCategories.js";
import { logout } from "../../store/authSlice.js";
import { mediaUrl } from "../../media.js";
import { AppImage } from "../../components/AppImage.jsx";
import { ListPagination } from "../../components/ListPagination.jsx";

const MODE_OPTIONS = [
  { value: "ecom", label: "Ecom" },
  { value: "venue", label: "Service" },
];

function resolveRecordMode(row) {
  return row?.mode || "ecom";
}

function emptyForm() {
  return { name: "" };
}

const NAME_MAX_LEN = 40;
const IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const LIST_LIMIT = 10;

function sanitizeNameInput(value) {
  return value.replace(/[^A-Za-z ]+/g, "").slice(0, NAME_MAX_LEN);
}

function validateCategoryForm(form) {
  const name = form.name.trim();

  if (!name) {
    return "Name is required.";
  }
  if (!/^[A-Za-z ]+$/.test(name)) {
    return "Name can contain only letters and spaces.";
  }
  if (name.length > NAME_MAX_LEN) {
    return `Name cannot exceed ${NAME_MAX_LEN} characters.`;
  }
  return "";
}

export function CategoryPage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const admin = useSelector((s) => s.auth.admin);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sendMode, setSendMode] = useState("ecom");
  const [listMode, setListMode] = useState("ecom");
  const [editMode, setEditMode] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [existingImage, setExistingImage] = useState("");
  const [togglingId, setTogglingId] = useState("");
  const [pendingRows, setPendingRows] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [approvingId, setApprovingId] = useState("");
  const fileInputRef = useRef(null);
  const formSectionRef = useRef(null);
  const adminId = admin?._id || admin?.id || "";

  const formMode = editId ? editMode || sendMode : sendMode;

  const loadRows = useCallback(async () => {
    if (!adminToken) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { categories, pagination } = await adminListCategories(adminToken, {
        page,
        limit: LIST_LIMIT,
        mode: listMode,
        listed: true,
      });
      setRows(categories ?? []);
      setPages(pagination?.pages ?? 1);
      setTotal(pagination?.total ?? 0);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: e.message || "Failed to load categories." });
    } finally {
      setLoading(false);
    }
  }, [adminToken, dispatch, listMode, page]);

  const loadPendingRows = useCallback(async () => {
    if (!adminToken) {
      setPendingRows([]);
      return;
    }
    setPendingLoading(true);
    try {
      const { categories } = await adminListCategories(adminToken, {
        page: 1,
        limit: 50,
        mode: "ecom",
        role: "Vendor",
        status: "pending",
      });
      setPendingRows(categories ?? []);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Load failed",
        text: e.message || "Failed to load pending vendor categories.",
      });
    } finally {
      setPendingLoading(false);
    }
  }, [adminToken, dispatch]);

  useEffect(() => {
    loadRows();
    loadPendingRows();
  }, [loadRows, loadPendingRows]);

  useEffect(() => {
    setPage(1);
  }, [listMode]);

  useEffect(() => {
    if (!editId) return;
    requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [editId]);

  const revokePreview = (url) => {
    if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
  };

  const resetForm = useCallback(() => {
    setForm(emptyForm());
    setEditId("");
    setEditMode("");
    setSendMode(listMode);
    setImageFile(null);
    setImagePreview((prev) => {
      revokePreview(prev);
      return "";
    });
    setExistingImage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [listMode]);

  const clearSelectedImage = () => {
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setImagePreview((prev) => {
      revokePreview(prev);
      return existingImage || "";
    });
  };

  const onPickImage = (e) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > IMAGE_MAX_SIZE_BYTES) {
      setImageFile(null);
      e.target.value = "";
      setImagePreview((prev) => {
        revokePreview(prev);
        return existingImage || "";
      });
      void Swal.fire({
        icon: "error",
        title: "Validation error",
        text: "Image size must be 5 MB or less.",
      });
      return;
    }
    setImagePreview((prev) => {
      revokePreview(prev);
      return file ? URL.createObjectURL(file) : existingImage || "";
    });
    setImageFile(file);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!adminToken) return;
    const validationError = validateCategoryForm(form);
    if (validationError) {
      await Swal.fire({ icon: "error", title: "Validation error", text: validationError });
      return;
    }
    if (!editId && !(imageFile instanceof File)) {
      await Swal.fire({ icon: "error", title: "Validation error", text: "Category image is required." });
      return;
    }

    const payload = {
      name: form.name.trim(),
      mode: formMode,
      role: "Admin",
      addedById: admin?._id || admin?.id,
      status: "active",
    };
    setSaving(true);
    try {
      if (editId) {
        await adminUpdateCategory(adminToken, editId, payload, imageFile);
        await Swal.fire({ icon: "success", title: "Category updated", timer: 1500 });
        await loadRows();
      } else {
        await adminCreateCategory(adminToken, payload, imageFile);
        await Swal.fire({ icon: "success", title: "Category created", timer: 1500 });
        if (page !== 1) {
          setPage(1);
        } else {
          await loadRows();
        }
      }
      resetForm();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Save failed", text: e.message || "Could not save category." });
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row) => {
    const mode = resolveRecordMode(row);
    setEditId(row._id);
    setEditMode(mode);
    setSendMode(mode);
    setForm({
      name: row.name || "",
    });
    setImageFile(null);
    const nextPreview = mediaUrl(row.image);
    setExistingImage(nextPreview);
    setImagePreview((prev) => {
      revokePreview(prev);
      return nextPreview;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDelete = async (row) => {
    if (editId) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete category?",
      text: `This will delete "${row.name}".`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeleteCategory(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Category deleted", timer: 1500 });
      if (editId === row._id) resetForm();
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: e.message || "Could not delete category." });
    }
  };

  const onApprovePending = async (row) => {
    if (!adminToken) return;
    setApprovingId(row._id);
    try {
      await adminApproveCategory(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Category approved", timer: 1500 });
      await loadPendingRows();
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Approve failed", text: e.message || "Could not approve category." });
    } finally {
      setApprovingId("");
    }
  };

  const onRejectPending = async (row) => {
    if (!adminToken) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Reject category?",
      text: `Reject "${row.name}" submitted by vendor?`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Reject",
    });
    if (!isConfirmed) return;
    setApprovingId(row._id);
    try {
      await adminRejectCategory(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Category rejected", timer: 1500 });
      await loadPendingRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Reject failed", text: e.message || "Could not reject category." });
    } finally {
      setApprovingId("");
    }
  };

  const onToggleStatus = async (row) => {
    if (!adminToken) return;
    if (row.status === "pending" || row.status === "rejected") return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingId(row._id);
    try {
      await adminUpdateCategory(adminToken, row._id, { status: nextStatus });
      await Swal.fire({
        icon: "success",
        title: nextStatus === "active" ? "Category activated" : "Category deactivated",
        timer: 1500,
      });
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Status update failed", text: e.message || "Could not update status." });
    } finally {
      setTogglingId("");
    }
  };

  return (
    <div className="user-page">
      <div className="page-card" ref={formSectionRef} style={{ scrollMarginTop: "80px" }}>
        <div className="page-card__head">
          <h2 className="page-card__title">{editId ? "Edit Category" : "Create Category"}</h2>
        </div>
        <div
          style={{
            background: "#efeff4",
            borderRadius: 999,
            padding: 4,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 4,
            marginBottom: 10,
          }}
        >
          {MODE_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              disabled={Boolean(editId)}
              onClick={() => {
                if (editId) return;
                setSendMode(item.value);
              }}
              style={{
                border: 0,
                borderRadius: 999,
                padding: "8px 10px",
                background: formMode === item.value ? "#fff" : "transparent",
                fontWeight: 500,
                opacity: editId ? 0.7 : 1,
                cursor: editId ? "not-allowed" : "pointer",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit}>
          <div className="row g-3">
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>
                  Name <span className="required-dot">*</span>
                </span>
                <small>{form.name.length}/{NAME_MAX_LEN}</small>
              </span>
              <input
                className="user-field__input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: sanitizeNameInput(e.target.value) }))}
                maxLength={NAME_MAX_LEN}
                required
              />
            </label>
            <div className="user-field col-12 col-md-6">
              <span className="user-field__label">Image (max 5 MB) {editId ? "" : <span className="required-dot">*</span>}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onPickImage}
              />
              {imagePreview ? (
                <div className="form-image-preview">
                  <img src={imagePreview} alt="Category preview" />
                  <button
                    type="button"
                    className="form-image-preview__remove"
                    aria-label="Remove image"
                    onClick={clearSelectedImage}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <small className="user-cell__muted">No image selected</small>
              )}
            </div>
          </div>
          <div className="user-form__actions">
            {editId ? (
              <button type="button" className="btn btn--ghost" onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? "Saving…" : editId ? "Update Category" : "Create Category"}
            </button>
          </div>
        </form>
      </div>

      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">Vendor category approvals (ecom)</h2>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Name</th>
                <th>Vendor</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingLoading ? (
                <tr>
                  <td colSpan={5}>Loading…</td>
                </tr>
              ) : pendingRows.length === 0 ? (
                <tr>
                  <td colSpan={5}>No pending vendor categories.</td>
                </tr>
              ) : (
                pendingRows.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <AppImage
                        src={row.image}
                        alt=""
                        style={{ width: 56, height: 42, objectFit: "cover", borderRadius: 6 }}
                      />
                    </td>
                    <td>{row.name}</td>
                    <td>
                      <span className="data-table__muted">
                        {row.addedById?.businessName || row.addedById?.name || "—"}
                        {row.addedById?.phone ? ` · ${row.addedById.phone}` : ""}
                      </span>
                    </td>
                    <td>
                      <span className="pill pill--vendor-pending">{row.status}</span>
                    </td>
                    <td>
                      <div className="row-actions" style={{ gap: 8 }}>
                        <button
                          type="button"
                          className="btn btn--approve btn--sm"
                          disabled={approvingId === row._id}
                          onClick={() => onApprovePending(row)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={approvingId === row._id}
                          onClick={() => onRejectPending(row)}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">Categories</h2>
        </div>
        <div
          style={{
            background: "#efeff4",
            borderRadius: 999,
            padding: 4,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 4,
            marginBottom: 10,
          }}
        >
          {MODE_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setListMode(item.value)}
              style={{
                border: 0,
                borderRadius: 999,
                padding: "8px 10px",
                background: listMode === item.value ? "#fff" : "transparent",
                fontWeight: 500,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>S No.</th>
                <th>Image</th>
                <th>Name</th>
                <th>Mode</th>
                <th>Added By</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>No categories found.</td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row._id}>
                    <td className="data-table__muted">{(page - 1) * LIST_LIMIT + idx + 1}</td>
                    <td>
                      <AppImage
                        src={row.image}
                        alt=""
                        style={{ width: 56, height: 42, objectFit: "cover", borderRadius: 6 }}
                      />
                    </td>
                    <td>{row.name}</td>
                    <td>{row.mode || "ecom"}</td>
                    <td>
                      <span className="data-table__muted">
                        {row.addedById?.businessName || row.addedById?.name || "—"} ({row.role || "Admin"})
                      </span>
                    </td>
                    <td>
                      {row.status === "pending" || row.status === "rejected" ? (
                        <span
                          className={`pill ${
                            row.status === "pending" ? "pill--vendor-pending" : "pill--vendor-suspended"
                          }`}
                        >
                          {row.status}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`}
                          role="switch"
                          aria-checked={row.status === "active"}
                          aria-label={`Toggle status for ${row.name}`}
                          onClick={() => onToggleStatus(row)}
                          disabled={togglingId === row._id}
                          title={row.status === "active" ? "Deactivate category" : "Activate category"}
                        >
                          <span className="settings-switch__knob" aria-hidden />
                        </button>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-btn icon-btn--edit" title="Edit" onClick={() => onEdit(row)}>
                          <MdEditSquare size={18} />
                        </button>
                        <button
                          type="button"
                          className={`icon-btn icon-btn--delete${editId ? " is-disabled" : ""}`}
                          title={editId ? "Finish/cancel edit to enable delete" : "Delete"}
                          onClick={() => onDelete(row)}
                          disabled={Boolean(editId)}
                          style={editId ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                        >
                          <AiFillDelete size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      <ListPagination page={page} pages={pages} total={total} onPageChange={setPage} />
      </div>
    </div>
  );
}
