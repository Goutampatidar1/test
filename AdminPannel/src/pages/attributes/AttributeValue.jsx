import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete } from "react-icons/ai";
import {
  adminCreateAttributeValue,
  adminDeleteAttributeValue,
  adminListAttributeTitles,
  adminListAttributeValues,
  adminUpdateAttributeValue,
} from "../../api/adminAttributes.js";
import { adminListCategories } from "../../api/adminCategories.js";
import { adminListSubCategories } from "../../api/adminSubCategories.js";
import { logout } from "../../store/authSlice.js";
import { ListPagination } from "../../components/ListPagination.jsx";

function emptyForm() {
  return { value: "", colorCode: "", attributeTitle: "", category: "", subCategory: "" };
}

const VALUE_MAX_LEN = 60;
const LIST_LIMIT = 10;
function sanitizeValueInput(value) {
  return value.replace(/[^A-Za-z0-9 ]+/g, "").slice(0, VALUE_MAX_LEN);
}

function sanitizeColorCodeInput(value) {
  return value.replace(/[^#0-9A-Fa-f]/g, "").slice(0, 7);
}

function isColorAttributeTitle(title) {
  return /color/i.test(String(title?.title || title || ""));
}

function validateColorCode(colorCode) {
  const raw = colorCode.trim();
  if (!raw) return "";
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(hex)) {
    return "Color code must be a valid hex value (e.g. #FFFFFF or #FFF).";
  }
  return "";
}

function validateValueForm(form, titles) {
  const value = form.value.trim();
  if (!form.category) return "Category is required.";
  if (!form.subCategory) return "Sub-category is required.";
  if (!value || !form.attributeTitle) return "Value and attribute title are required.";
  if (!/^[A-Za-z0-9 ]+$/.test(value)) return "Value can contain only letters, numbers, and spaces.";
  if (value.length > VALUE_MAX_LEN) return `Value cannot exceed ${VALUE_MAX_LEN} characters.`;

  const selectedTitle = titles.find((t) => String(t._id) === String(form.attributeTitle));
  if (isColorAttributeTitle(selectedTitle)) {
    return validateColorCode(form.colorCode);
  }
  return "";
}

function titleOptionLabel(title) {
  const parts = [title?.title || "—"];
  if (title?.subCategory?.name) parts.push(title.subCategory.name);
  return parts.join(" · ");
}

export function AttributeValuePage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [rows, setRows] = useState([]);
  const [titles, setTitles] = useState([]);
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

  const selectedFormTitle = useMemo(
    () => titles.find((t) => String(t._id) === String(form.attributeTitle)),
    [form.attributeTitle, titles]
  );

  const showColorCode = isColorAttributeTitle(selectedFormTitle);

  const loadTitles = useCallback(async () => {
    if (!adminToken || !form.subCategory) {
      setTitles([]);
      return;
    }
    try {
      const { attributeTitles } = await adminListAttributeTitles(adminToken, {
        page: 1,
        limit: 500,
        category: form.category || undefined,
        subCategory: form.subCategory || undefined,
      });
      setTitles(attributeTitles);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
    }
  }, [adminToken, dispatch, form.category, form.subCategory]);

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const { attributeValues, pagination } = await adminListAttributeValues(adminToken, {
        page,
        limit: LIST_LIMIT,
        category: filterCategory || undefined,
        subCategory: filterSubCategory || undefined,
      });
      setRows(attributeValues);
      setPages(pagination?.pages ?? 1);
      setTotal(pagination?.total ?? 0);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: e.message || "Failed to load attribute values." });
    } finally {
      setLoading(false);
    }
  }, [adminToken, dispatch, filterCategory, filterSubCategory, page]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    loadTitles();
  }, [loadTitles]);

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

    const validationError = validateValueForm(form, titles);
    if (validationError) {
      await Swal.fire({ icon: "error", title: "Validation error", text: validationError });
      return;
    }

    const payload = {
      value: form.value.trim(),
      attributeTitle: form.attributeTitle,
      colorCode: showColorCode ? form.colorCode.trim() : "",
      status: "active",
    };
    setSaving(true);
    try {
      if (editId) {
        await adminUpdateAttributeValue(adminToken, editId, payload);
        await Swal.fire({ icon: "success", title: "Attribute value updated", timer: 1500 });
      } else {
        await adminCreateAttributeValue(adminToken, payload);
        await Swal.fire({ icon: "success", title: "Attribute value created", timer: 1500 });
      }
      resetForm();
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Save failed", text: e.message || "Could not save attribute value." });
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row) => {
    setEditId(row._id);
    setForm({
      value: row.value || "",
      colorCode: row.colorCode || "",
      attributeTitle: row.attributeTitle?._id || row.attributeTitle || "",
      category: row.attributeTitle?.category?._id || row.attributeTitle?.category || "",
      subCategory: row.attributeTitle?.subCategory?._id || row.attributeTitle?.subCategory || "",
    });
  };

  const onDelete = async (row) => {
    if (editId) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete attribute value?",
      text: `This will delete "${row.value}".`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeleteAttributeValue(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Attribute value deleted", timer: 1500 });
      if (editId === row._id) resetForm();
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: e.message || "Could not delete attribute value." });
    }
  };

  const onToggleStatus = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingId(row._id);
    try {
      await adminUpdateAttributeValue(adminToken, row._id, { status: nextStatus });
      await Swal.fire({
        icon: "success",
        title: nextStatus === "active" ? "Attribute value activated" : "Attribute value deactivated",
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
          <h2 className="page-card__title">{editId ? "Edit Attribute Value" : "Create Attribute Value"}</h2>
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
                onChange={(e) =>
                  setForm((p) => ({ ...p, category: e.target.value, subCategory: "", attributeTitle: "" }))
                }
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
                onChange={(e) =>
                  setForm((p) => ({ ...p, subCategory: e.target.value, attributeTitle: "" }))
                }
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
              <span className="user-field__label">Attribute Title <span className="required-dot">*</span></span>
              <select
                className="user-field__input"
                value={form.attributeTitle}
                onChange={(e) =>
                  setForm((p) => ({ ...p, attributeTitle: e.target.value, colorCode: "" }))
                }
                required
                disabled={!form.subCategory}
              >
                <option value="">{form.subCategory ? "Select attribute title" : "Select a sub-category first"}</option>
                {titles.map((title) => (
                  <option key={title._id} value={title._id}>
                    {titleOptionLabel(title)}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>
                  Value <span className="required-dot">*</span>
                </span>
                <small>
                  {form.value.length}/{VALUE_MAX_LEN}
                </small>
              </span>
              <input
                className="user-field__input"
                value={form.value}
                onChange={(e) => setForm((p) => ({ ...p, value: sanitizeValueInput(e.target.value) }))}
                maxLength={VALUE_MAX_LEN}
                required
              />
            </label>
            {showColorCode ? (
              <label className="user-field col-12 col-md-4">
                <span className="user-field__label">Color code</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="color"
                    value={
                      /^#[0-9A-Fa-f]{6}$/.test(form.colorCode)
                        ? form.colorCode
                        : "#ffffff"
                    }
                    onChange={(e) => setForm((p) => ({ ...p, colorCode: e.target.value.toUpperCase() }))}
                    style={{ width: 48, height: 40, padding: 2, cursor: "pointer" }}
                    aria-label="Pick color"
                  />
                  <input
                    className="user-field__input"
                    value={form.colorCode}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, colorCode: sanitizeColorCodeInput(e.target.value).toUpperCase() }))
                    }
                    placeholder="#FFFFFF"
                    maxLength={7}
                  />
                </div>
                <small className="text-muted">Hex code for mobile color swatch (e.g. #FFFFFF)</small>
              </label>
            ) : null}
          </div>
          <div className="user-form__actions">
            {editId ? (
              <button type="button" className="btn btn--ghost" onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? "Saving…" : editId ? "Update Attribute Value" : "Create Attribute Value"}
            </button>
          </div>
        </form>
      </div>

      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">Attribute Values</h2>
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
                <th>Attribute Title</th>
                <th>Value</th>
                <th>Color code</th>
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
                  <td colSpan={8}>No attribute values found.</td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row._id}>
                    <td className="data-table__muted">{idx + 1}</td>
                    <td>{row.attributeTitle?.category?.name || "—"}</td>
                    <td>{row.attributeTitle?.subCategory?.name || "—"}</td>
                    <td>{row.attributeTitle?.title || "—"}</td>
                    <td>{row.value}</td>
                    <td>
                      {row.colorCode ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 4,
                              background: row.colorCode,
                              border: "1px solid #ccc",
                              display: "inline-block",
                            }}
                            aria-hidden
                          />
                          {row.colorCode}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`}
                        role="switch"
                        aria-checked={row.status === "active"}
                        aria-label={`Toggle status for ${row.value}`}
                        onClick={() => onToggleStatus(row)}
                        disabled={togglingId === row._id}
                        title={row.status === "active" ? "Deactivate attribute value" : "Activate attribute value"}
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
