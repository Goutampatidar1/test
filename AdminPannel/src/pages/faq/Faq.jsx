import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete, AiOutlineEye } from "react-icons/ai";
import { adminCreateFaq, adminDeleteFaq, adminListFaqs, adminUpdateFaq } from "../../api/faqController.js";
import { logout } from "../../store/authSlice.js";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";

function emptyForm() {
  return { question: "", answer: "" };
}

const QUESTION_MAX_LEN = 160;
const ANSWER_MAX_LEN = 2000;
const QUESTION_PREVIEW_LEN = 50;
const ANSWER_PREVIEW_LEN = 80;

function sanitizeQuestionInput(value) {
  return String(value ?? "").replace(/\s+/g, " ").slice(0, QUESTION_MAX_LEN);
}

function sanitizeAnswerInput(value) {
  return String(value ?? "").replace(/\s+/g, " ").slice(0, ANSWER_MAX_LEN);
}

function validateFaqForm(form) {
  const question = String(form.question ?? "").trim();
  const answer = String(form.answer ?? "").trim();
  if (!question || !answer) {
    return "Question and answer are required.";
  }
  if (question.length > QUESTION_MAX_LEN) {
    return `Question cannot exceed ${QUESTION_MAX_LEN} characters.`;
  }
  if (answer.length > ANSWER_MAX_LEN) {
    return `Answer cannot exceed ${ANSWER_MAX_LEN} characters.`;
  }
  return "";
}

function truncateText(value, maxLen) {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

export function FaqPage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState("");
  const [togglingId, setTogglingId] = useState("");
  const [viewRow, setViewRow] = useState(null);

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const { faqs } = await adminListFaqs(adminToken, { page: 1, limit: 200 });
      setRows(faqs);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: e.message || "Failed to load FAQs." });
    } finally {
      setLoading(false);
    }
  }, [adminToken, dispatch]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditId("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!adminToken) return;
    const validationError = validateFaqForm(form);
    if (validationError) {
      await Swal.fire({ icon: "error", title: "Validation error", text: validationError });
      return;
    }

    const payload = {
      question: form.question.trim(),
      answer: form.answer.trim(),
      status: "active",
    };

    setSaving(true);
    try {
      if (editId) {
        await adminUpdateFaq(adminToken, editId, payload);
        await Swal.fire({ icon: "success", title: "FAQ updated", timer: 1500 });
      } else {
        await adminCreateFaq(adminToken, payload);
        await Swal.fire({ icon: "success", title: "FAQ created", timer: 1500 });
      }
      resetForm();
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Save failed", text: e.message || "Could not save FAQ." });
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row) => {
    setEditId(row._id);
    setForm({
      question: row.question || "",
      answer: row.answer || "",
    });
  };

  const onDelete = async (row) => {
    if (editId) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete FAQ?",
      text: "This action cannot be undone.",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeleteFaq(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "FAQ deleted", timer: 1500 });
      if (editId === row._id) resetForm();
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: e.message || "Could not delete FAQ." });
    }
  };

  const onToggleStatus = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingId(row._id);
    try {
      await adminUpdateFaq(adminToken, row._id, { status: nextStatus });
      await Swal.fire({
        icon: "success",
        title: nextStatus === "active" ? "FAQ activated" : "FAQ deactivated",
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
      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">{editId ? "Edit FAQ" : "Create FAQ"}</h2>
        </div>
        <form onSubmit={onSubmit}>
          <div className="row g-3">
            <label className="user-field col-12">
              <span className="user-field__label" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>
                  Question <span className="required-dot">*</span>
                </span>
                <small>{form.question.length}/{QUESTION_MAX_LEN}</small>
              </span>
              <input
                className="user-field__input"
                value={form.question}
                onChange={(e) => setForm((p) => ({ ...p, question: sanitizeQuestionInput(e.target.value) }))}
                maxLength={QUESTION_MAX_LEN}
                required
              />
            </label>
            <label className="user-field col-12">
              <span className="user-field__label" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>
                  Answer <span className="required-dot">*</span>
                </span>
                <small>{form.answer.length}/{ANSWER_MAX_LEN}</small>
              </span>
              <textarea
                className="user-field__input"
                rows={4}
                value={form.answer}
                onChange={(e) => setForm((p) => ({ ...p, answer: sanitizeAnswerInput(e.target.value) }))}
                maxLength={ANSWER_MAX_LEN}
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
              {saving ? "Saving..." : editId ? "Update FAQ" : "Create FAQ"}
            </button>
          </div>
        </form>
      </div>

      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">FAQs</h2>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>S No.</th>
                <th>Question</th>
                <th>Answer</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>Loading...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5}>No FAQs found.</td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <ClickableTableRow key={row._id} onOpen={() => setViewRow(row)}>
                    <td className="data-table__muted">{idx + 1}</td>
                    <td title={row.question || ""}>{truncateText(row.question, QUESTION_PREVIEW_LEN)}</td>
                    <td title={row.answer || ""}>{truncateText(row.answer, ANSWER_PREVIEW_LEN)}</td>
                    <td>
                      <button
                        type="button"
                        className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`}
                        role="switch"
                        aria-checked={row.status === "active"}
                        aria-label={`Toggle status for FAQ ${idx + 1}`}
                        onClick={() => onToggleStatus(row)}
                        disabled={togglingId === row._id}
                        title={row.status === "active" ? "Deactivate FAQ" : "Activate FAQ"}
                      >
                        <span className="settings-switch__knob" aria-hidden />
                      </button>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-btn icon-btn--view" title="View" onClick={() => setViewRow(row)}>
                          <AiOutlineEye size={18} />
                        </button>
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
                  </ClickableTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
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
            style={{ width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto", overflowX: "hidden" }}
          >
            <div className="page-card__head" style={{ marginBottom: 12 }}>
              <h2 className="page-card__title">FAQ Details</h2>
              <button type="button" className="btn btn--ghost" onClick={() => setViewRow(null)}>
                Close
              </button>
            </div>
            <div className="row g-2">
              <div className="col-12">
                <strong>Question:</strong>{" "}
                <span style={{ overflowWrap: "anywhere", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                  {viewRow.question || "—"}
                </span>
              </div>
              <div className="col-12">
                <strong>Answer:</strong>{" "}
                <span style={{ overflowWrap: "anywhere", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                  {viewRow.answer || "—"}
                </span>
              </div>
              <div className="col-6">
                <strong>Status:</strong> {viewRow.status || "—"}
              </div>
              <div className="col-6">
                <strong>Created:</strong> {viewRow.createdAt ? new Date(viewRow.createdAt).toLocaleString() : "—"}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
