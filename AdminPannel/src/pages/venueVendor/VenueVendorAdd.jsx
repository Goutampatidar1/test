import { useEffect, useId, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import { adminCreateVenueVendor, adminUpdateVenueVendor } from "../../api/adminVenueVendors.js";
import { ProfileImagePlaceholder } from "../../components/ProfileImagePlaceholder.jsx";
import { logout } from "../../store/authSlice.js";
import { mediaUrl } from "../../media.js";
import { isValidEmail, sanitizePhoneInput, validateIndianMobileMessage } from "../../utils/validation.js";

const ACCOUNT_NO_REGEX = /^\d{9,18}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function MandatoryDot() {
  return <span className="required-dot">*</span>;
}

function revokeIfBlob(url) {
  if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
}

function collectPersonalTabErrors(values) {
  const errors = [];
  const name = values.name.trim();
  const email = values.email.trim();
  const phone = values.phone.trim();

  if (!name) errors.push("Full name");
  if (email && !isValidEmail(email)) errors.push("Valid email address");
  const phoneError = validateIndianMobileMessage(phone, { required: true, label: "Mobile number" });
  if (phoneError) errors.push(phoneError);

  return errors;
}

function collectBusinessTabErrors(values) {
  const errors = [];
  const businessPhone = values.businessPhone.trim();
  const businessEmail = values.businessEmail.trim();
  const panNumber = values.panNumber.trim().toUpperCase();
  const gstNumber = values.gstNumber.trim().toUpperCase();

  if (!values.businessName.trim()) errors.push("Business name");
  if (!values.businessAddress.trim()) errors.push("Address");

  if (businessPhone) {
    const businessPhoneError = validateIndianMobileMessage(businessPhone, {
      required: false,
      label: "Business mobile number",
    });
    if (businessPhoneError) errors.push(businessPhoneError);
  }
  if (businessEmail && !isValidEmail(businessEmail)) {
    errors.push("Valid business email address");
  }
  if (panNumber && !PAN_REGEX.test(panNumber)) errors.push("Valid PAN number");
  if (gstNumber && !GSTIN_REGEX.test(gstNumber)) errors.push("Valid GST number");

  return errors;
}

function collectBankTabErrors(values) {
  const errors = [];
  const accountNumber = values.accountNumber.trim();
  const ifscCode = values.ifscCode.trim().toUpperCase();

  if (accountNumber && !ACCOUNT_NO_REGEX.test(accountNumber)) {
    errors.push("Valid account number (9–18 digits)");
  }
  if (ifscCode && !IFSC_REGEX.test(ifscCode)) errors.push("Valid IFSC code");

  return errors;
}

function tabValidationFailure(tabId, errors) {
  const list = errors.map((field) => `• ${field}`).join("\n");
  return {
    tab: tabId,
    message: errors[0],
    errors,
    blockedMessage: `Can't move to the next step. Please complete the required fields on this tab:\n\n${list}`,
  };
}

function collectDocumentsTabErrors(values, { docFiles = {}, mode = "create" } = {}) {
  const errors = [];
  const hasFront = Boolean(
    docFiles.aadhaarCardFront || String(values.aadhaarCardFront || values.aadhaarCard || "").trim()
  );
  const hasBack = Boolean(docFiles.aadhaarCardBack || String(values.aadhaarCardBack || "").trim());
  // Documents are only required when creating / final save — never while browsing earlier tabs.
  if (mode === "create" || mode === "edit") {
    if (!hasFront) errors.push("Aadhaar front");
    if (!hasBack) errors.push("Aadhaar back");
  }
  return errors;
}

function validateVenueVendorTab(values, tabId, options = {}) {
  if (tabId === "personal") {
    const errors = collectPersonalTabErrors(values);
    return errors.length ? tabValidationFailure("personal", errors) : null;
  }
  if (tabId === "business") {
    const errors = collectBusinessTabErrors(values);
    return errors.length ? tabValidationFailure("business", errors) : null;
  }
  if (tabId === "bank") {
    const errors = collectBankTabErrors(values);
    return errors.length ? tabValidationFailure("bank", errors) : null;
  }
  if (tabId === "documents") {
    const errors = collectDocumentsTabErrors(values, options);
    return errors.length ? tabValidationFailure("documents", errors) : null;
  }
  return null;
}

/** Tabs checked while moving forward in the wizard (documents only on final submit). */
const WIZARD_STEP_IDS = ["personal", "business", "bank"];

function validate(values, { mode = "create", docFiles } = {}) {
  for (const tabId of [...WIZARD_STEP_IDS, "documents"]) {
    const error = validateVenueVendorTab(values, tabId, { mode, docFiles });
    if (error) return error;
  }
  return null;
}

function emptyForm() {
  return {
    name: "",
    email: "",
    phone: "",
    businessName: "",
    businessPhone: "",
    businessEmail: "",
    businessAddress: "",
    businessDescription: "",
    panNumber: "",
    gstNumber: "",
    bankName: "",
    branchName: "",
    accountType: "",
    accountNumber: "",
    ifscCode: "",
    aadhaarCardFront: "",
    aadhaarCardBack: "",
    aadhaarCard: "",
    panCard: "",
    status: "active",
    approvalStatus: "pending",
  };
}

function toForm(vendor) {
  if (!vendor) return emptyForm();
  return {
    ...emptyForm(),
    name: vendor.name ?? "",
    email: vendor.email ?? "",
    phone: vendor.phone ?? "",
    businessName: vendor.businessName ?? "",
    businessPhone: vendor.businessPhone ?? "",
    businessEmail: vendor.businessEmail ?? "",
    businessAddress: vendor.businessAddress ?? "",
    businessDescription: vendor.businessDescription ?? "",
    panNumber: vendor.panNumber ?? "",
    gstNumber: vendor.gstNumber ?? "",
    bankName: vendor.bankName ?? "",
    branchName: vendor.branchName ?? "",
    accountType: vendor.accountType ?? "",
    accountNumber: vendor.accountNumber ?? "",
    ifscCode: vendor.ifscCode ?? "",
    aadhaarCardFront: vendor.aadhaarCardFront ?? vendor.aadhaarCard ?? "",
    aadhaarCardBack: vendor.aadhaarCardBack ?? "",
    aadhaarCard: vendor.aadhaarCard ?? "",
    panCard: vendor.panCard ?? "",
    status: vendor.status ?? "active",
    approvalStatus: vendor.approvalStatus ?? "pending",
  };
}

export function VenueVendorProfileForm({ mode = "create", venueVendorId = "", initialVenueVendor = null, onCancel, onSuccess }) {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [values, setValues] = useState(() => (initialVenueVendor ? toForm(initialVenueVendor) : emptyForm()));
  const [profileFile, setProfileFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState("personal");
  const [formError, setFormError] = useState("");
  const [docFieldError, setDocFieldError] = useState("");
  const tabs = [
    { id: "personal", label: "Personal Details" },
    { id: "business", label: "Business Details" },
    { id: "bank", label: "Bank Details" },
    { id: "documents", label: "Documents Upload" },
  ];
  const tabIndex = tabs.findIndex((t) => t.id === tab);
  const isFirstTab = tabIndex <= 0;
  const isLastTab = tabIndex === tabs.length - 1;
  const fileInputRef = useRef(null);
  const fileInputId = useId();
  const [docPreviews, setDocPreviews] = useState({ aadhaarCardFront: "", aadhaarCardBack: "", panCard: "" });
  const [docFiles, setDocFiles] = useState({ aadhaarCardFront: null, aadhaarCardBack: null, panCard: null });

  useEffect(() => {
    // Create mode: keep local draft state; do not wipe uploads on remount noise.
    if (!initialVenueVendor) return;
    setValues(toForm(initialVenueVendor));
    setProfileFile(null);
    setPreviewUrl(null);
    setDocPreviews({
      aadhaarCardFront: mediaUrl(initialVenueVendor.aadhaarCardFront || initialVenueVendor.aadhaarCard),
      aadhaarCardBack: mediaUrl(initialVenueVendor.aadhaarCardBack),
      panCard: mediaUrl(initialVenueVendor.panCard),
    });
    setDocFiles({ aadhaarCardFront: null, aadhaarCardBack: null, panCard: null });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [initialVenueVendor]);

  useEffect(() => {
    if (!profileFile) return;
    const url = URL.createObjectURL(profileFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [profileFile]);

  const handleChange = (field) => (e) => setValues((prev) => ({ ...prev, [field]: e.target.value }));
  const handlePhoneInput = (field) => (e) => setValues((prev) => ({ ...prev, [field]: sanitizePhoneInput(e.target.value) }));
  const handleAccountInput = (e) => setValues((prev) => ({ ...prev, accountNumber: e.target.value.replace(/\D+/g, "").slice(0, 18) }));
  const handleIfscInput = (e) => setValues((prev) => ({ ...prev, ifscCode: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 11) }));
  const handlePanInput = (e) => setValues((prev) => ({ ...prev, panNumber: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) }));
  const handleGstInput = (e) => setValues((prev) => ({ ...prev, gstNumber: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 15) }));

  const handleDocFile = (field, file) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setDocFieldError("File size must be 5 MB or less.");
      return;
    }
    const url = URL.createObjectURL(file);
    setDocFiles((prev) => ({ ...prev, [field]: file }));
    setDocPreviews((prev) => {
      revokeIfBlob(prev[field]);
      return { ...prev, [field]: url };
    });
    setDocFieldError("");
    setFormError("");
  };

  const handleRemoveDoc = (field) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDocFiles((prev) => ({ ...prev, [field]: null }));
    setDocPreviews((prev) => {
      revokeIfBlob(prev[field]);
      return { ...prev, [field]: "" };
    });
    setValues((prev) => ({ ...prev, [field]: "" }));
  };

  const avatar = previewUrl || mediaUrl(initialVenueVendor?.profileImage);

  const showNavBlocked = async (validationError) => {
    const message = validationError.blockedMessage || validationError.message;
    setFormError(message);
    await Swal.fire({
      icon: "warning",
      title: "Can't move to next",
      text: message,
    });
  };

  const goToPreviousTab = () => {
    if (isFirstTab) return;
    setFormError("");
    setTab(tabs[tabIndex - 1].id);
  };

  const goToTab = async (targetTabId) => {
    const targetIndex = tabs.findIndex((t) => t.id === targetTabId);
    if (targetIndex < 0 || targetIndex === tabIndex) return;

    if (targetIndex < tabIndex) {
      setFormError("");
      setTab(targetTabId);
      return;
    }

    // Forward navigation: validate only wizard steps being left — never Documents.
    for (let i = tabIndex; i < targetIndex; i += 1) {
      const stepId = tabs[i].id;
      if (stepId === "documents" || !WIZARD_STEP_IDS.includes(stepId)) continue;
      const validationError = validateVenueVendorTab(values, stepId, { mode, docFiles });
      if (validationError) {
        setTab(stepId);
        await showNavBlocked(validationError);
        return;
      }
    }

    setFormError("");
    setTab(targetTabId);
  };

  const goToNextTab = async () => {
    if (isLastTab) return;
    const currentId = tabs[tabIndex]?.id;
    // Leaving Bank → Documents must not require Aadhaar yet.
    if (currentId && currentId !== "documents" && WIZARD_STEP_IDS.includes(currentId)) {
      const validationError = validateVenueVendorTab(values, currentId, { mode, docFiles });
      if (validationError) {
        await showNavBlocked(validationError);
        return;
      }
    }
    setFormError("");
    setTab(tabs[tabIndex + 1].id);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!adminToken) return setFormError("You are not signed in.");

    // Enter / accidental submit on earlier create steps: advance only, never require Aadhaar yet.
    if (mode === "create" && !isLastTab) {
      await goToNextTab();
      return;
    }

    const error = validate(values, { mode, docFiles });
    if (error) {
      setTab(error.tab);
      setFormError(error.blockedMessage || error.message);
      await Swal.fire({ icon: "error", title: "Validation error", text: error.blockedMessage || error.message });
      return;
    }

    const payload = {
      ...values,
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      businessName: values.businessName.trim(),
      businessPhone: values.businessPhone.trim(),
      businessEmail: values.businessEmail.trim(),
      panNumber: values.panNumber.trim().toUpperCase(),
      gstNumber: values.gstNumber.trim().toUpperCase(),
      bankName: values.bankName.trim(),
      accountNumber: values.accountNumber.trim(),
      ifscCode: values.ifscCode.trim().toUpperCase(),
      // Keep existing remote paths for edit; new files go via uploadFiles.
      aadhaarCardFront: values.aadhaarCardFront || values.aadhaarCard || "",
      aadhaarCardBack: values.aadhaarCardBack || "",
      aadhaarCard: values.aadhaarCardFront || values.aadhaarCard || "",
      panCard: values.panCard || "",
    };

    setSubmitting(true);
    try {
      const uploadFiles = {
        file: profileFile,
        aadhaarCardFront: docFiles.aadhaarCardFront,
        aadhaarCardBack: docFiles.aadhaarCardBack,
        panCard: docFiles.panCard,
      };
      let row;
      if (mode === "create") row = await adminCreateVenueVendor(adminToken, payload, uploadFiles);
      else row = await adminUpdateVenueVendor(adminToken, venueVendorId, payload, uploadFiles);
      onSuccess?.(row);
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      const message = err.message || "Request failed.";
      setFormError(message);
      await Swal.fire({ icon: "error", title: "Request failed", text: message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleFormKeyDown = (e) => {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
    }
  };

  return (
    <form className="user-form" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate>
      {formError ? <p className="user-form__error" style={{ whiteSpace: "pre-wrap" }}>{formError}</p> : null}
      <div className="vendor-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`vendor-tabs__tab${tab === t.id ? " vendor-tabs__tab--active" : ""}`} onClick={() => void goToTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "personal" ? (
        <section className="vendor-read-section">
          <h3 className="vendor-read-section__title">Personal Details</h3>
          <div className="user-form__upload-row">
            <div className="user-upload user-upload--with-preview">
              <input ref={fileInputRef} id={fileInputId} type="file" accept="image/*" className="user-upload__input" onChange={(e) => setProfileFile(e.target.files?.[0] || null)} />
              <label htmlFor={fileInputId} className="user-upload__circle-wrap">
                <span className="user-upload__circle">
                  {avatar ? (
                    <img src={avatar} alt="" className="user-upload__preview-img" width={112} height={112} />
                  ) : (
                    <ProfileImagePlaceholder size={40} />
                  )}
                </span>
                <span className="user-upload__tap-hint">Choose image</span>
              </label>
            </div>
          </div>
          <div className="user-form__grid">
            <label className="user-field"><span className="user-field__label">Full Name<MandatoryDot /></span><input value={values.name} onChange={handleChange("name")} /></label>
            <label className="user-field"><span className="user-field__label">Email Address</span><input type="email" value={values.email} onChange={handleChange("email")} placeholder="optional" /></label>
            <label className="user-field"><span className="user-field__label">Mobile Number<MandatoryDot /></span><input type="tel" inputMode="numeric" value={values.phone} onChange={handlePhoneInput("phone")} placeholder="9876543210" minLength={10} maxLength={10} /></label>
            <label className="user-field"><span className="user-field__label">Status<MandatoryDot /></span><select value={values.status} onChange={handleChange("status")}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            <label className="user-field"><span className="user-field__label">Approval Status<MandatoryDot /></span><select value={values.approvalStatus} onChange={handleChange("approvalStatus")}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
          </div>
        </section>
      ) : null}

      {tab === "business" ? (
        <section className="vendor-read-section">
          <h3 className="vendor-read-section__title">Business Details</h3>
          <div className="user-form__grid">
            <label className="user-field"><span className="user-field__label">Business Name<MandatoryDot /></span><input value={values.businessName} onChange={handleChange("businessName")} /></label>
            <label className="user-field"><span className="user-field__label">Business Mobile</span><input type="tel" inputMode="numeric" value={values.businessPhone} onChange={handlePhoneInput("businessPhone")} placeholder="9876543210" minLength={10} maxLength={10} /></label>
            <label className="user-field"><span className="user-field__label">Business Email</span><input type="email" value={values.businessEmail} onChange={handleChange("businessEmail")} /></label>
            <label className="user-field user-field--full"><span className="user-field__label">Address<MandatoryDot /></span><textarea rows={3} value={values.businessAddress} onChange={handleChange("businessAddress")} /></label>
            <label className="user-field user-field--full"><span className="user-field__label">Description</span><textarea rows={3} value={values.businessDescription} onChange={handleChange("businessDescription")} /></label>
            <label className="user-field"><span className="user-field__label">PAN Number</span><input value={values.panNumber} onChange={handlePanInput} maxLength={10} /></label>
            <label className="user-field"><span className="user-field__label">GST Number</span><input value={values.gstNumber} onChange={handleGstInput} maxLength={15} /></label>
          </div>
        </section>
      ) : null}

      {tab === "bank" ? (
        <section className="vendor-read-section">
          <h3 className="vendor-read-section__title">Bank Details</h3>
          <div className="user-form__grid">
            <label className="user-field"><span className="user-field__label">Bank Name</span><input value={values.bankName} onChange={handleChange("bankName")} /></label>
            <label className="user-field"><span className="user-field__label">Branch Name</span><input value={values.branchName} onChange={handleChange("branchName")} /></label>
            <label className="user-field"><span className="user-field__label">Account Type</span><select value={values.accountType} onChange={handleChange("accountType")}><option value="">Select account type (optional)</option><option>Current</option><option>Savings</option></select></label>
            <label className="user-field"><span className="user-field__label">Account Number</span><input value={values.accountNumber} onChange={handleAccountInput} maxLength={18} inputMode="numeric" /></label>
            <label className="user-field"><span className="user-field__label">IFSC Code</span><input value={values.ifscCode} onChange={handleIfscInput} maxLength={11} /></label>
          </div>
        </section>
      ) : null}

      {tab === "documents" ? (
        <section className="vendor-read-section">
          <h3 className="vendor-read-section__title">Documents Upload</h3>
          {docFieldError ? <p className="user-form__error">{docFieldError}</p> : null}
          <div className="vendor-doc-grid">
            {[
              { key: "aadhaarCardFront", label: "Aadhaar Front (max 5 MB)", required: true },
              { key: "aadhaarCardBack", label: "Aadhaar Back (max 5 MB)", required: true },
              { key: "panCard", label: "PAN Card (max 5 MB)", required: false },
            ].map((doc) => (
              <label key={doc.key} className="vendor-doc-slot">
                <span className="vendor-doc-slot__label">{doc.label}{doc.required ? <MandatoryDot /> : null}</span>
                <input type="file" accept=".pdf,image/*" className="user-upload__input" onChange={(e) => handleDocFile(doc.key, e.target.files?.[0])} />
                <span className="vendor-doc-slot__box">
                  {docPreviews[doc.key] ? <button type="button" className="vendor-doc-slot__remove" onClick={handleRemoveDoc(doc.key)}>×</button> : null}
                  {docPreviews[doc.key] ? <img src={docPreviews[doc.key]} alt={doc.label} className="user-upload__preview-img" /> : <span className="vendor-doc-slot__inner">Upload</span>}
                </span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <div className="user-form__actions vendor-editor-page__footer">
        <button type="button" className="btn btn--ghost" onClick={isFirstTab ? onCancel : goToPreviousTab} disabled={submitting}>
          {isFirstTab ? "Cancel" : "Back"}
        </button>
        <div className="vendor-editor-page__footer-end">
          {mode === "create" ? (
            isLastTab ? (
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {submitting ? "Saving..." : "Create Service Vendor"}
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={() => void goToNextTab()} disabled={submitting}>
                Next
              </button>
            )
          ) : (
            <>
              {!isLastTab ? (
                <button type="button" className="btn btn--ghost" onClick={() => void goToNextTab()} disabled={submitting}>
                  Next
                </button>
              ) : null}
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {submitting ? "Saving..." : "Save Changes"}
              </button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}

export function VenueVendorAdd() {
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
          <p className="vendor-editor-page__eyebrow">Add Service Vendor</p>
          <h2 className="user-page__title">Add New Service Vendor</h2>
          <p className="user-page__subtitle">Register a new service vendor</p>
        </div>
      </div>
      <div className="user-page__card vendor-editor-page__card">
        <VenueVendorProfileForm
          mode="create"
          onCancel={() => navigate(-1)}
          onSuccess={async () => {
            await Swal.fire({ icon: "success", title: "Service vendor created", timer: 1500 });
            navigate(-1);
          }}
        />
      </div>
    </div>
  );
}
