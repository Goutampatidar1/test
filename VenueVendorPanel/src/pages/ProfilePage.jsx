import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import { vendorPanelGetMe } from "../api/vendorPanelAuth.js";
import { vendorEcomUpdateMe } from "../api/vendorEcom.js";
import { venueVendorUpdateMe } from "../api/venueVendorAuth.js";
import { selectPanelMode } from "../store/authSlice.js";
import { BothProfilePage } from "./BothProfilePage.jsx";
import { mediaUrl } from "../media.js";
import { setUser } from "../store/authSlice.js";
import {
  ADDRESS_MAX,
  ADDRESS_MIN,
  BANK_NAME_MIN,
  BANK_NAME_MAX,
  BRANCH_NAME_MIN,
  BRANCH_NAME_MAX,
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
  return {
    ...emptyForm(),
    name: user.name ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    businessName: user.businessName ?? "",
    businessPhone: user.businessPhone ?? "",
    businessEmail: user.businessEmail ?? "",
    businessAddress: user.businessAddress ?? "",
    businessDescription: user.businessDescription ?? "",
    panNumber: user.panNumber ?? "",
    gstNumber: user.gstNumber ?? "",
    bankName: user.bankName ?? "",
    branchName: user.branchName ?? "",
    accountType: user.accountType ?? "Current",
    accountNumber: user.accountNumber ?? "",
    ifscCode: user.ifscCode ?? "",
  };
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

function SingleProfilePage() {
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const token = useSelector((s) => s.auth.token);
  const user = useSelector((s) => s.auth.user);
  const panelMode = useSelector(selectPanelMode);
  const [tab, setTab] = useState(() => {
    const requested = searchParams.get("tab");
    return TABS.some((item) => item.id === requested) ? requested : "personal";
  });
  const [form, setForm] = useState(() => formFromUser(user));
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
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await vendorPanelGetMe(token, panelMode);
      if (data?.user) {
        dispatch(setUser(data.user));
        setForm(formFromUser(data.user));
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
  }, [dispatch, panelMode, token]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const onChange = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = validateVenueVendorTab(form, tab, {
      validateEmail: true,
      aadhaarFrontFile,
      aadhaarBackFile,
      existingAadhaarFront: user?.aadhaarCardFront,
      existingAadhaarBack: user?.aadhaarCardBack,
      existingAadhaarCard: user?.aadhaarCard,
    });
    if (validationError) {
      setTab(validationError.tab);
      const next = new URLSearchParams(searchParams);
      next.set("tab", validationError.tab);
      setSearchParams(next, { replace: true });
      await Swal.fire({
        icon: "error",
        title: "Validation error",
        text: validationError.message,
        confirmButtonColor: "#ea580c",
      });
      return;
    }

    setSaving(true);
    try {
      const payloadByTab = {
        personal: {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
        },
        business: {
          businessName: form.businessName.trim(),
          businessPhone: form.businessPhone.trim(),
          businessEmail: form.businessEmail.trim(),
          businessAddress: form.businessAddress.trim(),
          businessDescription: form.businessDescription.trim(),
          panNumber: form.panNumber.trim().toUpperCase(),
          gstNumber: form.gstNumber.trim().toUpperCase(),
        },
        bank: {
          bankName: form.bankName.trim(),
          branchName: form.branchName.trim(),
          accountType: form.accountType,
          accountNumber: form.accountNumber.trim(),
          ifscCode: form.ifscCode.trim().toUpperCase(),
        },
        documents: {},
      };
      const filesByTab = {
        personal: { profileFile },
        business: {},
        bank: {},
        documents: {
          aadhaarCardFront: aadhaarFrontFile,
          aadhaarCardBack: aadhaarBackFile,
          panCard: panFile,
        },
      };

      const data =
        panelMode === "ecom"
          ? await vendorEcomUpdateMe(payloadByTab[tab] || {}, filesByTab[tab] || {})
          : await venueVendorUpdateMe(token, payloadByTab[tab] || {}, filesByTab[tab] || {});

      dispatch(setUser(data.user));
      setForm(formFromUser(data.user));
      if (tab === "personal") {
        setProfileFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
      if (tab === "documents") {
        setAadhaarFrontFile(null);
        setAadhaarBackFile(null);
        setPanFile(null);
      }

      await Swal.fire({
        icon: "success",
        title: "Profile updated",
        timer: 1500,
        showConfirmButton: false,
      });
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

  const avatar = profileFile ? URL.createObjectURL(profileFile) : mediaUrl(user?.profileImage);
  const initial = (form.name || form.email || "V").charAt(0).toUpperCase();

  useEffect(() => {
    if (!profileFile) return undefined;
    const url = URL.createObjectURL(profileFile);
    return () => URL.revokeObjectURL(url);
  }, [profileFile]);

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
    <div className="user-page vendor-profile-page">
      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">Profile</h2>
          <p className="page-card__desc">
            Approval status: <strong>{user?.approvalStatus || "—"}</strong>
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

          <section className={`vendor-read-section${tab === "personal" ? "" : " d-none"}`} data-profile-tab="personal">
              <h3 className="vendor-read-section__title">Personal Details</h3>
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
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: sanitizeNameInput(e.target.value) }))}
                    maxLength={NAME_MAX}
                    required
                  />
                </label>
                <label className="user-field">
                  <span className="user-field__label">Email Address</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={onChange("email")}
                    autoComplete="email"
                    placeholder="your.email@example.com"
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
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: sanitizePhoneInput(e.target.value) }))}
                    placeholder="9876543210"
                    minLength={10}
                    maxLength={10}
                    required
                  />
                </label>
              </div>
            </section>

          <section className={`vendor-read-section${tab === "business" ? "" : " d-none"}`} data-profile-tab="business">
              <h3 className="vendor-read-section__title">Business Details</h3>
              <div className="user-form__grid">
                <label className="user-field">
                  <span className="user-field__label">
                    Business Name
                    <RequiredDot />
                  </span>
                  <input
                    value={form.businessName}
                    onChange={(e) => setForm((p) => ({ ...p, businessName: sanitizeBusinessNameInput(e.target.value) }))}
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
                    value={form.businessPhone}
                    onChange={(e) => setForm((p) => ({ ...p, businessPhone: sanitizePhoneInput(e.target.value) }))}
                    placeholder="9876543210"
                    minLength={10}
                    maxLength={10}
                    required
                  />
                </label>
                <label className="user-field">
                  <span className="user-field__label">Business Email</span>
                  <input type="email" value={form.businessEmail} onChange={onChange("businessEmail")} />
                </label>
                <label className="user-field user-field--full">
                  <span className="user-field__label">
                    Address
                    <RequiredDot />
                  </span>
                  <textarea
                    rows={3}
                    value={form.businessAddress}
                    onChange={onChange("businessAddress")}
                    minLength={ADDRESS_MIN}
                    maxLength={ADDRESS_MAX}
                    required
                  />
                </label>
                <label className="user-field user-field--full">
                  <span className="user-field__label">Description</span>
                  <textarea rows={3} value={form.businessDescription} onChange={onChange("businessDescription")} />
                </label>
                <label className="user-field">
                  <span className="user-field__label">PAN Number</span>
                  <input
                    {...ALPHANUMERIC_MOBILE_INPUT_PROPS}
                    value={form.panNumber}
                    onChange={(e) => setForm((p) => ({ ...p, panNumber: sanitizePanInput(e.target.value) }))}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                  />
                </label>
                <label className="user-field">
                  <span className="user-field__label">GST Number</span>
                  <input
                    {...ALPHANUMERIC_MOBILE_INPUT_PROPS}
                    value={form.gstNumber}
                    onChange={(e) => setForm((p) => ({ ...p, gstNumber: sanitizeGstInput(e.target.value) }))}
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                  />
                </label>
              </div>
            </section>

          <section className={`vendor-read-section${tab === "bank" ? "" : " d-none"}`} data-profile-tab="bank">
              <h3 className="vendor-read-section__title">Bank Details</h3>
              <div className="user-form__grid">
                <label className="user-field">
                  <span className="user-field__label">
                    Bank Name
                    <RequiredDot />
                  </span>
                  <input
                    value={form.bankName}
                    onChange={(e) => setForm((p) => ({ ...p, bankName: sanitizeBankNameInput(e.target.value) }))}
                    maxLength={BANK_NAME_MAX}
                    minLength={BANK_NAME_MIN}
                    pattern="[A-Za-z ]+"
                    title="Use letters and spaces only."
                    autoComplete="organization"
                    required
                  />
                </label>
                <label className="user-field">
                  <span className="user-field__label">
                    Branch Name
                    <RequiredDot />
                  </span>
                  <input
                    value={form.branchName}
                    onChange={(e) => setForm((p) => ({ ...p, branchName: sanitizeBranchNameInput(e.target.value) }))}
                    maxLength={BRANCH_NAME_MAX}
                    minLength={BRANCH_NAME_MIN}
                    pattern="[A-Za-z ]+"
                    title="Use letters and spaces only."
                    autoComplete="off"
                    required
                  />
                </label>
                <label className="user-field">
                  <span className="user-field__label">
                    Account Type
                    <RequiredDot />
                  </span>
                  <select value={form.accountType} onChange={onChange("accountType")} required>
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
                    value={form.accountNumber}
                    onChange={(e) => setForm((p) => ({ ...p, accountNumber: sanitizeAccountNumberInput(e.target.value) }))}
                    minLength={9}
                    maxLength={18}
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
                    value={form.ifscCode}
                    onChange={(e) => setForm((p) => ({ ...p, ifscCode: sanitizeIfscInput(e.target.value) }))}
                    placeholder="SBIN0001234"
                    maxLength={11}
                    required
                  />
                </label>
              </div>
            </section>

          <section className={`vendor-read-section${tab === "documents" ? "" : " d-none"}`} data-profile-tab="documents">
              <h3 className="vendor-read-section__title">Documents Upload</h3>
              <p className="page-card__desc">Upload Aadhaar front and back (PDF or image, max 5 MB each). PAN card is optional.</p>
              <div className="vendor-doc-grid">
                <DocPreview
                  label="Aadhaar Front (max 5 MB)"
                  url={mediaUrl(user?.aadhaarCardFront || user?.aadhaarCard)}
                  file={aadhaarFrontFile}
                  onFile={setAadhaarFrontFile}
                  inputId={aadhaarFrontInputId}
                  required={!user?.aadhaarCardFront && !user?.aadhaarCard}
                />
                <DocPreview
                  label="Aadhaar Back (max 5 MB)"
                  url={mediaUrl(user?.aadhaarCardBack)}
                  file={aadhaarBackFile}
                  onFile={setAadhaarBackFile}
                  inputId={aadhaarBackInputId}
                  required={!user?.aadhaarCardBack}
                />
                <DocPreview
                  label="PAN Card (max 5 MB)"
                  url={mediaUrl(user?.panCard)}
                  file={panFile}
                  onFile={setPanFile}
                  inputId={panInputId}
                />
              </div>
            </section>

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

export function ProfilePage() {
  const panelMode = useSelector(selectPanelMode);
  if (panelMode === "both") {
    return <BothProfilePage />;
  }
  return <SingleProfilePage />;
}
