import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete } from "react-icons/ai";
import {
  adminCreateCity,
  adminDeleteCity,
  adminListCities,
  adminUpdateCity,
} from "../../api/adminCities.js";
import {
  adminCreateSubDistrict,
  adminDeleteSubDistrict,
  adminListSubDistricts,
  adminUpdateSubDistrict,
} from "../../api/adminSubDistricts.js";
import {
  adminCreateState,
  adminDeleteState,
  adminListStates,
  adminUpdateState,
} from "../../api/adminStates.js";
import { logout } from "../../store/authSlice.js";

const LIST_LIMIT = 20;
const STATE_NAME_MAX_LEN = 60;
const STATE_CODE_MAX_LEN = 4;

function sanitizeStateNameInput(value) {
  return String(value ?? "")
    .replace(/[^A-Za-z ]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, STATE_NAME_MAX_LEN);
}

function sanitizeStateCodeInput(value) {
  return String(value ?? "")
    .replace(/[^A-Za-z]+/g, "")
    .toUpperCase()
    .slice(0, STATE_CODE_MAX_LEN);
}

function validateStateForm(form) {
  const name = form.name.trim();
  const code = form.code.trim();

  if (!name) return "State name is required.";
  if (!/^[A-Za-z ]+$/.test(name)) {
    return "State name can contain only letters and spaces.";
  }
  if (code && !/^[A-Za-z]+$/.test(code)) {
    return "State code can contain only letters.";
  }
  return "";
}

function emptyStateForm() {
  return { name: "", code: "" };
}

function emptyCityForm() {
  return { name: "", state: "", pincode: "" };
}

function emptySubDistrictForm() {
  return { name: "", city: "" };
}

export function LocationsPage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);

  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [subDistricts, setSubDistricts] = useState([]);
  const [allCityOptions, setAllCityOptions] = useState([]);
  const [stateForm, setStateForm] = useState(emptyStateForm());
  const [cityForm, setCityForm] = useState(emptyCityForm());
  const [subDistrictForm, setSubDistrictForm] = useState(emptySubDistrictForm());
  const [editStateId, setEditStateId] = useState("");
  const [editCityId, setEditCityId] = useState("");
  const [editSubDistrictId, setEditSubDistrictId] = useState("");
  const [filterStateId, setFilterStateId] = useState("");
  const [filterSubDistrictCityId, setFilterSubDistrictCityId] = useState("");
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingSubDistricts, setLoadingSubDistricts] = useState(false);
  const [savingState, setSavingState] = useState(false);
  const [savingCity, setSavingCity] = useState(false);
  const [savingSubDistrict, setSavingSubDistrict] = useState(false);
  const [togglingStateId, setTogglingStateId] = useState("");
  const [togglingCityId, setTogglingCityId] = useState("");
  const [togglingSubDistrictId, setTogglingSubDistrictId] = useState("");

  const loadStates = useCallback(async () => {
    if (!adminToken) return;
    setLoadingStates(true);
    try {
      const { states: rows } = await adminListStates(adminToken, { all: true });
      setStates(rows ?? []);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: e.message || "Failed to load states." });
    } finally {
      setLoadingStates(false);
    }
  }, [adminToken, dispatch]);

  const loadCities = useCallback(async () => {
    if (!adminToken) return;
    setLoadingCities(true);
    try {
      const { cities: rows } = await adminListCities(adminToken, {
        limit: LIST_LIMIT,
        state: filterStateId || undefined,
        all: !filterStateId,
      });
      setCities(rows ?? []);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: e.message || "Failed to load cities." });
    } finally {
      setLoadingCities(false);
    }
  }, [adminToken, dispatch, filterStateId]);

  const loadSubDistricts = useCallback(async () => {
    if (!adminToken) return;
    setLoadingSubDistricts(true);
    try {
      const { subDistricts: rows } = await adminListSubDistricts(adminToken, {
        limit: LIST_LIMIT,
        city: filterSubDistrictCityId || undefined,
        all: !filterSubDistrictCityId,
      });
      setSubDistricts(rows ?? []);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: e.message || "Failed to load sub-districts." });
    } finally {
      setLoadingSubDistricts(false);
    }
  }, [adminToken, dispatch, filterSubDistrictCityId]);

  useEffect(() => {
    loadStates();
  }, [loadStates]);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  useEffect(() => {
    loadSubDistricts();
  }, [loadSubDistricts]);

  useEffect(() => {
    if (!adminToken) {
      setAllCityOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { cities: rows } = await adminListCities(adminToken, { all: true, status: "active", limit: 500 });
        if (!cancelled) setAllCityOptions(rows ?? []);
      } catch {
        if (!cancelled) setAllCityOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken]);

  const resetStateForm = () => {
    setStateForm(emptyStateForm());
    setEditStateId("");
  };

  const resetCityForm = () => {
    setCityForm(emptyCityForm());
    setEditCityId("");
  };

  const resetSubDistrictForm = () => {
    setSubDistrictForm(emptySubDistrictForm());
    setEditSubDistrictId("");
  };

  const onSubmitState = async (e) => {
    e.preventDefault();
    if (!adminToken) return;
    const validationError = validateStateForm(stateForm);
    if (validationError) {
      await Swal.fire({ icon: "error", title: "Validation", text: validationError });
      return;
    }
    const name = stateForm.name.trim();
    setSavingState(true);
    try {
      const payload = {
        name,
        code: stateForm.code.trim() || undefined,
        status: "active",
      };
      if (editStateId) {
        await adminUpdateState(adminToken, editStateId, payload);
        await Swal.fire({ icon: "success", title: "State updated", timer: 1500 });
      } else {
        await adminCreateState(adminToken, payload);
        await Swal.fire({ icon: "success", title: "State created", timer: 1500 });
      }
      resetStateForm();
      await loadStates();
      await loadCities();
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Save failed", text: err.message || "Could not save state." });
    } finally {
      setSavingState(false);
    }
  };

  const onSubmitCity = async (e) => {
    e.preventDefault();
    if (!adminToken) return;
    const name = cityForm.name.trim();
    const state = cityForm.state;
    if (!name || !state) {
      await Swal.fire({ icon: "error", title: "Validation", text: "City name and state are required." });
      return;
    }
    setSavingCity(true);
    try {
      const payload = {
        name,
        state,
        pincode: cityForm.pincode.trim() || undefined,
        status: "active",
      };
      if (editCityId) {
        await adminUpdateCity(adminToken, editCityId, payload);
        await Swal.fire({ icon: "success", title: "City updated", timer: 1500 });
      } else {
        await adminCreateCity(adminToken, payload);
        await Swal.fire({ icon: "success", title: "City created", timer: 1500 });
      }
      resetCityForm();
      await loadCities();
      const { cities: allRows } = await adminListCities(adminToken, { all: true, status: "active", limit: 500 });
      setAllCityOptions(allRows ?? []);
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Save failed", text: err.message || "Could not save city." });
    } finally {
      setSavingCity(false);
    }
  };

  const onEditState = (row) => {
    setEditStateId(row._id);
    setStateForm({ name: row.name || "", code: row.code || "" });
  };

  const onDeleteState = async (row) => {
    if (editStateId) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete state?",
      text: `Delete "${row.name}"? Cities under this state must be removed first.`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeleteState(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "State deleted", timer: 1500 });
      if (filterStateId === row._id) setFilterStateId("");
      await loadStates();
      await loadCities();
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: err.message || "Could not delete state." });
    }
  };

  const onToggleState = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingStateId(row._id);
    try {
      await adminUpdateState(adminToken, row._id, { status: nextStatus });
      await loadStates();
      await loadCities();
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Update failed", text: err.message });
    } finally {
      setTogglingStateId("");
    }
  };

  const onEditCity = (row) => {
    setEditCityId(row._id);
    setCityForm({
      name: row.name || "",
      state: row.state?._id || row.state || "",
      pincode: row.pincode || "",
    });
  };

  const onDeleteCity = async (row) => {
    if (editCityId) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete city?",
      text: `Delete "${row.name}"?`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeleteCity(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "City deleted", timer: 1500 });
      await loadCities();
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: err.message });
    }
  };

  const onToggleCity = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingCityId(row._id);
    try {
      await adminUpdateCity(adminToken, row._id, { status: nextStatus });
      await loadCities();
      await loadSubDistricts();
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Update failed", text: err.message });
    } finally {
      setTogglingCityId("");
    }
  };

  const onSubmitSubDistrict = async (e) => {
    e.preventDefault();
    if (!adminToken) return;
    const name = subDistrictForm.name.trim();
    const city = subDistrictForm.city;
    if (!name || !city) {
      await Swal.fire({ icon: "error", title: "Validation", text: "Sub-district name and city are required." });
      return;
    }
    setSavingSubDistrict(true);
    try {
      const payload = { name, city, status: "active" };
      if (editSubDistrictId) {
        await adminUpdateSubDistrict(adminToken, editSubDistrictId, payload);
        await Swal.fire({ icon: "success", title: "Sub-district updated", timer: 1500 });
      } else {
        await adminCreateSubDistrict(adminToken, payload);
        await Swal.fire({ icon: "success", title: "Sub-district created", timer: 1500 });
      }
      resetSubDistrictForm();
      await loadSubDistricts();
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Save failed", text: err.message || "Could not save sub-district." });
    } finally {
      setSavingSubDistrict(false);
    }
  };

  const onEditSubDistrict = (row) => {
    setEditSubDistrictId(row._id);
    setSubDistrictForm({
      name: row.name || "",
      city: row.city?._id || row.city || "",
    });
  };

  const onDeleteSubDistrict = async (row) => {
    if (editSubDistrictId) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete sub-district?",
      text: `Delete "${row.name}"?`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeleteSubDistrict(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Sub-district deleted", timer: 1500 });
      await loadSubDistricts();
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: err.message });
    }
  };

  const onToggleSubDistrict = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingSubDistrictId(row._id);
    try {
      await adminUpdateSubDistrict(adminToken, row._id, { status: nextStatus });
      await loadSubDistricts();
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Update failed", text: err.message });
    } finally {
      setTogglingSubDistrictId("");
    }
  };

  const activeStates = states.filter((s) => s.status === "active");
  const activeCities = allCityOptions.length ? allCityOptions : cities.filter((c) => c.status === "active");

  return (
    <div className="user-page">
      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">{editStateId ? "Edit State" : "Add State"}</h2>
        </div>
        <form onSubmit={onSubmitState}>
          <div className="row g-3">
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">
                State name <span className="required-dot">*</span>
              </span>
              <input
                className="user-field__input"
                value={stateForm.name}
                onChange={(e) => setStateForm((p) => ({ ...p, name: sanitizeStateNameInput(e.target.value) }))}
                maxLength={STATE_NAME_MAX_LEN}
                required
              />
            </label>
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">State code (optional)</span>
              <input
                className="user-field__input"
                value={stateForm.code}
                onChange={(e) => setStateForm((p) => ({ ...p, code: sanitizeStateCodeInput(e.target.value) }))}
                maxLength={STATE_CODE_MAX_LEN}
                placeholder="e.g. MP"
              />
            </label>
          </div>
          <div className="user-form__actions">
            {editStateId ? (
              <button type="button" className="btn btn--ghost" onClick={resetStateForm}>
                Cancel edit
              </button>
            ) : null}
            <button type="submit" className="btn btn--primary" disabled={savingState}>
              {savingState ? "Saving…" : editStateId ? "Update State" : "Add State"}
            </button>
          </div>
        </form>
      </div>

      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">States</h2>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>S No.</th>
                <th>Name</th>
                <th>Code</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingStates ? (
                <tr>
                  <td colSpan={5}>Loading…</td>
                </tr>
              ) : states.length === 0 ? (
                <tr>
                  <td colSpan={5}>No states found.</td>
                </tr>
              ) : (
                states.map((row, idx) => (
                  <tr key={row._id}>
                    <td className="data-table__muted">{idx + 1}</td>
                    <td>{row.name}</td>
                    <td>{row.code || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`}
                        onClick={() => onToggleState(row)}
                        disabled={togglingStateId === row._id}
                        aria-label={`Toggle ${row.name}`}
                      >
                        <span className="settings-switch__knob" aria-hidden />
                      </button>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-btn icon-btn--edit" onClick={() => onEditState(row)}>
                          <MdEditSquare size={18} />
                        </button>
                        <button
                          type="button"
                          className={`icon-btn icon-btn--delete${editStateId ? " is-disabled" : ""}`}
                          onClick={() => onDeleteState(row)}
                          disabled={Boolean(editStateId)}
                        >
                          <AiFillDelete size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">{editCityId ? "Edit City" : "Add City"}</h2>
        </div>
        <form onSubmit={onSubmitCity}>
          <div className="row g-3">
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">
                State <span className="required-dot">*</span>
              </span>
              <select
                className="user-field__input"
                value={cityForm.state}
                onChange={(e) => setCityForm((p) => ({ ...p, state: e.target.value }))}
                required
              >
                <option value="">Select state</option>
                {activeStates.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">
                City name <span className="required-dot">*</span>
              </span>
              <input
                className="user-field__input"
                value={cityForm.name}
                onChange={(e) => setCityForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </label>
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">Pincode (optional)</span>
              <input
                className="user-field__input"
                value={cityForm.pincode}
                onChange={(e) => setCityForm((p) => ({ ...p, pincode: e.target.value }))}
              />
            </label>
          </div>
          <div className="user-form__actions">
            {editCityId ? (
              <button type="button" className="btn btn--ghost" onClick={resetCityForm}>
                Cancel edit
              </button>
            ) : null}
            <button type="submit" className="btn btn--primary" disabled={savingCity}>
              {savingCity ? "Saving…" : editCityId ? "Update City" : "Add City"}
            </button>
          </div>
        </form>
      </div>

      <div className="page-card">
        <div className="page-card__head" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <h2 className="page-card__title" style={{ margin: 0 }}>
            Cities
          </h2>
          <select
            className="user-field__input"
            style={{ maxWidth: 220 }}
            value={filterStateId}
            onChange={(e) => setFilterStateId(e.target.value)}
          >
            <option value="">All states</option>
            {states.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>S No.</th>
                <th>City</th>
                <th>State</th>
                <th>Pincode</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingCities ? (
                <tr>
                  <td colSpan={6}>Loading…</td>
                </tr>
              ) : cities.length === 0 ? (
                <tr>
                  <td colSpan={6}>No cities found.</td>
                </tr>
              ) : (
                cities.map((row, idx) => (
                  <tr key={row._id}>
                    <td className="data-table__muted">{idx + 1}</td>
                    <td>{row.name}</td>
                    <td>{row.state?.name || "—"}</td>
                    <td>{row.pincode || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`}
                        onClick={() => onToggleCity(row)}
                        disabled={togglingCityId === row._id}
                      >
                        <span className="settings-switch__knob" aria-hidden />
                      </button>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-btn icon-btn--edit" onClick={() => onEditCity(row)}>
                          <MdEditSquare size={18} />
                        </button>
                        <button
                          type="button"
                          className={`icon-btn icon-btn--delete${editCityId ? " is-disabled" : ""}`}
                          onClick={() => onDeleteCity(row)}
                          disabled={Boolean(editCityId)}
                        >
                          <AiFillDelete size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">{editSubDistrictId ? "Edit Sub-District" : "Add Sub-District"}</h2>
          <p className="page-card__desc">Tehsil / Taluka / Subdivision linked to a city.</p>
        </div>
        <form onSubmit={onSubmitSubDistrict}>
          <div className="row g-3">
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">
                City <span className="required-dot">*</span>
              </span>
              <select
                className="user-field__input"
                value={subDistrictForm.city}
                onChange={(e) => setSubDistrictForm((p) => ({ ...p, city: e.target.value }))}
                required
              >
                <option value="">Select city</option>
                {activeCities.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                    {c.state?.name ? `, ${c.state.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">
                Sub-district name <span className="required-dot">*</span>
              </span>
              <input
                className="user-field__input"
                value={subDistrictForm.name}
                onChange={(e) => setSubDistrictForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Huzur, Bhopal City"
                required
              />
            </label>
          </div>
          <div className="user-form__actions">
            {editSubDistrictId ? (
              <button type="button" className="btn btn--ghost" onClick={resetSubDistrictForm}>
                Cancel edit
              </button>
            ) : null}
            <button type="submit" className="btn btn--primary" disabled={savingSubDistrict}>
              {savingSubDistrict ? "Saving…" : editSubDistrictId ? "Update Sub-District" : "Add Sub-District"}
            </button>
          </div>
        </form>
      </div>

      <div className="page-card">
        <div className="page-card__head" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <h2 className="page-card__title" style={{ margin: 0 }}>
            Sub-Districts
          </h2>
          <select
            className="user-field__input"
            style={{ maxWidth: 220 }}
            value={filterSubDistrictCityId}
            onChange={(e) => setFilterSubDistrictCityId(e.target.value)}
          >
            <option value="">All cities</option>
            {allCityOptions.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
                {c.state?.name ? `, ${c.state.name}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>S No.</th>
                <th>Sub-District</th>
                <th>City</th>
                <th>State</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingSubDistricts ? (
                <tr>
                  <td colSpan={6}>Loading…</td>
                </tr>
              ) : subDistricts.length === 0 ? (
                <tr>
                  <td colSpan={6}>No sub-districts found.</td>
                </tr>
              ) : (
                subDistricts.map((row, idx) => (
                  <tr key={row._id}>
                    <td className="data-table__muted">{idx + 1}</td>
                    <td>{row.name}</td>
                    <td>{row.city?.name || "—"}</td>
                    <td>{row.city?.state?.name || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`}
                        onClick={() => onToggleSubDistrict(row)}
                        disabled={togglingSubDistrictId === row._id}
                      >
                        <span className="settings-switch__knob" aria-hidden />
                      </button>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-btn icon-btn--edit" onClick={() => onEditSubDistrict(row)}>
                          <MdEditSquare size={18} />
                        </button>
                        <button
                          type="button"
                          className={`icon-btn icon-btn--delete${editSubDistrictId ? " is-disabled" : ""}`}
                          onClick={() => onDeleteSubDistrict(row)}
                          disabled={Boolean(editSubDistrictId)}
                        >
                          <AiFillDelete size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
