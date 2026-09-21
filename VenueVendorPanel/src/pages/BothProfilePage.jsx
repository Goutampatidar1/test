import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import { vendorPanelGetMe } from "../api/vendorPanelAuth.js";
import { normalizeEcomProfileUser, vendorEcomUpdateMe } from "../api/vendorEcom.js";
import { venueVendorUpdateMe } from "../api/venueVendorAuth.js";
import { mediaUrl } from "../media.js";
import { setAccountUser, setUser } from "../store/authSlice.js";
import {
  ADDRESS_MAX,
  ADDRESS_MIN,
  BANK_NAME_MAX,
  BANK_NAME_MIN,
  BRANCH_NAME_MAX,
  BRANCH_NAME_MIN,
  BUSINESS_NAME_MAX,
  MAX_FILE_BYTES,
  NAME_MAX,
  sanitizeAccountNumberInput,
  sanitizeBankNameInput,
  sanitizeBranchNameInput,
  sanitizeBusinessNameInput,
  sanitizeGstInput,
  sanitizeIfscInput,
  sanitizeNameInput,
  sanitizePanInput,
  sanitizePhoneInput,
  ALPHANUMERIC_MOBILE_INPUT_PROPS,
  validateVenueVendorTab,
} from "../utils/venueVendorFormValidation.js";

const TABS = [
  { id: "personal", label: "Personal Details" },
  { id: "business", label: "Business Details" },
  { id: "bank", label: "Bank Details" },
  { id: "documents", label: "Documents Upload" },
];

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
    accountType: "Current",
    accountNumber: "",
    ifscCode: "",
  };
}

function formFromUser(user) {
  if (!user) return emptyForm();
  const normalized = normalizeEcomProfileUser(user);
  return {
    ...emptyForm(),
    name: normalized.name ?? "",
    email: normalized.email ?? "",
    phone: normalized.phone ?? "",
    businessName: normalized.businessName ?? "",
    businessPhone: normalized.businessPhone ?? "",
    businessEmail: normalized.businessEmail ?? "",
    businessAddress: normalized.businessAddress ?? "",
    businessDescription: normalized.businessDescription ?? "",
    panNumber: normalized.panNumber ?? "",
    gstNumber: normalized.gstNumber ?? "",
    bankName: normalized.bankName ?? "",
    branchName: normalized.branchName ?? "",
    accountType: normalized.accountType ?? "Current",
    accountNumber: normalized.accountNumber ?? "",
    ifscCode: normalized.ifscCode ?? "",
  };
}

function mergeSharedForm(service, ecom) {
  const serviceForm = formFromUser(service);
  const ecomForm = formFromUser(normalizeEcomProfileUser(ecom));
  const merged = { ...serviceForm };
  Object.keys(merged).forEach((key) => {
    if (!String(merged[key] ?? "").trim() && String(ecomForm[key] ?? "").trim()) {
      merged[key] = ecomForm[key];
    }
  });
  return merged;
}

function RequiredDot() {
  return <span className="required-dot"> *</span>;
}

function DocPreview({ label, url, file, onFile, inputId, required = false }) {
  const [filePreview, setFilePreview] = useState("");

  useEffect(() => {
    if (!file) {
      setFilePreview("");
      return undefined;
    }
    const blobUrl = URL.createObjectURL(file);
    setFilePreview(blobUrl);
    return () => URL.revokeObjectURL(blobUrl);
  }, [file]);

  const preview = filePreview || url;

  const handleChange = (nextFile) => {
    if (!nextFile) {
      onFile(null);
      return;
    }
    if (nextFile.size > MAX_FILE_BYTES) {
      Swal.fire({ icon: "error", title: "File too large", text: "Maximum file size is 5 MB." });
      return;
    }
    onFile(nextFile);
  };

  return (
    <label className="vendor-doc-slot">
      <span className="vendor-doc-slot__label">
        {label}
        {required ? <RequiredDot /> : null}
      </span>
      <input
        id={inputId}
        type="file"
        accept=".pdf,image/*"
        className="user-upload__input"
        required={required && !file}
        onChange={(e) => {
          handleChange(e.target.files?.[0] || null);
          e.target.value = "";
        }}
      />
      <span className="vendor-doc-slot__box">
        {preview ? (
          <img src={preview} alt={label} className="user-upload__preview-img" />
        ) : (
          <span className="vendor-doc-slot__inner">Upload</span>
        )}
      </span>
    </label>
  );
}

export function BothProfilePage() {
  const dispatch = useDispatch();
  const accounts = useSelector((s) => s.auth.accounts);
  const serviceToken = accounts?.service?.token;
  const ecomToken = accounts?.ecom?.token;
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const requested = searchParams.get("tab");
    return TABS.some((item) => item.id === requested) ? requested : "personal";
  });
  const [serviceUser, setServiceUser] = useState(null);
  const [ecomUser, setEcomUser] = useState(null);
  const [personalForm, setPersonalForm] = useState(emptyForm());
  const [businessForm, setBusinessForm] = useState(emptyForm());
  const [profileFile, setProfileFile] = useState(null);
  const [aadhaarFrontFile, setAadhaarFrontFile] = useState(null);
  const [aadhaarBackFile, setAadhaarBackFile] = useState(null);
  const [panFile, setPanFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef(null);
  const fileInputId = useId();
  const aadhaarFrontInputId = useId();
  const aadhaarBackInputId = useId();
  const panInputId = useId();

  const refreshProfile = useCallback(async () => {
    if (!serviceToken && !ecomToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [serviceData, ecomData] = await Promise.all([
        serviceToken ? vendorPanelGetMe(serviceToken, "service") : Promise.resolve(null),
        ecomToken ? vendorPanelGetMe(ecomToken, "ecom") : Promise.resolve(null),
      ]);
      const service = serviceData?.user || null;
      const ecom = normalizeEcomProfileUser(ecomData?.user || null);
      setServiceUser(service);
      setEcomUser(ecom);
      const shared = mergeSharedForm(service, ecom);
      setPersonalForm(shared);
      setBusinessForm(shared);
      if (service) {
        dispatch(setAccountUser({ mode: "service", user: service }));
        dispatch(setUser(service));
      }
      if (ecom) {
        dispatch(setAccountUser({ mode: "ecom", user: ecom }));
      }
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Could not load profile",
        text: err?.message || "Please try again.",
        confirmButtonColor: "#ea580c",
      });
    } finally {
      setLoading(false);
    }
  }, [dispatch, ecomToken, serviceToken]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const onBusinessChange = (key) => (e) => setBusinessForm((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const docUserForValidation = serviceUser || ecomUser;
    const validationForm =
      tab === "business" ? businessForm : tab === "bank" ? personalForm : personalForm;
    const validationError = validateVenueVendorTab(validationForm, tab, {
      validateEmail: true,
      aadhaarFrontFile,
      aadhaarBackFile,
      existingAadhaarFront: docUserForValidation?.aadhaarCardFront || docUserForValidation?.aadhaarCard,
      existingAadhaarBack: docUserForValidation?.aadhaarCardBack,
    });
    if (validationError) {
      setTab(validationError.tab);
      const next = new URLSearchParams(searchParams);
      next.set("tab", validationError.tab);
      setSearchParams(next, { replace: true });
      await Swal.fire({
        icon: "error",
        title: "Check your details",
        text: validationError.message,
        confirmButtonColor: "#ea580c",
      });
      return;
    }

    setSaving(true);
    try {
      const updates = [];

      if (tab === "personal") {
        const payload = {
          name: personalForm.name.trim(),
          email: personalForm.email.trim().toLowerCase(),
          phone: personalForm.phone.trim(),
        };
        const files = { profileFile };
        if (serviceToken) updates.push(venueVendorUpdateMe(serviceToken, payload, files));
        if (ecomToken) updates.push(vendorEcomUpdateMe(payload, files));
      } else if (tab === "business") {
        const payload = {
          businessName: businessForm.businessName.trim(),
          businessPhone: businessForm.businessPhone.trim(),
          businessEmail: businessForm.businessEmail.trim(),
          businessAddress: businessForm.businessAddress.trim(),
          businessDescription: businessForm.businessDescription.trim(),
          panNumber: businessForm.panNumber.trim().toUpperCase(),
          gstNumber: businessForm.gstNumber.trim().toUpperCase(),
        };
        if (serviceToken) updates.push(venueVendorUpdateMe(serviceToken, payload));
        if (ecomToken) updates.push(vendorEcomUpdateMe(payload));
      } else if (tab === "bank") {
        const payload = {
          bankName: personalForm.bankName.trim(),
          branchName: personalForm.branchName.trim(),
          accountType: personalForm.accountType,
          accountNumber: personalForm.accountNumber.trim(),
          ifscCode: personalForm.ifscCode.trim().toUpperCase(),
        };
        if (serviceToken) updates.push(venueVendorUpdateMe(serviceToken, payload));
        if (ecomToken) updates.push(vendorEcomUpdateMe(payload));
      } else if (tab === "documents") {
        const files = {
          aadhaarCardFront: aadhaarFrontFile,
          aadhaarCardBack: aadhaarBackFile,
          panCard: panFile,
        };
        if (serviceToken) updates.push(venueVendorUpdateMe(serviceToken, {}, files));
        if (ecomToken) updates.push(vendorEcomUpdateMe({}, files));
      }

      if (!updates.length) {
        throw new Error("No vendor account is available to update.");
      }

      await Promise.all(updates);
      await refreshProfile();
      setProfileFile(null);
      setAadhaarFrontFile(null);
      setAadhaarBackFile(null);
      setPanFile(null);
      await Swal.fire({ icon: "success", title: "Profile updated", timer: 1500, showConfirmButton: false });
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Update failed",
        text: err.message,
        confirmButtonColor: "#ea580c",
      });
    } finally {
      setSaving(false);
    }
  };

  const avatar = profileFile ? URL.createObjectURL(profileFile) : mediaUrl(serviceUser?.profileImage || ecomUser?.profileImage);
  const initial = (personalForm.name || personalForm.email || "V").charAt(0).toUpperCase();
  const docUser = serviceUser || ecomUser;

  if (loading) {
    return (
      <div className="user-page">
        <div className="page-card">
          <p className="page-card__desc">Loading profile…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-page vendor-profile-page vendor-profile-page--both">
      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">Profile</h2>
          <p className="page-card__desc">
            Service approval: <strong>{serviceUser?.approvalStatus || "—"}</strong>
            {" · "}
            Shop approval: <strong>{ecomUser?.approvalStatus || "—"}</strong>
          </p>
        </div>

        <form className="user-form" onSubmit={handleSubmit} noValidate>
          <div className="vendor-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`vendor-tabs__tab${tab === t.id ? " vendor-tabs__tab--active" : ""}`}
                onClick={() => {
                  setTab(t.id);
                  const next = new URLSearchParams(searchParams);
                  next.set("tab", t.id);
                  setSearchParams(next, { replace: true });
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "personal" ? (
            <section className="vendor-read-section">
              <h3 className="vendor-read-section__title">Personal Details (shared)</h3>
              <div className="user-form__upload-row">
                <div className="user-upload user-upload--with-preview">
                  <input
                    ref={fileInputRef}
                    id={fileInputId}
                    type="file"
                    accept="image/*"
                    className="user-upload__input"
                    onChange={(e) => setProfileFile(e.target.files?.[0] || null)}
                  />
                  <label htmlFor={fileInputId} className="user-upload__circle-wrap">
                    <span className="user-upload__circle">
                      {avatar ? (
                        <img src={avatar} alt="" className="user-upload__preview-img" width={112} height={112} />
                      ) : (
                        <span className="user-upload__initial">{initial}</span>
                      )}
                    </span>
                    <span className="user-upload__tap-hint">Choose image</span>
                  </label>
                </div>
              </div>
              <div className="user-form__grid">
                <label className="user-field">
                  <span className="user-field__label">
                    Full Name
                    <RequiredDot />
                  </span>
                  <input
                    value={personalForm.name}
                    onChange={(e) => setPersonalForm((p) => ({ ...p, name: sanitizeNameInput(e.target.value) }))}
                    maxLength={NAME_MAX}
                    required
                  />
                </label>
                <label className="user-field">
                  <span className="user-field__label">Email Address</span>
                  <input
                    type="email"
                    value={personalForm.email}
                    onChange={(e) => setPersonalForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </label>
                <label className="user-field">
                  <span className="user-field__label">
                    Mobile Number
                    <RequiredDot />
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={personalForm.phone}
                    onChange={(e) => setPersonalForm((p) => ({ ...p, phone: sanitizePhoneInput(e.target.value) }))}
                    minLength={10}
                    maxLength={10}
                    required
                  />
                </label>
              </div>
            </section>
          ) : null}

          {tab === "business" ? (
            <section className="vendor-read-section">
              <h3 className="vendor-read-section__title">Business Details (shared)</h3>
              <p className="page-card__desc">
                These details apply to both your service and shop profiles. Saving updates both accounts.
              </p>
              <div className="user-form__grid">
                <label className="user-field">
                  <span className="user-field__label">
                    Business Name
                    <RequiredDot />
                  </span>
                  <input
                    value={businessForm.businessName}
                    onChange={(e) =>
                      setBusinessForm((p) => ({ ...p, businessName: sanitizeBusinessNameInput(e.target.value) }))
                    }
                    maxLength={BUSINESS_NAME_MAX}
                    required
                  />
                </label>
                <label className="user-field">
                  <span className="user-field__label">
                    Business Mobile
                    <RequiredDot />
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={businessForm.businessPhone}
                    onChange={(e) =>
                      setBusinessForm((p) => ({ ...p, businessPhone: sanitizePhoneInput(e.target.value) }))
                    }
                    minLength={10}
                    maxLength={10}
                    required
                  />
                </label>
                <label className="user-field">
                  <span className="user-field__label">Business Email</span>
                  <input type="email" value={businessForm.businessEmail} onChange={onBusinessChange("businessEmail")} />
                </label>
                <label className="user-field user-field--full">
                  <span className="user-field__label">
                    Address
                    <RequiredDot />
                  </span>
                  <textarea
                    rows={3}
                    value={businessForm.businessAddress}
                    onChange={onBusinessChange("businessAddress")}
                    minLength={ADDRESS_MIN}
                    maxLength={ADDRESS_MAX}
                    required
                  />
                </label>
                <label className="user-field user-field--full">
                  <span className="user-field__label">Description</span>
                  <textarea rows={3} value={businessForm.businessDescription} onChange={onBusinessChange("businessDescription")} />
                </label>
                <label className="user-field">
                  <span className="user-field__label">PAN Number</span>
                  <input
                    {...ALPHANUMERIC_MOBILE_INPUT_PROPS}
                    value={businessForm.panNumber}
                    onChange={(e) => setBusinessForm((p) => ({ ...p, panNumber: sanitizePanInput(e.target.value) }))}
                    maxLength={10}
                  />
                </label>
                <label className="user-field">
                  <span className="user-field__label">GST Number</span>
                  <input
                    {...ALPHANUMERIC_MOBILE_INPUT_PROPS}
                    value={businessForm.gstNumber}
                    onChange={(e) => setBusinessForm((p) => ({ ...p, gstNumber: sanitizeGstInput(e.target.value) }))}
                    maxLength={15}
                  />
                </label>
              </div>
            </section>
          ) : null}

          {tab === "bank" ? (
            <section className="vendor-read-section">
              <h3 className="vendor-read-section__title">Bank Details (shared)</h3>
              <div className="user-form__grid">
                <label className="user-field">
                  <span className="user-field__label">
                    Bank Name
                    <RequiredDot />
                  </span>
                  <input
                    value={personalForm.bankName}
                    onChange={(e) => setPersonalForm((p) => ({ ...p, bankName: sanitizeBankNameInput(e.target.value) }))}
                    maxLength={BANK_NAME_MAX}
                    minLength={BANK_NAME_MIN}
                    required
                  />
                </label>
                <label className="user-field">
                  <span className="user-field__label">
                    Branch Name
                    <RequiredDot />
                  </span>
                  <input
                    value={personalForm.branchName}
                    onChange={(e) => setPersonalForm((p) => ({ ...p, branchName: sanitizeBranchNameInput(e.target.value) }))}
                    maxLength={BRANCH_NAME_MAX}
                    minLength={BRANCH_NAME_MIN}
                    required
                  />
                </label>
                <label className="user-field">
                  <span className="user-field__label">
                    Account Type
                    <RequiredDot />
                  </span>
                  <select
                    value={personalForm.accountType}
                    onChange={(e) => setPersonalForm((p) => ({ ...p, accountType: e.target.value }))}
                    required
                  >
                    <option value="Current">Current</option>
                    <option value="Savings">Savings</option>
                  </select>
                </label>
                <label className="user-field">
                  <span className="user-field__label">
                    Account Number
                    <RequiredDot />
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={personalForm.accountNumber}
                    onChange={(e) =>
                      setPersonalForm((p) => ({ ...p, accountNumber: sanitizeAccountNumberInput(e.target.value) }))
                    }
                    required
                  />
                </label>
                <label className="user-field">
                  <span className="user-field__label">
                    IFSC Code
                    <RequiredDot />
                  </span>
                  <input
                    {...ALPHANUMERIC_MOBILE_INPUT_PROPS}
                    value={personalForm.ifscCode}
                    onChange={(e) => setPersonalForm((p) => ({ ...p, ifscCode: sanitizeIfscInput(e.target.value) }))}
                    maxLength={11}
                    required
                  />
                </label>
              </div>
            </section>
          ) : null}

          {tab === "documents" ? (
            <section className="vendor-read-section">
              <h3 className="vendor-read-section__title">Documents Upload (shared)</h3>
              <div className="vendor-doc-grid">
                <DocPreview
                  label="Aadhaar Front (max 5 MB)"
                  url={mediaUrl(docUser?.aadhaarCardFront || docUser?.aadhaarCard)}
                  file={aadhaarFrontFile}
                  onFile={setAadhaarFrontFile}
                  inputId={aadhaarFrontInputId}
                  required={!docUser?.aadhaarCardFront && !docUser?.aadhaarCard}
                />
                <DocPreview
                  label="Aadhaar Back (max 5 MB)"
                  url={mediaUrl(docUser?.aadhaarCardBack)}
                  file={aadhaarBackFile}
                  onFile={setAadhaarBackFile}
                  inputId={aadhaarBackInputId}
                  required={!docUser?.aadhaarCardBack}
                />
                <DocPreview
                  label="PAN Card (max 5 MB)"
                  url={mediaUrl(docUser?.panCard || docUser?.panCardFront)}
                  file={panFile}
                  onFile={setPanFile}
                  inputId={panInputId}
                />
              </div>
            </section>
          ) : null}

          <div className="user-form__actions mt-3">
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
