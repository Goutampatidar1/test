import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { useDispatch, useSelector } from "react-redux";
import { adminDeleteVendor, adminListVendorDirectory, adminUpdateVendor } from "../../api/adminVendors.js";
import { adminDeleteVenueVendor, adminUpdateVenueVendor } from "../../api/adminVenueVendors.js";
import { logout } from "../../store/authSlice.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";
import { VendorTypeBadge } from "../../components/VendorTypeBadge.jsx";
import {
  ListFilterSelect,
  ListHeader,
  ListTable,
  ListTabs,
  ListToolbar,
  MediaCell,
  RowActions,
  StatusSwitch,
  TextCell,
} from "../../components/list/index.js";
import { useListParams } from "../../hooks/useListParams.js";
import { exportCsv } from "../../utils/exportCsv.js";

const TABS = [
  { key: "", label: "All" },
  { key: "ecom", label: "E-commerce" },
  { key: "service", label: "Service" },
  { key: "both", label: "Both" },
];

const APPROVAL_OPTIONS = [
  { value: "", label: "All approval" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const COLUMNS = [
  { key: "sno", label: "S No." },
  { key: "vendor", label: "Vendor" },
  { key: "contact", label: "Contact" },
  { key: "business", label: "Business" },
  { key: "type", label: "Type" },
  { key: "tax", label: "PAN / GST" },
  { key: "approval", label: "Approval" },
  { key: "status", label: "Status" },
  { key: "actions", label: "Actions" },
];

function StatusBadge({ status }) {
  const s = (status || "").toLowerCase();
  const cls = s === "approved" ? "vendor-approved" : s === "pending" ? "vendor-pending" : "vendor-suspended";
  return <span className={`pill pill--${cls}`}>{status || "—"}</span>;
}

function AddVendorMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="vendor-add" ref={wrapRef}>
      <button
        type="button"
        className="btn btn--accent"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        + Add vendor
      </button>
      {open ? (
        <div className="vendor-add__menu" role="menu">
          <Link to="/admin/vendors/new" className="vendor-add__item" role="menuitem" onClick={() => setOpen(false)}>
            <span className="vendor-add__item-label">E-commerce vendor</span>
            <span className="vendor-add__item-hint">Shop, products and delivery</span>
          </Link>
          <Link to="/admin/venue-vendors/new" className="vendor-add__item" role="menuitem" onClick={() => setOpen(false)}>
            <span className="vendor-add__item-label">Service vendor</span>
            <span className="vendor-add__item-hint">Venues, bookings and enquiries</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function VendorList() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const { params, setParams, searchInput, setSearchInput, resetFilters } = useListParams({
    type: "",
    approvalStatus: "",
    status: "",
  });
  const [vendors, setVendors] = useState([]);
  const [counts, setCounts] = useState({ all: 0, ecom: 0, service: 0, both: 0 });
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [togglingId, setTogglingId] = useState("");
  const limit = 10;

  const loadVendors = useCallback(async () => {
    if (!adminToken) return;
    setLoadError("");
    try {
      const { vendors: rows, pagination: pg, counts: nextCounts } = await adminListVendorDirectory(adminToken, {
        page: params.page,
        limit,
        search: params.search || undefined,
        status: params.status || undefined,
        approvalStatus: params.approvalStatus || undefined,
        type: params.type || undefined,
      });
      setVendors(rows);
      setTotal(pg.total ?? 0);
      setPages(pg.pages ?? 1);
      setCounts(nextCounts);
    } catch (e) {
      if (e?.status === 401) {
        dispatch(logout());
        return;
      }
      setLoadError(e.message || "Failed to load vendors.");
    }
  }, [adminToken, dispatch, params.approvalStatus, params.page, params.search, params.status, params.type]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  const handleDelete = async (row) => {
    const both = row.vendorPanelType === "both";
    const { isConfirmed } = await Swal.fire({
      title: both ? "Delete both vendor accounts?" : "Delete vendor?",
      html: both
        ? `This will remove the e-commerce and service accounts for <strong>${row.businessName || row.name}</strong>.`
        : `This will remove <strong>${row.businessName || row.name}</strong> permanently.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      confirmButtonColor: "#dc2626",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      if (row.source === "ecom" || row.linkedVendorId) {
        await adminDeleteVendor(adminToken, row.linkedVendorId || row._id);
      }
      if (row.source === "service" || row.linkedVenueVendorId) {
        const serviceId = row.linkedVenueVendorId || (row.source === "service" ? row._id : null);
        if (serviceId) await adminDeleteVenueVendor(adminToken, serviceId);
      }
      await Swal.fire({ icon: "success", title: "Vendor deleted", timer: 1500 });
      loadVendors();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: e.message || "Could not delete vendor." });
    }
  };

  const handleToggleStatus = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    try {
      setTogglingId(row._id);
      if (row.source === "ecom" || row.linkedVendorId) {
        await adminUpdateVendor(adminToken, row.linkedVendorId || row._id, { status: nextStatus });
      }
      if (row.source === "service" || (row.vendorPanelType === "both" && row.linkedVenueVendorId)) {
        const serviceId = row.linkedVenueVendorId || (row.source === "service" ? row._id : null);
        if (serviceId) await adminUpdateVenueVendor(adminToken, serviceId, { status: nextStatus });
      }
      await Swal.fire({
        icon: "success",
        title: nextStatus === "active" ? "Vendor activated" : "Vendor deactivated",
        timer: 1500,
      });
      loadVendors();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Update failed", text: e.message || "Could not update vendor." });
    } finally {
      setTogglingId("");
    }
  };

  const canReset = Boolean(params.search || params.approvalStatus || params.status || params.type);

  const handleExportCsv = () => {
    const typeLabel = { ecom: "E-commerce", service: "Service", both: "Both" };
    exportCsv(
      "vendors",
      [
        "Name",
        "Email",
        "Phone",
        "Business Name",
        "Business Phone",
        "Type",
        "PAN",
        "GST",
        "Approval Status",
        "Status",
        "Created At",
        "Vendor ID",
      ],
      vendors.map((row) => [
        row.name || "",
        row.email || "",
        row.phone || "",
        row.businessName || "",
        row.businessPhone || "",
        typeLabel[row.vendorPanelType] || row.vendorPanelType || row.source || "",
        row.panNumber || "",
        row.gstin || "",
        row.approvalStatus || "",
        row.status || "",
        row.createdAt || "",
        row._id || "",
      ])
    );
  };

  return (
    <div className="page-card vendor-list-page">
      <ListHeader
        title="Vendor management"
        subtitle="E-commerce, service, and combined vendor accounts in one place."
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={handleExportCsv}>
              Export CSV
            </button>
            <AddVendorMenu />
          </>
        }
      />

      <ListToolbar
        search={searchInput}
        onSearch={setSearchInput}
        placeholder="Search shop, vendor, phone or email..."
        canReset={canReset}
        onReset={() => resetFilters(["type", "approvalStatus", "status"])}
      >
        <ListFilterSelect
          label="Filter by approval"
          value={params.approvalStatus}
          onChange={(value) => setParams({ approvalStatus: value })}
          options={APPROVAL_OPTIONS}
        />
        <ListFilterSelect
          label="Filter by status"
          value={params.status}
          onChange={(value) => setParams({ status: value })}
          options={STATUS_OPTIONS}
        />
      </ListToolbar>

      <ListTabs
        tabs={TABS}
        active={params.type}
        counts={{
          "": counts.all,
          ecom: counts.ecom,
          service: counts.service,
          both: counts.both,
        }}
        onChange={(type) => setParams({ type })}
        label="Vendor type"
      />

      <ListTable columns={COLUMNS} rowCount={vendors.length} error={loadError} emptyText="No vendors match your filters.">
        {vendors.map((row, idx) => (
          <ClickableTableRow key={`${row.source}-${row._id}`} to={row.viewPath}>
            <td className="data-table__muted">{(params.page - 1) * limit + idx + 1}</td>
            <td>
              <MediaCell image={row.profileImage} primary={row.name || "—"} />
            </td>
            <td>
              <TextCell primary={row.email || "—"} sub={row.phone || "—"} />
            </td>
            <td>
              <TextCell primary={row.businessName || "—"} sub={row.businessPhone || "—"} />
            </td>
            <td>
              <VendorTypeBadge type={row.vendorPanelType} fallback={row.source} />
            </td>
            <td>
              <TextCell primary={row.panNumber || "—"} sub={row.gstin || "—"} />
            </td>
            <td>
              <StatusBadge status={row.approvalStatus} />
            </td>
            <td>
              <StatusSwitch
                active={row.status === "active"}
                onToggle={() => handleToggleStatus(row)}
                disabled={togglingId === row._id}
                label={`Toggle status for ${row.name || row.email}`}
              />
            </td>
            <td>
              <RowActions viewTo={row.viewPath} editTo={row.editPath} onDelete={() => handleDelete(row)} />
            </td>
          </ClickableTableRow>
        ))}
      </ListTable>

      <ListPagination page={params.page} pages={pages} total={total} onPageChange={(page) => setParams({ page })} />
    </div>
  );
}
