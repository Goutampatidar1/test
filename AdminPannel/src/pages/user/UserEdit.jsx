import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { adminGetUser } from "../../api/adminUsers.js";
import { logout } from "../../store/authSlice.js";
import { NotFoundPage } from "../NotFoundPage.jsx";
import { UserProfileForm } from "./UserAdd.jsx";

export function UserEdit() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [user, setUser] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!adminToken || !userId) return;
    let cancelled = false;
    (async () => {
      setLoadError("");
      setNotFound(false);
      try {
        const u = await adminGetUser(adminToken, userId);
        if (cancelled) return;
        if (!u) {
          setNotFound(true);
          return;
        }
        setUser(u);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 401) {
          dispatch(logout());
          return;
        }
        if (e?.status === 404) {
          setNotFound(true);
          return;
        }
        setLoadError(e.message || "Failed to load user.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch, userId]);

  if (notFound) {
    return <NotFoundPage />;
  }

  if (loadError) {
    return (
      <div className="user-page">
        <p className="user-list-error" role="alert">
          {loadError}
        </p>
        <button type="button" className="btn btn--ghost" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="user-page">
        <p className="static-cms-loading">Loading user…</p>
      </div>
    );
  }

  return (
    <div className="user-page">
      <div className="user-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div>
          <h2 className="user-page__title">Edit user</h2>
        </div>
      </div>

      <div className="user-page__card">
        <UserProfileForm
          key={user._id}
          mode="edit"
          userId={user._id}
          initialUser={user}
          submitLabel="Save changes"
          onCancel={() => navigate("/admin/users")}
          onSuccess={async () => {
            await Swal.fire({
              icon: "success",
              title: "User updated",
              timer: 1500,
            });
            navigate("/admin/users");
          }}
        />
      </div>
    </div>
  );
}
