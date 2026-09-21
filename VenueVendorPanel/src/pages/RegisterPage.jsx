import { useEffect, useId, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { vendorPanelRegister } from "../api/vendorPanelAuth.js";
import { publicListCategories } from "../api/publicCatalog.js";
import { setCredentials } from "../store/authSlice.js";
import { VENDOR_LOGIN_PATH } from "../constants/authRoutes.js";
import {
  ADDRESS_MAX,
  ADDRESS_MIN,
  BUSINESS_NAME_MAX,
  MAX_FILE_BYTES,
  NAME_MIN,
  NAME_MAX,
  sanitizeBusinessNameInput,
  sanitizeNameInput,
  sanitizePhoneInput,
  validateBusinessAddress,
  validateBusinessName,
  validateEmailMessage,
  validateFullName,
  validateIndianMobileMessage,
  validateVenueVendorDocuments,
} from "../utils/venueVendorFormValidation.js";
import { reportFormValidity, reportStepValidity } from "../utils/formValidation.js";
import { normalizePanelAuthSession } from "../utils/panelAuthSession.js";

const STEPS = [
  { id: 1, label: "Vendor Type" },
  { id: 2, label: "Personal Details" },
  { id: 3, label: "Documents & Shop" },
];

const VENDOR_TYPES = [
  { id: "ecom", title: "E-commerce", description: "Sell products online through the marketplace." },
  { id: "service", title: "Service Provider", description: "Offer venue and event services for booking." },
  { id: "both", title: "Both", description: "Run an online shop and offer services from one account." },
];

const INITIAL_FORM = {
  name: "",
  email: "",
  phone: "",
  businessName: "",
  businessAddress: "",
};

function needsServiceFlow(type) {
  return type === "service" || type === "both";
}

function needsShopImages(type) {
  return type === "ecom" || type === "both";
}

function needsShopCategory(type) {
  return type === "ecom";
}

function categoryId(item) {
  return item?._id || item?.id || "";
}

/** Live backend still requires category on register — pick one silently for Both vendors. */
async function resolveRegistrationCategoryForBoth(existingCategories) {
  const cached = (existingCategories || []).map(categoryId).find(Boolean);
  if (cached) return cached;

  const items = await publicListCategories({ mode: "ecom", limit: 100, includeEmpty: true });
  const fetched = (items ?? []).map(categoryId).find(Boolean);
  if (!fetched) {
    throw new Error("Shop setup is temporarily unavailable. Please contact support.");
  }
  return fetched;
}

function validateIndianMobile(phone) {
  return validateIndianMobileMessage(phone, { required: true, label: "Mobile number" });
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
      <path d="M9 9h1M14 9h1M9 13h1M14 13h1" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 16V4m0 0 4 4m-4-4-4 4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function RegisterStepper({ currentStep }) {
  return (
    <div className="vendor-register-stepper" role="list" aria-label="Registration progress">
      {STEPS.map((step, index) => {
        const isActive = step.id === currentStep;
        const isCompleted = step.id < currentStep;
        const circleClass = isActive || isCompleted ? "is-active" : "is-upcoming";
        const lineClass = step.id < currentStep ? "is-done" : "is-upcoming";

        return (
          <div key={step.id} className="vendor-register-stepper__step" role="listitem">
            <div className="vendor-register-stepper__node">
              <div className={`vendor-register-stepper__circle ${circleClass}`}>{step.id}</div>
              <span className={`vendor-register-stepper__label ${isActive || isCompleted ? "is-active" : ""}`}>
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 ? (
              <div className={`vendor-register-stepper__line ${lineClass}`} aria-hidden="true" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FormField({ label, children, className = "", required = false }) {
  return (
    <label className={`vendor-register-field ${className}`.trim()}>
      <span className="vendor-register-field__label">
        {label}
        {required ? <span className="required-dot"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function isImageFile(file) {
  return Boolean(file?.type?.startsWith("image/"));
}

function FileUploadZone({ label, file, onFile, inputId, required = false }) {
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file || !isImageFile(file)) {
      setPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleChange = (nextFile) => {
    if (!nextFile) {
      onFile(null);
      return;
    }
    if (nextFile.size > MAX_FILE_BYTES) {
      Swal.fire({
        icon: "error",
        title: "File too large",
        text: "Maximum file size is 5MB.",
        confirmButtonColor: "#141414",
      });
      return;
    }
    onFile(nextFile);
  };

  return (
    <div className="vendor-register-field">
      <span className="vendor-register-field__label">
        {label}
        {required ? <span className="required-dot"> *</span> : null}
      </span>
      <label htmlFor={inputId} className={`vendor-register-upload${preview || file ? " has-file" : ""}`}>
        <input
          id={inputId}
          type="file"
          accept="image/*,.pdf,application/pdf"
          className="vendor-register-upload__input"
          required={required && !file}
          onChange={(e) => {
            handleChange(e.target.files?.[0] || null);
            e.target.value = "";
          }}
        />
        {preview ? (
          <img src={preview} alt={`${label} preview`} className="vendor-register-upload__preview" />
        ) : (
          <UploadIcon />
        )}
        {file ? (
          <>
            <p className="vendor-register-upload__name">{file.name}</p>
            <p className="vendor-register-upload__hint">Click to replace · PDF or Image (max. 5MB)</p>
          </>
        ) : (
          <>
            <p className="vendor-register-upload__text">
              <span className="vendor-register-upload__link">Click to upload</span> or drag and drop
            </p>
            <p className="vendor-register-upload__hint">PDF or Image (max. 5MB)</p>
          </>
        )}
      </label>
    </div>
  );
}

function VendorTypePicker({ value, onChange }) {
  return (
    <div className="vendor-type-picker" role="radiogroup" aria-label="Choose vendor type">
      {VENDOR_TYPES.map((type) => (
        <button
          key={type.id}
          type="button"
          role="radio"
          aria-checked={value === type.id}
          className={`vendor-type-picker__card${value === type.id ? " is-selected" : ""}`}
          onClick={() => onChange(type.id)}
        >
          <span className="vendor-type-picker__title">{type.title}</span>
          <span className="vendor-type-picker__desc">{type.description}</span>
        </button>
      ))}
    </div>
  );
}

export function RegisterPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = useSelector((s) => s.auth.token);
  const aadhaarFrontInputId = useId();
  const aadhaarBackInputId = useId();
  const panInputId = useId();
  const shopImagesInputId = useId();

  const [step, setStep] = useState(1);
  const [vendorPanelType, setVendorPanelType] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [aadhaarFrontFile, setAadhaarFrontFile] = useState(null);
  const [aadhaarBackFile, setAadhaarBackFile] = useState(null);
  const [panFile, setPanFile] = useState(null);
  const [shopImages, setShopImages] = useState([]);
  const formRef = useRef(null);

  useEffect(() => {
    document.title = "Vendor Registration";
    document.body.classList.add("vendor-register-active");
    return () => document.body.classList.remove("vendor-register-active");
  }, []);

  useEffect(() => {
    if (!needsShopImages(vendorPanelType)) {
      setCategory("");
      setCategories([]);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const items = await publicListCategories({ mode: "ecom", limit: 100, includeEmpty: true });
        if (!cancelled) setCategories(items ?? []);
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorPanelType]);

  useEffect(() => {
    if (token) {
      navigate("/vendor/dashboard", { replace: true });
    }
  }, [navigate, token]);

  const onChange = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  const validateStep = async (stepNum) => {
    if (stepNum === 1) {
      if (!vendorPanelType) {
        await Swal.fire({
          icon: "error",
          title: "Required",
          text: "Please choose a vendor type.",
          confirmButtonColor: "#141414",
        });
        return false;
      }
    }

    if (stepNum === 2) {
      const nameError = validateFullName(form.name);
      if (nameError) {
        await Swal.fire({ icon: "error", title: "Required", text: nameError, confirmButtonColor: "#141414" });
        return false;
      }
      const emailError = validateEmailMessage(form.email, { required: false });
      if (emailError) {
        await Swal.fire({ icon: "error", title: "Invalid email", text: emailError, confirmButtonColor: "#141414" });
        return false;
      }
      const phoneError = validateIndianMobile(form.phone);
      if (phoneError) {
        await Swal.fire({ icon: "error", title: "Invalid mobile", text: phoneError, confirmButtonColor: "#141414" });
        return false;
      }
      const businessNameError = validateBusinessName(form.businessName);
      if (businessNameError) {
        await Swal.fire({ icon: "error", title: "Required", text: businessNameError, confirmButtonColor: "#141414" });
        return false;
      }
      if (needsServiceFlow(vendorPanelType)) {
        const addressError = validateBusinessAddress(form.businessAddress);
        if (addressError) {
          await Swal.fire({ icon: "error", title: "Required", text: addressError, confirmButtonColor: "#141414" });
          return false;
        }
      }
    }

    if (stepNum === 3) {
      if (needsServiceFlow(vendorPanelType)) {
        const documentsError = validateVenueVendorDocuments({ aadhaarFrontFile, aadhaarBackFile });
        if (documentsError) {
          await Swal.fire({ icon: "error", title: "Required", text: documentsError, confirmButtonColor: "#141414" });
          return false;
        }
      }
      if (needsShopCategory(vendorPanelType) && !category) {
        await Swal.fire({
          icon: "error",
          title: "Required",
          text: "Please select a shop category.",
          confirmButtonColor: "#141414",
        });
        return false;
      }
      if (needsShopImages(vendorPanelType)) {
        if (!shopImages.length) {
          await Swal.fire({
            icon: "error",
            title: "Required",
            text: "Upload at least one shop image.",
            confirmButtonColor: "#141414",
          });
          return false;
        }
      }
    }

    return true;
  };

  const handleNext = async (e) => {
    e?.preventDefault?.();
    const stepEl = formRef.current?.querySelector(`[data-register-step="${step}"]`);
    if (!reportStepValidity(stepEl)) return;

    const ok = await validateStep(step);
    if (!ok) return;
    setStep((s) => Math.min(3, s + 1));
  };

  const handleBack = () => setStep((s) => Math.max(1, s - 1));

  useEffect(
    () => () => {
      shopImages.forEach((row) => {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      });
    },
    [shopImages],
  );

  const handleShopImagesChange = async (files) => {
    const picked = Array.from(files || []);
    if (!picked.length) return;

    const tooLarge = picked.filter((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge.length) {
      await Swal.fire({
        icon: "error",
        title: "File too large",
        text: "Each shop image must be 5 MB or less.",
        confirmButtonColor: "#141414",
      });
    }

    const valid = picked.filter((file) => file.size <= MAX_FILE_BYTES);
    if (!valid.length) return;

    const slotsLeft = 5 - shopImages.length;
    if (slotsLeft <= 0) {
      await Swal.fire({
        icon: "info",
        title: "Limit reached",
        text: "You can upload up to 5 shop images.",
        confirmButtonColor: "#141414",
      });
      return;
    }

    const next = valid.slice(0, slotsLeft).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      key: `${file.name}-${file.size}-${file.lastModified}`,
    }));
    setShopImages((prev) => [...prev, ...next]);
  };

  const removeShopImage = (key) => {
    setShopImages((prev) => {
      const target = prev.find((row) => row.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((row) => row.key !== key);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formEl = formRef.current;
    if (!reportFormValidity(formEl)) {
      const invalid = formEl?.querySelector(":invalid");
      const stepEl = invalid?.closest("[data-register-step]");
      if (stepEl?.dataset?.registerStep) {
        setStep(Number(stepEl.dataset.registerStep));
      }
      return;
    }

    for (let stepNum = 1; stepNum <= 3; stepNum += 1) {
      const ok = await validateStep(stepNum);
      if (!ok) {
        setStep(stepNum);
        return;
      }
    }

    setLoading(true);
    try {
      let registrationCategory = category;
      if (vendorPanelType === "both") {
        registrationCategory = await resolveRegistrationCategoryForBoth(categories);
      }

      const data = await vendorPanelRegister(
        {
          vendorPanelType,
          name: form.name.trim(),
          ...(form.email.trim() ? { email: form.email.trim() } : {}),
          phone: form.phone,
          businessName: form.businessName.trim(),
          businessPhone: form.phone,
          ...(needsServiceFlow(vendorPanelType) ? { businessAddress: form.businessAddress.trim() } : {}),
          ...(registrationCategory ? { category: registrationCategory } : {}),
        },
        {
          aadhaarCardFront: aadhaarFrontFile,
          aadhaarCardBack: aadhaarBackFile,
          panCard: panFile,
          shopImages: shopImages.map((row) => row.file),
        },
      );

      const session = normalizePanelAuthSession(data);

      const approved =
        session.approvalRequired === false ||
        String(session.user?.approvalStatus || "").toLowerCase() === "approved";

      await Swal.fire({
        icon: "success",
        title: approved ? "Registration successful" : "Registration submitted",
        text: approved
          ? "Your account is ready. You can start using the vendor panel."
          : "Your application is pending admin approval.",
        confirmButtonColor: "#141414",
        timer: 1600,
        showConfirmButton: false,
      });

      dispatch(setCredentials(session));
      navigate("/vendor/dashboard", { replace: true });
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Registration failed",
        text: err.message || "Could not create account.",
        confirmButtonColor: "#141414",
      });
    } finally {
      setLoading(false);
    }
  };

  const sectionTitle = STEPS[step - 1]?.label ?? "";
  const showServiceDocs = needsServiceFlow(vendorPanelType);
  const showShopCategory = needsShopCategory(vendorPanelType);
  const showShopImages = needsShopImages(vendorPanelType);

  return (
    <div className="vendor-register-page">
      <div className="vendor-register-card">
        <header className="vendor-register-header">
          <div className="vendor-register-header__title">
            <BuildingIcon />
            <span>Vendor Registration</span>
          </div>
          <RegisterStepper currentStep={step} />
        </header>

        <form ref={formRef} className="vendor-register-form" onSubmit={handleSubmit}>
          <div className="vendor-register-body">
            <h2 className="vendor-register-body__title">{sectionTitle}</h2>

            <div
              className={`vendor-register-fields vendor-register-fields--stack${step === 1 ? "" : " d-none"}`}
              data-register-step="1"
            >
              <VendorTypePicker value={vendorPanelType} onChange={setVendorPanelType} />
            </div>

            <div
              className={`vendor-register-fields vendor-register-fields--stack${step === 2 ? "" : " d-none"}`}
              data-register-step="2"
            >
              <FormField label="Full Name" required>
                <input
                  className="vendor-register-input"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: sanitizeNameInput(e.target.value) }))}
                  placeholder="Enter your full name"
                  minLength={NAME_MIN}
                  maxLength={NAME_MAX}
                  autoComplete="name"
                  required
                />
              </FormField>
              <FormField label="Email Address">
                <input
                  className="vendor-register-input"
                  type="email"
                  value={form.email}
                  onChange={onChange("email")}
                  placeholder="your.email@example.co.in (optional)"
                  autoComplete="email"
                />
              </FormField>
              <FormField label="Mobile Number" required>
                <input
                  className="vendor-register-input"
                  type="tel"
                  inputMode="numeric"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: sanitizePhoneInput(e.target.value) }))}
                  placeholder="9876543210"
                  minLength={10}
                  maxLength={10}
                  autoComplete="tel"
                  required
                />
              </FormField>
              <FormField label="Business Name" required>
                <input
                  className="vendor-register-input"
                  value={form.businessName}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, businessName: sanitizeBusinessNameInput(e.target.value) }))
                  }
                  maxLength={BUSINESS_NAME_MAX}
                  required
                />
              </FormField>
              {needsServiceFlow(vendorPanelType) ? (
                <FormField label="Address" required>
                  <textarea
                    className="vendor-register-input vendor-register-textarea"
                    value={form.businessAddress}
                    onChange={onChange("businessAddress")}
                    rows={3}
                    minLength={ADDRESS_MIN}
                    maxLength={ADDRESS_MAX}
                    required
                  />
                </FormField>
              ) : null}
            </div>

            <div
              className={`vendor-register-fields vendor-register-fields--stack${step === 3 ? "" : " d-none"}`}
              data-register-step="3"
            >
              {showShopCategory || showShopImages ? (
                <>
                  {showShopCategory ? (
                    <FormField label="Shop Category" required>
                      <select
                        className="vendor-register-input"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        required
                      >
                        <option value="">Select category</option>
                        {categories.map((cat) => (
                          <option key={cat._id || cat.id} value={cat._id || cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  ) : null}
                  {showShopImages ? (
                  <div className="vendor-register-field vendor-register-shop-images">
                    <span className="vendor-register-field__label">
                      Shop Images<span className="required-dot"> *</span>
                    </span>
                    <p className="vendor-register-shop-images__hint">
                      At least 1 image, up to 5 (max. 5MB each)
                    </p>
                    <div className="vendor-shop-images__grid">
                      {shopImages.map((row) => (
                        <div key={row.key} className="vendor-shop-images__tile is-pending">
                          <img src={row.previewUrl} alt="" />
                          <button
                            type="button"
                            className="vendor-shop-images__remove"
                            onClick={() => removeShopImage(row.key)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}

                      {shopImages.length < 5 ? (
                        <label htmlFor={shopImagesInputId} className="vendor-shop-images__add">
                          <span>+ Add image</span>
                          <input
                            id={shopImagesInputId}
                            type="file"
                            accept="image/*"
                            multiple
                            hidden
                            onChange={(e) => {
                              handleShopImagesChange(e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                  </div>
                  ) : null}
                </>
              ) : null}

              {showServiceDocs ? (
                <>
                  <FileUploadZone
                    label="Aadhaar Front"
                    file={aadhaarFrontFile}
                    onFile={setAadhaarFrontFile}
                    inputId={aadhaarFrontInputId}
                    required
                  />
                  <FileUploadZone
                    label="Aadhaar Back"
                    file={aadhaarBackFile}
                    onFile={setAadhaarBackFile}
                    inputId={aadhaarBackInputId}
                    required
                  />
                  <FileUploadZone label="PAN Card" file={panFile} onFile={setPanFile} inputId={panInputId} />
                </>
              ) : null}
            </div>
          </div>

          <footer className={`vendor-register-footer${step === 1 ? " vendor-register-footer--solo" : ""}`}>
            {step > 1 ? (
              <button type="button" className="btn btn--ghost vendor-register-footer__btn" onClick={handleBack} disabled={loading}>
                <ChevronLeft />
                Back
              </button>
            ) : null}

            {step < 3 ? (
              <button
                type="button"
                className="btn btn--primary vendor-register-footer__btn vendor-register-footer__btn--next"
                onClick={handleNext}
                disabled={loading}
              >
                Next
                <ChevronRight />
              </button>
            ) : (
              <button type="submit" className="btn btn--primary vendor-register-footer__btn vendor-register-footer__btn--next" disabled={loading}>
                {loading ? "Submitting…" : "Submit"}
                <ChevronRight />
              </button>
            )}
          </footer>

          {step === 1 ? (
            <p className="vendor-register-login-link">
              Already have an account? <Link to={VENDOR_LOGIN_PATH}>Login</Link>
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
