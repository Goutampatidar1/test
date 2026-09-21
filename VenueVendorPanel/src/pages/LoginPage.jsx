import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, Navigate, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { vendorPanelSendOtp, vendorPanelVerifyOtp } from "../api/vendorPanelAuth.js";
import { BrandLogoMark } from "../components/BrandLogoMark.jsx";
import { selectPanelLogoPath } from "../store/appConfigSelectors.js";
import { setCredentials } from "../store/authSlice.js";
import { VENDOR_REGISTER_PATH } from "../constants/authRoutes.js";

import { isValidIndianMobile, sanitizePhoneInput } from "../utils/validation.js";
import { reportFormValidity } from "../utils/formValidation.js";

const OTP_LENGTH = 4;
const DEFAULT_RESEND_COOLDOWN = 30;

function sanitizeOtpDigit(value) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 1);
}

async function showCouldNotSendOtp(err) {
  await Swal.fire({
    icon: "error",
    title: "Could not send OTP",
    text: err?.message || "Please check your mobile number and try again.",
    confirmButtonText: "OK",
    confirmButtonColor: "#141414",
    ...devOtpSwalOptions(),
  });
}

function unwrapApiPayload(data) {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (Array.isArray(data.data) && data.data[0] && typeof data.data[0] === "object") {
      return data.data[0];
    }
    if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
      return data.data;
    }
    return data;
  }
  return data ?? {};
}

function extractOtpFromResponse(data) {
  const payload = unwrapApiPayload(data);
  const otp = payload?.otp ?? data?.otp;
  if (otp === undefined || otp === null || otp === "") return null;
  return String(otp);
}

function extractResendAfterSeconds(data) {
  const payload = unwrapApiPayload(data);
  const seconds = payload?.resendAfterSeconds ?? data?.resendAfterSeconds;
  const parsed = Number(seconds);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RESEND_COOLDOWN;
}

function parseResendWaitSeconds(message) {
  const match = String(message ?? "").match(/wait\s+(\d+)\s+seconds/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function devOtpSwalOptions() {
  return {
    target: document.body,
    heightAuto: false,
    customClass: { container: "vendor-login-swal" },
  };
}

async function showDevOtpAlert(otp, title) {
  await Swal.fire({
    icon: "info",
    title,
    html: `Development OTP: <strong>${otp}</strong>`,
    confirmButtonColor: "#141414",
    ...devOtpSwalOptions(),
  });
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

export function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = useSelector((s) => s.auth.token);
  const brandLogoPath = useSelector(selectPanelLogoPath);
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef([]);

  useEffect(() => {
    document.title = "Vendor Login";
    document.body.classList.add("vendor-auth-active");

    return () => {
      document.body.classList.remove("vendor-auth-active");
    };
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;

    const timerId = window.setTimeout(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearTimeout(timerId);
  }, [resendCooldown]);

  if (token) {
    return <Navigate to="/vendor/dashboard" replace />;
  }

  const otpValue = otpDigits.join("");
  const phoneDisplay = phone ? `+91 ${phone}` : "";

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!reportFormValidity(e.currentTarget)) return;
    if (!isValidIndianMobile(phone)) {
      await Swal.fire({
        icon: "error",
        title: "Invalid mobile number",
        text: "Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.",
        confirmButtonColor: "#141414",
      });
      return;
    }

    setLoading(true);
    try {
      const data = await vendorPanelSendOtp({ phone });
      const devOtp = extractOtpFromResponse(data);
      setDevOtpHint(devOtp || "");

      if (devOtp) {
        await showDevOtpAlert(devOtp, "OTP sent");
      }

      setStep("otp");
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      setResendCooldown(extractResendAfterSeconds(data));
      requestAnimationFrame(() => otpRefs.current[0]?.focus());
    } catch (err) {
      await showCouldNotSendOtp(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    const digit = sanitizeOtpDigit(value);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = String(e.clipboardData.getData("text") ?? "")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (!pasted) return;

    const next = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((ch, i) => {
      next[i] = ch;
    });
    setOtpDigits(next);
    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    otpRefs.current[focusIndex]?.focus();
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!reportFormValidity(e.currentTarget)) return;
    if (otpValue.length !== OTP_LENGTH) {
      await Swal.fire({
        icon: "error",
        title: "Enter OTP",
        text: `Enter the ${OTP_LENGTH}-digit code sent to your mobile.`,
        confirmButtonColor: "#141414",
      });
      return;
    }

    setLoading(true);
    try {
      const data = await vendorPanelVerifyOtp({ phone, otp: otpValue });
      dispatch(
        setCredentials({
          token: data.token,
          refreshToken: data.refreshToken,
          user: data.user,
          panelMode: data.panelMode,
          capabilities: data.capabilities,
          vendorPanelType: data.vendorPanelType,
          accounts: data.accounts,
        }),
      );
      await Swal.fire({
        icon: "success",
        title: "Signed in",
        text: data.user?.businessName ? `Welcome, ${data.user.businessName}.` : "Welcome back.",
        timer: 1500,
        showConfirmButton: false,
      });
      navigate("/vendor/dashboard", { replace: true });
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Verification failed",
        text: err.message || "Invalid or expired OTP. Try again or resend.",
        confirmButtonColor: "#141414",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;

    setLoading(true);
    try {
      const data = await vendorPanelSendOtp({ phone });
      const devOtp = extractOtpFromResponse(data);
      setDevOtpHint(devOtp || "");
      setResendCooldown(extractResendAfterSeconds(data));

      if (devOtp) {
        await showDevOtpAlert(devOtp, "OTP resent");
      }

      setOtpDigits(Array(OTP_LENGTH).fill(""));
      requestAnimationFrame(() => otpRefs.current[0]?.focus());
    } catch (err) {
      const waitSeconds = parseResendWaitSeconds(err?.message);
      if (waitSeconds) {
        setResendCooldown(waitSeconds);
      }
      await showCouldNotSendOtp(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeNumber = () => {
    setStep("phone");
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    setDevOtpHint("");
    setResendCooldown(0);
  };

  return (
    <div className="vendor-login-page">
      <div className="vendor-login-card">
        <BrandLogoMark logoPath={brandLogoPath} size={56} className="vendor-login-logo-wrap" imgClassName="vendor-login-logo" />

        <h1 className="vendor-login-title">Vendor Login</h1>
        <p className="vendor-login-subtitle">
          {step === "phone"
            ? "Sign in to manage your shop or services"
            : `Enter the OTP sent to ${phoneDisplay || `+91 ${phone}`}`}
        </p>

        {step === "phone" ? (
          <form className="vendor-login-form" onSubmit={handleSendOtp}>
            <label className="vendor-login-field">
              <span className="vendor-login-label">Mobile Number</span>
              <div className="vendor-login-input">
                <span className="vendor-login-input__icon">
                  <PhoneIcon />
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                  placeholder="+91 1234567890"
                  autoComplete="tel"
                  maxLength={10}
                  required
                />
              </div>
            </label>

            <button type="submit" className="vendor-login-btn" disabled={loading}>
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form className="vendor-login-form" onSubmit={handleVerifyOtp}>
            <input type="hidden" value={otpValue} required minLength={OTP_LENGTH} maxLength={OTP_LENGTH} tabIndex={-1} aria-hidden="true" />
            <div className="vendor-login-field">
              <span className="vendor-login-label">OTP</span>
              <div className="vendor-login-otp" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      otpRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    className="vendor-login-otp__box"
                    value={digit}
                    maxLength={1}
                    aria-label={`Digit ${index + 1}`}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  />
                ))}
              </div>
              {devOtpHint ? (
                <p className="vendor-login-dev-otp" role="status">
                  Test OTP (SMS not active): <strong>{devOtpHint}</strong>
                </p>
              ) : null}
            </div>

            <button type="submit" className="vendor-login-btn" disabled={loading}>
              {loading ? "Verifying…" : "Verify OTP"}
            </button>

            <div className="vendor-login-otp-actions">
              <button
                type="button"
                className="vendor-login-link-btn"
                onClick={handleResendOtp}
                disabled={loading || resendCooldown > 0}
              >
                {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : "Resend OTP"}
              </button>
              <button type="button" className="vendor-login-link-btn" onClick={handleChangeNumber} disabled={loading}>
                Change number
              </button>
            </div>
          </form>
        )}

        {step === "phone" ? (
          <p className="vendor-login-foot">
            Don&apos;t have an account?{" "}
            <Link className="vendor-login-foot__link" to={VENDOR_REGISTER_PATH}>
              Register Now
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
