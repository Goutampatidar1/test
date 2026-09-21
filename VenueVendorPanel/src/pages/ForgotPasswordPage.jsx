import { useState } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { venueVendorForgotPassword } from "../api/venueVendorAuth.js";
import { VENDOR_LOGIN_PATH } from "../constants/authRoutes.js";
import { reportFormValidity } from "../utils/formValidation.js";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reportFormValidity(e.currentTarget)) return;
    setLoading(true);
    try {
      await venueVendorForgotPassword({ email: email.trim() });
      setSent(true);
    } catch (err) {
      await Swal.fire({ icon: "error", title: "Request failed", text: err.message, confirmButtonColor: "#ea580c" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-card__title">Forgot password</h1>
        <p className="auth-card__subtitle">
          {sent
            ? "If an account exists for that email, reset instructions have been sent."
            : "Enter your registered email to receive reset instructions."}
        </p>
        {!sent ? (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span className="auth-field__label">Email ID</span>
              <div className="auth-input-wrap">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </label>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        ) : null}
        <p className="auth-foot">
          <Link to={VENDOR_LOGIN_PATH}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
