import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { useDispatch, useSelector } from "react-redux";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete } from "react-icons/ai";
import { IoEyeSharp } from "react-icons/io5";
import {
  adminApproveProduct,
  adminDeleteProduct,
  adminListProducts,
  adminRejectProduct,
  adminUpdateProduct,
} from "../../api/adminProducts.js";
import { logout } from "../../store/authSlice.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { AdminSearchField } from "../../components/AdminSearchField.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";

const LIST_LIMIT = 10;

const LIST_SCOPES = {
  all: {},
  pending: { adminApproved: "false", role: "Vendor" },
  approved: { adminApproved: "true", role: "Vendor" },
  admin: { role: "Admin" },
};

function addedByLabel(row) {
  const who = row.addedById;
  if (!who || typeof who !== "object") return "—";
  return who.businessName || who.name || who.email || "—";
}

export function ProductList() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const admin = useSelector((s) => s.auth.admin);
  const adminId = admin?._id || admin?.id || "";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [listScope, setListScope] = useState("all");
  const [togglingId, setTogglingId] = useState("");
  const [approvingId, setApprovingId] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, listScope]);

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const scope = LIST_SCOPES[listScope] || LIST_SCOPES.all;
      const params = {
        page,
        limit: LIST_LIMIT,
        search: debouncedSearch || undefined,
        ...scope,
      };
      if (listScope === "admin" && adminId) {
        params.addedById = adminId;
      }
      const { products, pagination } = await adminListProducts(adminToken, params);
      setRows(products);
      setPages(pagination?.pages ?? 1);
      setTotal(pagination?.total ?? 0);
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: error.message || "Failed to load products." });
    } finally {
      setLoading(false);
    }
  }, [adminId, adminToken, debouncedSearch, dispatch, listScope, page]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const onDelete = async (row) => {
    if (!adminToken) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete product?",
      text: `This will delete "${row.name}".`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed) return;
    try {
      await adminDeleteProduct(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Product deleted", timer: 1500 });
      await loadRows();
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: error.message || "Could not delete product." });
    }
  };

  const onToggleStatus = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingId(row._id);
    try {
      await adminUpdateProduct(adminToken, row._id, { status: nextStatus });
      await Swal.fire({ icon: "success", title: "Product status updated", timer: 1200 });
      await loadRows();
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Status update failed", text: error.message || "Could not update status." });
    } finally {
      setTogglingId("");
    }
  };

  const onApprove = async (row) => {
    if (!adminToken) return;
    setApprovingId(row._id);
    try {
      await adminApproveProduct(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Product approved", timer: 1500 });
      await loadRows();
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Approve failed", text: error.message || "Could not approve product." });
    } finally {
      setApprovingId("");
    }
  };

  const onReject = async (row) => {
    if (!adminToken) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Reject product?",
      text: `Reject "${row.name}" submitted by vendor?`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Reject",
    });
    if (!isConfirmed) return;
    setApprovingId(row._id);
    try {
      await adminRejectProduct(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Product rejected", timer: 1500 });
      await loadRows();
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Reject failed", text: error.message || "Could not reject product." });
    } finally {
      setApprovingId("");
    }
  };

  return (
    <div className="page-card">
      <div className="page-card__head">
        <div>
          <h2 className="page-card__title">Products</h2>
          <p className="page-card__desc">
            Manage products. Vendor submissions appear under pending approval until you approve them.
          </p>
        </div>
        <div className="page-card__actions user-list-toolbar">
          <div className="user-list-filters">
            <AdminSearchField
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search product..."
              aria-label="Search products"
            />
            <select
              className="user-list-status-select"
              value={listScope}
              onChange={(e) => setListScope(e.target.value)}
              aria-label="Product list filter"
            >
              <option value="all">All products</option>
              <option value="pending">Pending approval (vendor)</option>
              <option value="approved">Approved (vendor)</option>
              <option value="admin">Admin products only</option>
            </select>
          </div>
        </div>
      </div>
      <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>S No.</th>
                <th>Name</th>
                <th>Source</th>
                <th>Added by</th>
                <th>Category</th>
                <th>Sub-Category</th>
                <th>Approval</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>
                    <p className="table-placeholder">Loading products...</p>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <p className="table-placeholder">No products found.</p>
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <ClickableTableRow key={row._id} to={`/admin/products/${row._id}`}>
                    <td className="data-table__muted">{(page - 1) * LIST_LIMIT + idx + 1}</td>
                    <td>{row.name || "—"}</td>
                    <td>{row.role || "—"}</td>
                    <td>{addedByLabel(row)}</td>
                    <td>{row.category?.name || "—"}</td>
                    <td>{row.subCategory?.name || "—"}</td>
                    <td>
                      {row.role === "Vendor" ? (
                        row.adminApproved ? (
                          <span className="pill pill--active">Approved</span>
                        ) : (
                          <span className="pill pill--inactive">Pending</span>
                        )
                      ) : row.role === "Admin" ? (
                        <span className="pill pill--active">Approved</span>
                      ) : (
                        <span className="data-table__muted">—</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`}
                        role="switch"
                        aria-checked={row.status === "active"}
                        onClick={() => onToggleStatus(row)}
                        disabled={togglingId === row._id}
                      >
                        <span className="settings-switch__knob" aria-hidden />
                      </button>
                    </td>
                    <td>
                      <div className="row-actions">
                        {row.role === "Vendor" && !row.adminApproved ? (
                          <>
                            <button
                              type="button"
                              className="btn btn--approve btn--sm"
                              disabled={
                                approvingId === row._id ||
                                row.addedById?.approvalStatus !== "approved"
                              }
                              title={
                                row.addedById?.approvalStatus !== "approved"
                                  ? "Approve the vendor account first"
                                  : "Approve product"
                              }
                              onClick={() => onApprove(row)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              disabled={approvingId === row._id}
                              onClick={() => onReject(row)}
                            >
                              Reject
                            </button>
                          </>
                        ) : null}
                        <Link to={`/admin/products/${row._id}`} className="icon-btn icon-btn--view" title="View">
                          <IoEyeSharp size={18} />
                        </Link>
                        <Link to={`/admin/products/${row._id}/edit`} className="icon-btn icon-btn--edit" title="Edit">
                          <MdEditSquare size={18} />
                        </Link>
                        <button type="button" className="icon-btn icon-btn--delete" title="Delete" onClick={() => onDelete(row)}>
                          <AiFillDelete size={18} />
                        </button>
                      </div>
                    </td>
                  </ClickableTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
        <ListPagination page={page} pages={pages} total={total} onPageChange={setPage} />
    </div>
  );
}
