import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import { venueVendorResetPassword } from "../api/venueVendorAuth.js";
import { VENDOR_LOGIN_PATH } from "../constants/authRoutes.js";
import { reportFormValidity } from "../utils/formValidation.js";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reportFormValidity(e.currentTarget)) return;
    if (!token) {
      await Swal.fire({ icon: "error", title: "Invalid link", text: "Reset token is missing." });
      return;
    }
    if (password.length < 8) {
      await Swal.fire({ icon: "error", title: "Weak password", text: "Use at least 8 characters." });
      return;
    }
    if (password !== confirm) {
      await Swal.fire({ icon: "error", title: "Mismatch", text: "Passwords do not match." });
      return;
    }
    setLoading(true);
    try {
      await venueVendorResetPassword({ token, password });
      setDone(true);
    } catch (err) {
      await Swal.fire({ icon: "error", title: "Reset failed", text: err.message, confirmButtonColor: "#ea580c" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-card__title">Reset password</h1>
        {done ? (
          <p className="auth-card__subtitle">Your password has been updated. You can sign in now.</p>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span className="auth-field__label">New password</span>
              <div className="auth-input-wrap">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </div>
            </label>
            <label className="auth-field">
              <span className="auth-field__label">Confirm password</span>
              <div className="auth-input-wrap">
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
              </div>
            </label>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
        <p className="auth-foot">
          <Link to={VENDOR_LOGIN_PATH}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
