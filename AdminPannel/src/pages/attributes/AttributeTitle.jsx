import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete } from "react-icons/ai";
import {
  adminCreateAttributeTitle,
  adminDeleteAttributeTitle,
  adminListAttributeTitles,
  adminUpdateAttributeTitle,
} from "../../api/adminAttributes.js";
import { adminListCategories } from "../../api/adminCategories.js";
import { adminListSubCategories } from "../../api/adminSubCategories.js";
import { logout } from "../../store/authSlice.js";
import { ListPagination } from "../../components/ListPagination.jsx";

function emptyForm() {
  return { title: "", category: "", subCategory: "" };
}

const TITLE_MAX_LEN = 40;
const LIST_LIMIT = 10;

function sanitizeTitleInput(value) {
  return value.replace(/[^A-Za-z0-9 -]+/g, "").slice(0, TITLE_MAX_LEN);
}

function validateTitleForm(form) {
  const title = form.title.trim();
  if (!form.category) return "Category is required.";
  if (!form.subCategory) return "Sub-category is required.";
  if (!title) return "Title is required.";
  if (!/^[A-Za-z0-9 -]+$/.test(title)) {
    return "Title can contain only letters, numbers, spaces, and hyphens.";
  }
  if (title.length > TITLE_MAX_LEN) return `Title cannot exceed ${TITLE_MAX_LEN} characters.`;
  return "";
}

function categoryLabel(row) {
  return row?.category?.name || "—";
}

function subCategoryLabel(row) {
  return row?.subCategory?.name || "—";
}

export function AttributeTitlePage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSubCategory, setFilterSubCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState("");
  const [togglingId, setTogglingId] = useState("");

  useEffect(() => {
    if (!adminToken) return;
    let cancelled = false;
    (async () => {
      try {
        const { categories: cats } = await adminListCategories(adminToken, {
          page: 1,
          limit: 200,
          mode: "ecom",
          listed: true,
        });
        if (!cancelled) setCategories(cats);
      } catch (e) {
        if (e?.status === 401) return dispatch(logout());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch]);

  useEffect(() => {
    if (!adminToken) return;
    let cancelled = false;
    (async () => {
      try {
        const { subCategories: subs } = await adminListSubCategories(adminToken, {
          page: 1,
          limit: 500,
          mode: "ecom",
          listed: true,
          category: form.category || filterCategory || undefined,
        });
        if (!cancelled) setSubCategories(subs);
      } catch (e) {
        if (e?.status === 401) return dispatch(logout());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch, filterCategory, form.category]);

  const formSubCategoryOptions = useMemo(() => {
    if (!form.category) return [];
    return subCategories.filter((s) => String(s.category?._id || s.category) === String(form.category));
  }, [form.category, subCategories]);

  const filterSubCategoryOptions = useMemo(() => {
    if (!filterCategory) return [];
    return subCategories.filter((s) => String(s.category?._id || s.category) === String(filterCategory));
  }, [filterCategory, subCategories]);

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const { attributeTitles, pagination } = await adminListAttributeTitles(adminToken, {
        page,
        limit: LIST_LIMIT,
        category: filterCategory || undefined,
        subCategory: filterSubCategory || undefined,
      });
      setRows(attributeTitles);
      setPages(pagination?.pages ?? 1);
      setTotal(pagination?.total ?? 0);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: e.message || "Failed to load attribute titles." });
    } finally {
      setLoading(false);
    }
  }, [adminToken, dispatch, filterCategory, filterSubCategory, page]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    setPage(1);
  }, [filterCategory, filterSubCategory]);

  useEffect(() => {
    setFilterSubCategory("");
  }, [filterCategory]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditId("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!adminToken) return;

    const validationError = validateTitleForm(form);
    if (validationError) {
      await Swal.fire({ icon: "error", title: "Validation error", text: validationError });
      return;
    }

    const payload = {
      title: form.title.trim(),
      category: form.category,
      subCategory: form.subCategory,
      childCategory: "",
      status: "active",
    };
    setSaving(true);
    try {
      if (editId) {
        await adminUpdateAttributeTitle(adminToken, editId, payload);
        await Swal.fire({ icon: "success", title: "Attribute title updated", timer: 1200 });
      } else {
        await adminCreateAttributeTitle(adminToken, payload);
        await Swal.fire({ icon: "success", title: "Attribute title created", timer: 1200 });
      }
      resetForm();
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Save failed", text: e.message || "Could not save attribute title." });
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row) => {
    setEditId(row._id);
    setForm({
      title: row.title || "",
      category: row.category?._id || row.category || "",
      subCategory: row.subCategory?._id || row.subCategory || "",
    });
  };

  const onDelete = async (row) => {
    if (editId) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete attribute title?",
      text: `This will delete "${row.title}" for ${subCategoryLabel(row)} (${categoryLabel(row)}).`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeleteAttributeTitle(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Attribute title deleted", timer: 1200 });
      if (editId === row._id) resetForm();
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: e.message || "Could not delete attribute title." });
    }
  };

  const onToggleStatus = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingId(row._id);
    try {
      await adminUpdateAttributeTitle(adminToken, row._id, { status: nextStatus });
      await Swal.fire({
        icon: "success",
        title: nextStatus === "active" ? "Attribute title activated" : "Attribute title deactivated",
        timer: 1000,
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
      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">{editId ? "Edit Attribute Title" : "Create Attribute Title"}</h2>
        </div>
        <form onSubmit={onSubmit}>
          <div className="row g-3">
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">
                Category <span className="required-dot">*</span>
              </span>
              <select
                className="user-field__input"
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value, subCategory: "" }))}
                required
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">
                Sub-category <span className="required-dot">*</span>
              </span>
              <select
                className="user-field__input"
                value={form.subCategory}
                onChange={(e) => setForm((p) => ({ ...p, subCategory: e.target.value }))}
                required
                disabled={!form.category}
              >
                <option value="">{form.category ? "Select sub-category" : "Select a category first"}</option>
                {formSubCategoryOptions.map((sub) => (
                  <option key={sub._id} value={sub._id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>
                  Title <span className="required-dot">*</span>
                </span>
                <small>
                  {form.title.length}/{TITLE_MAX_LEN}
                </small>
              </span>
              <input
                className="user-field__input"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: sanitizeTitleInput(e.target.value) }))}
                maxLength={TITLE_MAX_LEN}
                required
              />
            </label>
          </div>
          <div className="user-form__actions">
            {editId ? (
              <button type="button" className="btn btn--ghost" onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? "Saving…" : editId ? "Update Attribute Title" : "Create Attribute Title"}
            </button>
          </div>
        </form>
      </div>

      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">Attribute Titles</h2>
          <div className="d-flex flex-wrap gap-3">
            <label className="user-field" style={{ minWidth: 200, margin: 0 }}>
              <span className="user-field__label">Filter by category</span>
              <select
                className="user-field__input"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-field" style={{ minWidth: 200, margin: 0 }}>
              <span className="user-field__label">Filter by sub-category</span>
              <select
                className="user-field__input"
                value={filterSubCategory}
                onChange={(e) => setFilterSubCategory(e.target.value)}
                disabled={!filterCategory}
              >
                <option value="">{filterCategory ? "All sub-categories" : "Select category first"}</option>
                {filterSubCategoryOptions.map((sub) => (
                  <option key={sub._id} value={sub._id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>S No.</th>
                <th>Category</th>
                <th>Sub-category</th>
                <th>Title</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>No attribute titles found.</td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row._id}>
                    <td className="data-table__muted">{idx + 1}</td>
                    <td>{categoryLabel(row)}</td>
                    <td>{subCategoryLabel(row)}</td>
                    <td>{row.title}</td>
                    <td>
                      <button
                        type="button"
                        className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`}
                        role="switch"
                        aria-checked={row.status === "active"}
                        aria-label={`Toggle status for ${row.title}`}
                        onClick={() => onToggleStatus(row)}
                        disabled={togglingId === row._id}
                        title={row.status === "active" ? "Deactivate attribute title" : "Activate attribute title"}
                      >
                        <span className="settings-switch__knob" aria-hidden />
                      </button>
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
