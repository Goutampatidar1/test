import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { adminGetDeliveryBoy } from "../../api/adminDeliveryBoys.js";
import { adminListCities } from "../../api/adminCities.js";
import { logout } from "../../store/authSlice.js";
import { NotFoundPage } from "../NotFoundPage.jsx";
import { DeliveryForm } from "./DeliveryAdd.jsx";

export function DeliveryEdit() {
  const { deliveryId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [delivery, setDelivery] = useState(null);
  const [cityOptions, setCityOptions] = useState([]);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!adminToken || !deliveryId) return;
    let cancelled = false;
    (async () => {
      try {
        const [data, { cities }] = await Promise.all([
          adminGetDeliveryBoy(adminToken, deliveryId),
          adminListCities(adminToken, { all: true, limit: 500, status: "active" }),
        ]);
        if (cancelled) return;
        if (!data) return setNotFound(true);
        setDelivery(data);
        setCityOptions(cities ?? []);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 401) return dispatch(logout());
        if (e?.status === 404) return setNotFound(true);
        setError(e.message || "Failed to load delivery partner.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, deliveryId, dispatch]);

  if (notFound) return <NotFoundPage />;
  if (error) return <div className="user-page"><p className="user-list-error">{error}</p></div>;
  if (!delivery) return <div className="user-page"><p className="static-cms-loading">Loading delivery partner...</p></div>;

  return (
    <div className="user-page vendor-editor-page">
      <div className="user-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18 9 12l6-6" /></svg>
        </button>
        <div>
          <h2 className="user-page__title">Edit Delivery Partner</h2>
        </div>
      </div>
      <div className="user-page__card vendor-editor-page__card">
        <DeliveryForm
          mode="edit"
          deliveryId={delivery._id}
          initialDelivery={delivery}
          initialCityOptions={cityOptions}
          onCancel={() => navigate("/admin/delivery")}
          onSuccess={async () => {
            await Swal.fire({ icon: "success", title: "Delivery partner updated", timer: 1500 });
            navigate("/admin/delivery");
          }}
        />
      </div>
    </div>
  );
}
