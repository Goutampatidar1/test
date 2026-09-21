import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { adminListCategories } from "../../api/adminCategories.js";
import {
  adminApproveSubCategory,
  adminCreateSubCategory,
  adminDeleteSubCategory,
  adminListSubCategories,
  adminRejectSubCategory,
  adminUpdateSubCategory,
} from "../../api/adminSubCategories.js";
import { mediaUrl } from "../../media.js";
import { AppImage } from "../../components/AppImage.jsx";
import { logout } from "../../store/authSlice.js";
import { ListPagination } from "../../components/ListPagination.jsx";

const MODE_OPTIONS = [
  { value: "ecom", label: "Ecom" },
  { value: "venue", label: "Service" },
];

function resolveRecordMode(row) {
  return row?.mode || row?.category?.mode || "ecom";
}

function emptyForm() {
  return { name: "", category: "" };
}

const NAME_MAX_LEN = 40;
const IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const LIST_LIMIT = 10;

function sanitizeNameInput(value) {
  return value.replace(/[^A-Za-z ]+/g, "").slice(0, NAME_MAX_LEN);
}

function validateSubCategoryForm(form) {
  const name = form.name.trim();

  if (!name || !form.category) {
    return "Name and category are required.";
  }
  if (!/^[A-Za-z ]+$/.test(name)) {
    return "Name can contain only letters and spaces.";
  }
  if (name.length > NAME_MAX_LEN) {
    return `Name cannot exceed ${NAME_MAX_LEN} characters.`;
  }
  return "";
}

export function SubCategoryPage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const admin = useSelector((s) => s.auth.admin);
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
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

  const loadPendingRows = useCallback(async () => {
    if (!adminToken) {
      setPendingRows([]);
      return;
    }
    setPendingLoading(true);
    try {
      const { subCategories } = await adminListSubCategories(adminToken, {
        page: 1,
        limit: 50,
        mode: "ecom",
        role: "Vendor",
        status: "pending",
      });
      setPendingRows(subCategories ?? []);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Load failed",
        text: e.message || "Failed to load pending sub-categories.",
      });
    } finally {
      setPendingLoading(false);
    }
  }, [adminToken, dispatch]);

  const formMode = editId ? editMode || sendMode : sendMode;

  const loadRows = useCallback(async () => {
    if (!adminToken) {
      setRows([]);
      setCategories([]);
      return;
    }
    setLoading(true);
    try {
      const [{ subCategories, pagination }, { categories: cats }] = await Promise.all([
        adminListSubCategories(adminToken, {
          page,
          limit: LIST_LIMIT,
          mode: listMode,
          listed: true,
        }),
        adminListCategories(adminToken, {
          page: 1,
          limit: 200,
          mode: formMode,
          listed: true,
        }),
      ]);
      setRows(subCategories ?? []);
      setCategories(cats ?? []);
      setPages(pagination?.pages ?? 1);
      setTotal(pagination?.total ?? 0);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: e.message || "Failed to load sub-categories." });
    } finally {
      setLoading(false);
    }
  }, [adminToken, dispatch, formMode, listMode, page]);

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
    const validationError = validateSubCategoryForm(form);
    if (validationError) {
      await Swal.fire({ icon: "error", title: "Validation error", text: validationError });
      return;
    }
    if (!editId && !(imageFile instanceof File)) {
      await Swal.fire({ icon: "error", title: "Validation error", text: "Sub-category image is required." });
      return;
    }

    const payload = {
      name: form.name.trim(),
      category: form.category,
      mode: formMode,
      role: "Admin",
      addedById: admin?._id || admin?.id,
      status: "active",
    };
    setSaving(true);
    try {
      if (editId) {
        await adminUpdateSubCategory(adminToken, editId, payload, imageFile);
        await Swal.fire({ icon: "success", title: "Sub-category updated", timer: 1500 });
        await loadRows();
      } else {
        await adminCreateSubCategory(adminToken, payload, imageFile);
        await Swal.fire({ icon: "success", title: "Sub-category created", timer: 1500 });
        if (page !== 1) {
          setPage(1);
        } else {
          await loadRows();
        }
      }
      resetForm();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Save failed", text: e.message || "Could not save sub-category." });
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
      category: row.category?._id || row.category || "",
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
      title: "Delete sub-category?",
      text: `This will delete "${row.name}".`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeleteSubCategory(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Sub-category deleted", timer: 1500 });
      if (editId === row._id) resetForm();
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: e.message || "Could not delete sub-category." });
    }
  };

  const onApprovePending = async (row) => {
    if (!adminToken) return;
    setApprovingId(row._id);
    try {
      await adminApproveSubCategory(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Sub-category approved", timer: 1500 });
      await loadPendingRows();
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Approve failed", text: e.message || "Could not approve." });
    } finally {
      setApprovingId("");
    }
  };

  const onRejectPending = async (row) => {
    if (!adminToken) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Reject sub-category?",
      text: `Reject "${row.name}"?`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Reject",
    });
    if (!isConfirmed) return;
    setApprovingId(row._id);
    try {
      await adminRejectSubCategory(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Sub-category rejected", timer: 1500 });
      await loadPendingRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Reject failed", text: e.message || "Could not reject." });
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
      await adminUpdateSubCategory(adminToken, row._id, { status: nextStatus });
      await Swal.fire({
        icon: "success",
        title: nextStatus === "active" ? "Sub-category activated" : "Sub-category deactivated",
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
          <h2 className="page-card__title">{editId ? "Edit Sub-Category" : "Create Sub-Category"}</h2>
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
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">Category <span className="required-dot">*</span></span>
              <select className="user-field__input" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} required>
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="user-field col-12 col-md-6">
              <span className="user-field__label">Image (max 5 MB)  {editId ? "" : <span className="required-dot">*</span>}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onPickImage}
              />
              {imagePreview ? (
                <div className="form-image-preview">
                  <img src={imagePreview} alt="Sub-category preview" />
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
              {saving ? "Saving…" : editId ? "Update Sub-Category" : "Create Sub-Category"}
            </button>
          </div>
        </form>
      </div>

      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">Vendor sub-category approvals (ecom)</h2>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Name</th>
                <th>Category</th>
                <th>Vendor</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingLoading ? (
                <tr>
                  <td colSpan={6}>Loading…</td>
                </tr>
              ) : pendingRows.length === 0 ? (
                <tr>
                  <td colSpan={6}>No pending vendor sub-categories.</td>
                </tr>
              ) : (
                pendingRows.map((row) => (
                  <tr key={row._id}>
                    <td>
                      {row.image ? (
                        <img src={mediaUrl(row.image)} alt="" style={{ width: 56, height: 42, objectFit: "cover", borderRadius: 6 }} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{row.name}</td>
                    <td>{row.category?.name || "—"}</td>
                    <td>
                      <span className="data-table__muted">
                        {row.addedById?.businessName || row.addedById?.name || "—"}
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
          <h2 className="page-card__title">Sub-Categories</h2>
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
                <th>Category</th>
                <th>Mode</th>
                <th>Added By</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>No sub-categories found.</td>
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
                    <td>{row.category?.name || "—"}</td>
                    <td>{row.mode || "ecom"}</td>
                    <td>
                      {row.addedById?.businessName || row.addedById?.name || row.role || "Admin"}
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
                          title={row.status === "active" ? "Deactivate sub-category" : "Activate sub-category"}
                        >
                          <span className="settings-switch__knob" aria-hidden />
                        </button>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-btn icon-btn--edit" title="Edit" onClick={() => onEdit(row)}>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                        </button>
                        <button
                          type="button"
                          className={`icon-btn icon-btn--delete${editId ? " is-disabled" : ""}`}
                          title={editId ? "Finish/cancel edit to enable delete" : "Delete"}
                          onClick={() => onDelete(row)}
                          disabled={Boolean(editId)}
                          style={editId ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>
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
