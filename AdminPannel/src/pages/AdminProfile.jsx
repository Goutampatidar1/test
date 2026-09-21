import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import {
  adminChangePassword,
  adminGetMe,
  adminUpdateMe,
  adminUpdateMeWithFile,
} from "../api/adminAuth.js";
import { mediaUrl } from "../media.js";
import { ProfileImagePlaceholder } from "../components/ProfileImagePlaceholder.jsx";
import { setAdmin } from "../store/authSlice.js";
import { sanitizePhoneInput, validateIndianMobileMessage } from "../utils/validation.js";

const PROFILE_TABS = [
  { id: "personal", label: "Personal Details" },
  { id: "password", label: "Change Password" },
];

const NAME_REGEX = /^[A-Za-z ]{2,40}$/;

export function AdminProfile() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const admin = useSelector((s) => s.auth.admin);

  const [tab, setTab] = useState("personal");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState({ cur: false, next: false, conf: false });

  const fileInputRef = useRef(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);

  useEffect(() => {
    if (!admin) return;
    setName(admin.name || "");
    setPhone(admin.phone || "");
  }, [admin]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  useEffect(() => {
    if (!adminToken) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await adminGetMe(adminToken);
        if (!cancelled && data?.user) dispatch(setAdmin(data.user));
      } catch {
        /* handled in layout */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch]);

  const avatarSrc = photoPreviewUrl || mediaUrl(admin?.profileImage);
  const avatarCacheKey = pendingPhotoFile
    ? `${pendingPhotoFile.name}-${pendingPhotoFile.size}-${pendingPhotoFile.lastModified}`
    : admin?.updatedAt || admin?._id || "";

  const handleAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const okTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/jpg"];
    if (!okTypes.includes(file.type)) {
      await Swal.fire({ icon: "error", title: "Invalid image", text: "Please choose a JPEG, PNG, GIF, or WebP image." });
      return;
    }
    const maxMb = 5;
    if (file.size > maxMb * 1024 * 1024) {
      await Swal.fire({ icon: "error", title: "Image too large", text: `Image must be ${maxMb}MB or smaller.` });
      return;
    }

    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPendingPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  };

  const handleNameInput = (e) => {
    const value = e.target.value.replace(/[^A-Za-z ]+/g, "").replace(/\s{2,}/g, " ");
    setName(value);
  };

  const handlePhoneInput = (e) => {
    setPhone(sanitizePhoneInput(e.target.value));
  };

  const handleSave = async () => {
    if (tab === "personal") {
      const trimmedName = name.trim();
      const trimmedPhone = phone.trim();
      if (!trimmedName) {
        await Swal.fire({ icon: "error", title: "Validation error", text: "Full name is required." });
        return;
      }
      if (!NAME_REGEX.test(trimmedName)) {
        await Swal.fire({ icon: "error", title: "Validation error", text: "Full name must contain only letters and spaces." });
        return;
      }
      const phoneError = validateIndianMobileMessage(trimmedPhone, { required: true, label: "Phone number" });
      if (phoneError) {
        await Swal.fire({ icon: "error", title: "Validation error", text: phoneError });
        return;
      }
      setLoading(true);
      try {
        let data;
        if (pendingPhotoFile) {
          data = await adminUpdateMeWithFile(adminToken, {
            name: trimmedName,
            phone: trimmedPhone,
            file: pendingPhotoFile,
          });
          if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
          setPhotoPreviewUrl(null);
          setPendingPhotoFile(null);
        } else {
          data = await adminUpdateMe(adminToken, { name: trimmedName, phone: trimmedPhone });
        }
        if (data?.user) dispatch(setAdmin(data.user));
        await Swal.fire({ icon: "success", title: data?.message || "Profile updated", timer: 1300 });
      } catch (e) {
        await Swal.fire({ icon: "error", title: "Update failed", text: e.message || "Update failed" });
      } finally {
        setLoading(false);
      }
      return;
    }
    if (tab === "password") {
      if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
        await Swal.fire({ icon: "error", title: "Validation error", text: "Fill in current password, new password, and confirmation." });
        return;
      }
      if (newPassword !== confirmPassword) {
        await Swal.fire({ icon: "error", title: "Validation error", text: "New password and confirmation do not match." });
        return;
      }
      if (newPassword.length < 8) {
        await Swal.fire({ icon: "error", title: "Validation error", text: "New password must be at least 8 characters." });
        return;
      }
      setLoading(true);
      try {
        const data = await adminChangePassword(adminToken, {
          currentPassword: currentPassword,
          newPassword,
        });
        await Swal.fire({ icon: "success", title: data?.message || "Password updated", timer: 1300 });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } catch (e) {
        await Swal.fire({ icon: "error", title: "Password change failed", text: e.message || "Password change failed" });
      } finally {
        setLoading(false);
      }
      return;
    }
  };

  return (
    <div className="admin-profile-page">
      <div className="admin-profile-page__head">
        <h2 className="admin-profile-page__title">Admin Profile</h2>
        <button type="button" className="btn btn--save-profile" onClick={handleSave} disabled={loading}>
          {loading ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <div className="admin-profile-card">
        <div className="admin-profile-card__identity">
          <div className={`admin-profile-avatar-wrap${loading ? " admin-profile-avatar-wrap--busy" : ""}`}>
            <input
              ref={fileInputRef}
              type="file"
              className="admin-profile-avatar-file"
              accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
              aria-hidden="true"
              tabIndex={-1}
              onChange={handleAvatarFile}
            />
            {avatarSrc && !photoPreviewUrl ? (
              <img
                key={avatarCacheKey}
                src={`${avatarSrc}${avatarSrc.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(avatarCacheKey))}`}
                alt=""
                className="admin-profile-avatar"
                width={88}
                height={88}
              />
            ) : avatarSrc ? (
              <img
                src={avatarSrc}
                alt=""
                className="admin-profile-avatar"
                width={88}
                height={88}
              />
            ) : (
              <div className="admin-profile-avatar admin-profile-avatar--ph">
                <ProfileImagePlaceholder size={36} />
              </div>
            )}
            <button
              type="button"
              className="admin-profile-avatar-cam"
              aria-label="Change profile photo"
              title="Upload photo"
              disabled={loading}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
            {loading ? <span className="admin-profile-avatar-spinner" aria-live="polite" /> : null}
          </div>
          <div>
            <div className="admin-profile-card__name">{admin?.name || "—"}</div>
            <div className="admin-profile-card__email">{admin?.email || "—"}</div>
          </div>
        </div>

        <div className="admin-profile-tabs" role="tablist">
          {PROFILE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`admin-profile-tabs__btn${tab === t.id ? " admin-profile-tabs__btn--active" : ""}`}
              onClick={() => {
                setTab(t.id);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "personal" && (
          <div className="admin-profile-panel">
            <div className="user-form__grid" style={{ maxWidth: 640 }}>
              <label className="user-field">
                <span className="user-field__label">Full Name <span className="required-dot">*</span></span>
                <input value={name} onChange={handleNameInput} maxLength={40} required />
              </label>
              <label className="user-field">
                <span className="user-field__label">Email ID</span>
                <input value={admin?.email || ""} disabled className="input-disabled" />
              </label>
              <label className="user-field">
                <span className="user-field__label">Mobile Number <span className="required-dot">*</span></span>
                <input value={phone} onChange={handlePhoneInput} placeholder="9876543210" inputMode="numeric" maxLength={10} required />
              </label>
            </div>
          </div>
        )}

        {tab === "password" && (
          <div className="admin-profile-panel">
            <div className="user-form__grid" style={{ maxWidth: 480 }}>
              <label className="user-field">
                <span className="user-field__label">Current Password <span className="required-dot">*</span></span>
                <div className="profile-password-row">
                  <input
                    type={showPw.cur ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="profile-password-eye"
                    aria-label={showPw.cur ? "Hide password" : "Show password"}
                    onClick={() => setShowPw((s) => ({ ...s, cur: !s.cur }))}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
              </label>
              <label className="user-field">
                <span className="user-field__label">New Password <span className="required-dot">*</span></span>
                <div className="profile-password-row">
                  <input
                    type={showPw.next ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="profile-password-eye"
                    aria-label={showPw.next ? "Hide password" : "Show password"}
                    onClick={() => setShowPw((s) => ({ ...s, next: !s.next }))}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
              </label>
              <label className="user-field">
                <span className="user-field__label">Confirm Password <span className="required-dot">*</span></span>
                <div className="profile-password-row">
                  <input
                    type={showPw.conf ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="profile-password-eye"
                    aria-label={showPw.conf ? "Hide password" : "Show password"}
                    onClick={() => setShowPw((s) => ({ ...s, conf: !s.conf }))}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
