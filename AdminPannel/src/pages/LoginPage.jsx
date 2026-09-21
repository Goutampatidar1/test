import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { adminLogin } from "../api/adminAuth.js";
import { selectAppDisplayName, selectLoginBrandLogoUrl } from "../store/appConfigSelectors.js";
import { setCredentials } from "../store/authSlice.js";

export function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const brandLogoUrl = useSelector(selectLoginBrandLogoUrl);
  const appDisplayName = useSelector(selectAppDisplayName);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);

  if (adminToken && !lockOpen) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    let data;
    try {
      data = await adminLogin({ email: email.trim(), password });
      setLockOpen(true);
      await new Promise((resolve) => setTimeout(resolve, 450));
      dispatch(
        setCredentials({
          adminToken: data.token,
          refreshToken: data.refreshToken,
          admin: data.user,
        }),
      );
    } catch (err) {
      setLockOpen(false);
      await Swal.fire({
        icon: "error",
        title: "Could not sign in",
        text: err.message || "Login failed. Check your email and password.",
        confirmButtonColor: "#ea580c",
      });
      return;
    } finally {
      setLoading(false);
    }

    const name = data.user?.name?.trim();
    await Swal.fire({
      icon: "success",
      title: "Signed in",
      text: name ? `Welcome, ${name}.` : "Welcome to the admin panel.",
       timer: 1500,
    });
    navigate("/admin/dashboard", { replace: true });
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand__mark" aria-hidden="true">
            {brandLogoUrl ? (
              <img src={brandLogoUrl} alt="" className="auth-brand__logo-img" width={200} height="auto" />
            ) : (
              null
            )}
          </span>
       
        </div>
        <h1 className="auth-card__title">Admin Panel</h1>
        <p className="auth-card__subtitle">
          Enter your credentials to access the admin dashboard.
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span className="auth-field__label">Email ID</span>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <path d="m22 6-10 7L2 6" />
                </svg>
              </span>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder="abc@example.com"
                autoComplete="username"
                required
              />
            </div>
          </label>
          <label className="auth-field">
            <div className="auth-field__row">
              <span className="auth-field__label">Password</span>
              {/* <a className="auth-link" href="#forgot">
                Forgot password?
              </a> */}
            </div>
            <div className="auth-input-wrap">
              <span className={`auth-input-icon${lockOpen ? " auth-input-icon--open" : ""}`} aria-hidden="true">
                {lockOpen ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
              </span>
              <input
                type={passwordVisible ? "text" : "password"}
                name="password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                aria-label={passwordVisible ? "Hide password" : "Show password"}
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((v) => !v)}
              >
                {passwordVisible ? (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
