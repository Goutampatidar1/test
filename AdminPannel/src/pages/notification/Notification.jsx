import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { MdEditSquare, MdGroups } from "react-icons/md";
import { AiFillDelete, AiOutlineEye } from "react-icons/ai";
import { IoSendOutline, IoStorefrontOutline } from "react-icons/io5";
import { TbTruckDelivery } from "react-icons/tb";
import {
  adminCreateNotification,
  adminDeleteNotification,
  adminListNotifications,
  adminUpdateNotification,
} from "../../api/notificationController.js";
import { logout } from "../../store/authSlice.js";
import { mediaUrl } from "../../media.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";

const AUDIENCE_OPTIONS = [
  { value: "users", label: "Users", icon: <MdGroups size={16} /> },
  { value: "vendors", label: "Vendors", icon: <IoStorefrontOutline size={16} /> },
  { value: "deliveryPartners", label: "Delivery Partners", icon: <TbTruckDelivery size={16} /> },
];
const VENDOR_TARGET_OPTIONS = [
  { value: "ecom", label: "Ecom vendors" },
  { value: "venue", label: "Service vendors" },
];
const LIST_LIMIT = 10;
const IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const MESSAGE_MAX_LEN = 1000;

function emptyForm(audienceType) {
  return {
    audienceType,
    kind: "notification",
    vendorTargetTypes: ["ecom", "venue"],
    message: "",
    status: "active",
  };
}

function sanitizeMessageInput(value) {
  return String(value ?? "").replace(/\s+/g, " ").slice(0, MESSAGE_MAX_LEN);
}

function audienceLabel(type) {
  return AUDIENCE_OPTIONS.find((x) => x.value === type)?.label || "Audience";
}

function kindLabel(kind) {
  return kind === "announcement" ? "Announcement" : "Notification";
}

function vendorTargetLabel(targets = []) {
  const set = new Set((targets || []).map((item) => String(item)));
  const hasEcom = set.has("ecom");
  const hasVenue = set.has("venue");
  if (hasEcom && hasVenue) return "Both vendors";
  if (hasEcom) return "Ecom vendors";
  if (hasVenue) return "Service vendors";
  return "—";
}

export function NotificationPage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);

  const [sendAudience, setSendAudience] = useState("users");
  const [listAudience, setListAudience] = useState("users");
  const [form, setForm] = useState(emptyForm("users"));
  const [editId, setEditId] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewRow, setViewRow] = useState(null);
  const fileInputRef = useRef(null);

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const { notifications, pagination } = await adminListNotifications(adminToken, {
        page,
        limit: LIST_LIMIT,
        audienceType: listAudience,
      });
      setRows(notifications);
      setPages(pagination?.pages ?? 1);
      setTotal(pagination?.total ?? 0);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Load failed",
        text: e.message || "Failed to load notifications.",
      });
    } finally {
      setLoading(false);
    }
  }, [adminToken, dispatch, listAudience, page]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    setPage(1);
  }, [listAudience]);

  const applyAnnouncementRow = useCallback((row) => {
    setEditId(row._id);
    setSendAudience("vendors");
    setForm({
      audienceType: "vendors",
      kind: "announcement",
      vendorTargetTypes:
        Array.isArray(row.vendorTargetTypes) && row.vendorTargetTypes.length
          ? row.vendorTargetTypes
          : ["ecom", "venue"],
      message: row.message || "",
      status: row.status === "inactive" ? "inactive" : "active",
    });
    setImageFile(null);
    setImagePreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const loadExistingAnnouncement = useCallback(async () => {
    if (!adminToken) return null;
    const { notifications } = await adminListNotifications(adminToken, {
      page: 1,
      limit: 1,
      audienceType: "vendors",
      kind: "announcement",
    });
    return notifications[0] || null;
  }, [adminToken]);

  const resetForm = useCallback(() => {
    setEditId("");
    setForm(emptyForm(sendAudience));
    setImageFile(null);
    setImagePreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [sendAudience]);

  const startAnnouncementForm = useCallback(async () => {
    setSendAudience("vendors");
    setImageFile(null);
    setImagePreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    try {
      const existing = await loadExistingAnnouncement();
      if (existing) {
        applyAnnouncementRow(existing);
        return;
      }
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
    }
    setEditId("");
    setForm({
      ...emptyForm("vendors"),
      kind: "announcement",
      status: "active",
    });
  }, [applyAnnouncementRow, dispatch, loadExistingAnnouncement]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!adminToken) return;

    const message = sanitizeMessageInput(form.message).trim();
    if (!message) {
      await Swal.fire({
        icon: "error",
        title: "Validation error",
        text: form.kind === "announcement" ? "Announcement message is required." : "Notification message is required.",
      });
      return;
    }

    if (form.kind === "announcement") {
      if (form.audienceType !== "vendors") {
        await Swal.fire({
          icon: "error",
          title: "Validation error",
          text: "Announcements can only be sent to vendors.",
        });
        return;
      }
      if (!form.vendorTargetTypes?.length) {
        await Swal.fire({
          icon: "error",
          title: "Validation error",
          text: "Select ecom vendors, service vendors, or both.",
        });
        return;
      }
    }

    const payload = {
      audienceType: form.audienceType,
      kind: form.kind === "announcement" ? "announcement" : "notification",
      vendorTargetTypes: form.kind === "announcement" ? form.vendorTargetTypes : [],
      message,
      status: form.status || "active",
    };
    const nextImageFile = payload.kind === "announcement" ? null : imageFile;

    setSaving(true);
    try {
      if (editId) {
        await adminUpdateNotification(adminToken, editId, payload, nextImageFile);
        await Swal.fire({
          icon: "success",
          title: payload.kind === "announcement" ? "Announcement updated" : "Notification updated",
          timer: 1500,
        });
      } else {
        await adminCreateNotification(adminToken, payload, nextImageFile);
        await Swal.fire({
          icon: "success",
          title: payload.kind === "announcement" ? "Announcement sent" : "Notification sent",
          timer: 1500,
        });
      }
      await loadRows();
      if (payload.kind === "announcement") {
        await startAnnouncementForm();
      } else {
        resetForm();
      }
    } catch (e2) {
      if (e2?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Save failed",
        text: e2.message || "Could not save notification.",
      });
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row) => {
    if (row.kind === "announcement") {
      applyAnnouncementRow(row);
      return;
    }
    const nextAudience = row.audienceType || "users";
    setEditId(row._id);
    setSendAudience(nextAudience);
    setForm({
      audienceType: nextAudience,
      kind: "notification",
      vendorTargetTypes: ["ecom", "venue"],
      message: row.message || "",
      status: row.status || "active",
    });
    setImageFile(null);
    setImagePreview(row.image ? mediaUrl(row.image) : "");
  };

  const onDelete = async (row) => {
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete notification?",
      text: "This action cannot be undone.",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeleteNotification(adminToken, row._id);
      await Swal.fire({
        icon: "success",
        title: "Notification deleted",
        timer: 1500,
      });
      if (editId === row._id) resetForm();
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Delete failed",
        text: e.message || "Could not delete notification.",
      });
    }
  };

  const onToggleStatus = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingId(row._id);
    try {
      await adminUpdateNotification(adminToken, row._id, { status: nextStatus });
      await Swal.fire({ icon: "success", title: "Notification status updated", timer: 1500 });
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Status update failed",
        text: e.message || "Could not update status.",
      });
    } finally {
      setTogglingId("");
    }
  };

  return (
    <div className="user-page">
      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">Send Notifications</h2>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              background: "#efeff4",
              borderRadius: 999,
              padding: 4,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 4,
            }}
          >
            {AUDIENCE_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setSendAudience(item.value);
                  setForm((p) => ({
                    ...p,
                    audienceType: item.value,
                    kind: item.value === "vendors" ? p.kind : "notification",
                    vendorTargetTypes: p.vendorTargetTypes?.length ? p.vendorTargetTypes : ["ecom", "venue"],
                  }));
                }}
                style={{
                  border: 0,
                  borderRadius: 999,
                  padding: "8px 10px",
                  background: sendAudience === item.value ? "#fff" : "transparent",
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit}>
            <div className="row g-3">
              {sendAudience === "vendors" ? (
                <div className="col-12">
                  <span className="user-field__label d-block mb-2">Type</span>
                  <div className="d-flex flex-wrap gap-2">
                    {[
                      { value: "notification", label: "Notification" },
                      { value: "announcement", label: "Announcement" },
                    ].map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        className={`btn${form.kind === item.value ? " btn--primary" : " btn--ghost"}`}
                        onClick={() => {
                          if (item.value === "announcement") {
                            void startAnnouncementForm();
                            return;
                          }
                          setEditId("");
                          setForm((p) => ({
                            ...emptyForm("vendors"),
                            kind: "notification",
                            message: p.kind === "announcement" ? "" : p.message,
                          }));
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {sendAudience === "vendors" && form.kind === "announcement" ? (
                <div className="col-12">
                  <span className="user-field__label d-block mb-2">
                    Show announcement for <span className="required-dot">*</span>
                  </span>
                  <div className="d-flex flex-wrap gap-3">
                    {VENDOR_TARGET_OPTIONS.map((item) => {
                      const checked = (form.vendorTargetTypes || []).includes(item.value);
                      return (
                        <label key={item.value} className="d-inline-flex align-items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setForm((p) => {
                                const next = new Set(p.vendorTargetTypes);
                                if (next.has(item.value)) next.delete(item.value);
                                else next.add(item.value);
                                return { ...p, vendorTargetTypes: [...next] };
                              });
                            }}
                          />
                          {item.label}
                        </label>
                      );
                    })}
                  </div>
                  <small className="data-table__muted">Select ecom, service, or both. Only one announcement is kept.</small>
                </div>
              ) : null}

              {form.kind === "announcement" ? (
                <label className="user-field col-12 col-md-4">
                  <span className="user-field__label">
                    Status <span className="required-dot">*</span>
                  </span>
                  <select
                    className="user-field__input"
                    value={form.status || "active"}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <small className="data-table__muted">Inactive hides the scrolling message.</small>
                </label>
              ) : null}

              <label className="user-field col-12 ">
                <span className="user-field__label">
                  {form.kind === "announcement" ? "Announcement Message" : "Notification Message"}{" "}
                  <span className="required-dot">*</span>
                </span>
                <textarea
                  className="user-field__input"
                  rows={3}
                  value={form.message}
                  maxLength={MESSAGE_MAX_LEN}
                  onChange={(e) => setForm((p) => ({ ...p, message: sanitizeMessageInput(e.target.value) }))}
                  placeholder={
                    form.kind === "announcement"
                      ? "Enter the scrolling announcement for vendors..."
                      : `Enter your message for ${audienceLabel(sendAudience).toLowerCase()}...`
                  }
                  required
                />
                <small className="data-table__muted">
                  {form.message.length}/{MESSAGE_MAX_LEN}
                </small>
              </label>

   
          {form.kind !== "announcement" ? (
          <label className="user-field col-12 col-md-6">
                <span className="user-field__label">Add Image</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (file && file.size > IMAGE_MAX_SIZE_BYTES) {
                      setImageFile(null);
                      setImagePreview("");
                      e.target.value = "";
                      void Swal.fire({
                        icon: "error",
                        title: "Validation error",
                        text: "Image size must be 5 MB or less.",
                      });
                      return;
                    }
                    setImageFile(file);
                    setImagePreview(file ? URL.createObjectURL(file) : "");
                  }}
                />
              </label>
          ) : null}
          
            </div>

            {form.kind !== "announcement" && imagePreview ? (
              <div style={{ marginTop: 6 }}>
                <img
                  src={imagePreview}
                  alt="Notification preview"
                  style={{ width: 100, height: 60, objectFit: "cover", borderRadius: 8 }}
                />
              </div>
            ) : null}

            <div className="user-form__actions">
              {editId && form.kind !== "announcement" ? (
                <button type="button" className="btn btn--ghost" onClick={resetForm}>
                  Cancel edit
                </button>
              ) : null}
              <button type="submit" className="btn btn--primary" disabled={saving}>
                <IoSendOutline size={16} />
                {saving
                  ? "Saving..."
                  : form.kind === "announcement"
                  ? editId
                    ? "Update announcement"
                    : "Save announcement"
                  : editId
                  ? `Update for ${audienceLabel(sendAudience)}`
                  : `Send to All ${audienceLabel(sendAudience)}`}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">Notifications List</h2>
        </div>

        <div
          style={{
            background: "#efeff4",
            borderRadius: 999,
            padding: 4,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 4,
            marginBottom: 10,
          }}
        >
          {AUDIENCE_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setListAudience(item.value)}
              style={{
                border: 0,
                borderRadius: 999,
                padding: "8px 10px",
                background: listAudience === item.value ? "#fff" : "transparent",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {item.icon}
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
                <th>Type</th>
                {listAudience === "vendors" ? <th>For</th> : null}
                <th>Message</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={listAudience === "vendors" ? 7 : 6}>Loading...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={listAudience === "vendors" ? 7 : 6}>No notifications found.</td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <ClickableTableRow key={row._id} onOpen={() => setViewRow(row)}>
                    <td className="data-table__muted">{(page - 1) * LIST_LIMIT + idx + 1}</td>
                    <td>
                      {row.image ? (
                        <img
                          src={mediaUrl(row.image)}
                          alt=""
                          style={{ width: 56, height: 42, objectFit: "cover", borderRadius: 6 }}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{kindLabel(row.kind)}</td>
                    {listAudience === "vendors" ? (
                      <td>{row.kind === "announcement" ? vendorTargetLabel(row.vendorTargetTypes) : "—"}</td>
                    ) : null}
                    <td>{row.message || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`}
                        role="switch"
                        aria-checked={row.status === "active"}
                        aria-label={`Toggle status for notification ${idx + 1}`}
                        onClick={() => onToggleStatus(row)}
                        disabled={togglingId === row._id}
                      >
                        <span className="settings-switch__knob" aria-hidden />
                      </button>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-btn icon-btn--view"
                          title="View"
                          onClick={() => setViewRow(row)}
                        >
                          <AiOutlineEye size={18} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn--edit"
                          title="Edit"
                          onClick={() => onEdit(row)}
                        >
                          <MdEditSquare size={18} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn--delete"
                          title="Delete"
                          onClick={() => onDelete(row)}
                        >
                          <AiFillDelete size={18} />
                        </button>
                      </div>
                    </td>
                  </ClickableTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>

        <ListPagination page={page} pages={pages} total={total} onPageChange={setPage} />
      </div>

      {viewRow ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setViewRow(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            className="page-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="page-card__head" style={{ marginBottom: 12 }}>
              <h2 className="page-card__title">
                {viewRow.kind === "announcement" ? "Announcement Details" : "Notification Details"}
              </h2>
              <button type="button" className="btn btn--ghost" onClick={() => setViewRow(null)}>
                Close
              </button>
            </div>
            {viewRow.image ? (
              <div style={{ marginBottom: 12 }}>
                <img
                  src={mediaUrl(viewRow.image)}
                  alt="Notification"
                  style={{ width: "100%", maxHeight: 250, objectFit: "cover", borderRadius: 8 }}
                />
              </div>
            ) : null}
            <div className="row g-2">
              <div className="col-12">
                <strong>Audience:</strong> {audienceLabel(viewRow.audienceType)}
              </div>
              <div className="col-12">
                <strong>Type:</strong> {kindLabel(viewRow.kind)}
              </div>
              {viewRow.kind === "announcement" ? (
                <div className="col-12">
                  <strong>For:</strong> {vendorTargetLabel(viewRow.vendorTargetTypes)}
                </div>
              ) : null}
              <div className="col-12">
                <strong>Message:</strong> {viewRow.message || "—"}
              </div>
              <div className="col-6">
                <strong>Status:</strong> {viewRow.status || "—"}
              </div>
              <div className="col-6">
                <strong>Sent:</strong> {viewRow.sentAt ? new Date(viewRow.sentAt).toLocaleString() : "—"}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
