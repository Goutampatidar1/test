import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete } from "react-icons/ai";
import {
  adminApproveHotDeal, adminCreateHotDealRule, adminDeleteHotDealRule, adminListHotDealQueue,
  adminListHotDealRules, adminPreviewHotDeals, adminRejectHotDeal, adminUpdateHotDealRule,
} from "../../api/adminHotDeals.js";
import { getFeatureSettings, patchFeatureSettings } from "../../api/adminMisc.js";
import { adminListVendors } from "../../api/adminVendors.js";
import { logout } from "../../store/authSlice.js";
import { mediaUrl } from "../../media.js";
import { ListPagination } from "../../components/ListPagination.jsx";

const TABS = [{ id: "rules", label: "Hot Deals" }, { id: "queue", label: "Approval Queue" }, { id: "preview", label: "Live Preview" }];
const QUEUE_LIMIT = 10;
const QUEUE_STATUS_PILL = { pending: "pill pill--vendor-pending", approved: "pill pill--vendor-approved", rejected: "pill pill--blocked", none: "pill pill--inactive" };

function emptyRule() { return { name: "", description: "", minDiscountPercent: "0", startsAt: "", endsAt: "", dailyStartHour: "", dailyEndHour: "", vendors: [], status: "active" }; }
function toDateLocalValue(v) { if (!v) return ""; const d = new Date(v); if (Number.isNaN(d.getTime())) return ""; const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
function toTimeValue(h) { if (h === null || h === undefined || h === "") return ""; const n = Number(h); if (!Number.isFinite(n)) return ""; return `${String(n).padStart(2,"0")}:00`; }
function parseTimeToHour(t) { if (!t) return ""; const [h] = t.split(":"); return String(Number(h) || 0); }
function formatInr(a) { return `₹${(Number(a) || 0).toLocaleString("en-IN")}`; }
function idOf(v) { return v && typeof v === "object" ? String(v._id ?? "") : String(v ?? ""); }
function validateRule(f) { if (!f.name.trim()) return "Title is required."; if (!f.vendors.length) return "Please select at least one vendor."; return null; }
function formatDate(d) { if (!d) return "—"; const dt = new Date(d); if (Number.isNaN(dt.getTime())) return "—"; return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
function formatTime(s, e) { if (s == null || e == null) return "All day"; return `${String(s).padStart(2,"0")}:00-${String(e).padStart(2,"0")}:00`; }
function getVendorNames(ids, vendors) { if (!ids?.length) return "All vendors"; const n = ids.map(id => { const v = vendors.find(x => idOf(x) === idOf(id)); return v?.businessName || v?.name || ""; }).filter(Boolean); return n.length <= 2 ? n.join(", ") : `${n.slice(0,2).join(", ")} +${n.length-2} more`; }

function ToggleField({ label, checked, onChange, disabled }) {
  return (<label className="toggle-field"><span className="toggle-field__label">{label}</span><button type="button" role="switch" aria-checked={checked} disabled={disabled} className={`toggle-field__track${checked ? " toggle-field__track--on" : ""}`} onClick={() => onChange(!checked)}><span className="toggle-field__thumb" /></button></label>);
}


function VendorMultiSelect({ vendors, selected, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => !search.trim() ? vendors : vendors.filter(v => v.businessName?.toLowerCase().includes(search.toLowerCase())), [vendors, search]);
  const selectedSet = useMemo(() => new Set(selected.map(idOf)), [selected]);
  const toggle = (id) => { const newSet = new Set(selectedSet); newSet.has(id) ? newSet.delete(id) : newSet.add(id); onChange([...newSet]); };
  const sv = vendors.filter(v => selectedSet.has(idOf(v)));
  return (
    <div className="vendor-multi-select">
      <div className={`vendor-multi-select__trigger${disabled?" vendor-multi-select__trigger--disabled":""}`} onClick={()=>!disabled&&setOpen(!open)}>
        {sv.length===0?<span className="vendor-multi-select__placeholder">Select vendors...</span>:<div className="vendor-multi-select__tags">{sv.slice(0,3).map(v=><span key={idOf(v)} className="vendor-multi-select__tag">{v.businessName||v.name}<button type="button" onClick={e=>{e.stopPropagation();toggle(idOf(v))}}>×</button></span>)}{sv.length>3&&<span className="vendor-multi-select__more">+{sv.length-3}</span>}</div>}
        <span className="vendor-multi-select__arrow">▼</span>
      </div>
      {open&&!disabled&&<div className="vendor-multi-select__dropdown"><input type="text" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} className="vendor-multi-select__search" autoFocus/><div className="vendor-multi-select__list">{filtered.length===0?<div className="vendor-multi-select__empty">No vendors</div>:filtered.map(v=><label key={idOf(v)} className="vendor-multi-select__item"><input type="checkbox" checked={selectedSet.has(idOf(v))} onChange={()=>toggle(idOf(v))}/><span>{v.businessName||v.name}</span></label>)}</div><div className="vendor-multi-select__actions"><button type="button" onClick={()=>setOpen(false)} className="btn btn--ghost">Done</button></div></div>}
      {open&&<div className="vendor-multi-select__backdrop" onClick={()=>setOpen(false)}/>}
    </div>
  );
}

export function HotDealsPage({ initialTab = "rules" }) {
  const dispatch = useDispatch();
  const adminToken = useSelector(s => s.auth.adminToken);
  const [tab, setTab] = useState(initialTab);
  const [settings, setSettings] = useState(null);
  const [settingsMissing, setSettingsMissing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [rules, setRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [form, setForm] = useState(emptyRule());
  const [editId, setEditId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [queue, setQueue] = useState([]);
  const [queueStatus, setQueueStatus] = useState("pending");
  const [queuePage, setQueuePage] = useState(1);
  const [queuePages, setQueuePages] = useState(1);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueLoading, setQueueLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [preview, setPreview] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handleError = useCallback(async (e, t) => { if (e?.status===401) { dispatch(logout()); return; } await Swal.fire({icon:"error",title:t,text:e?.message||"Error"}); }, [dispatch]);

  const loadSettings = useCallback(async () => { if (!adminToken) return; try { const fs = await getFeatureSettings(adminToken); setSettingsMissing(fs === null); setSettings(fs); } catch (e) { await handleError(e, "Could not load settings"); } }, [adminToken, handleError]);
  const loadRules = useCallback(async () => { if (!adminToken) return; setRulesLoading(true); try { setRules((await adminListHotDealRules(adminToken)) ?? []); } catch (e) { await handleError(e, "Could not load hot deals"); } finally { setRulesLoading(false); } }, [adminToken, handleError]);
  const loadVendors = useCallback(async () => { if (!adminToken) return; try { const { vendors: vs } = await adminListVendors(adminToken, { page: 1, limit: 500, status: "active" }); setVendors(vs ?? []); } catch (e) { console.error("Vendors error", e); } }, [adminToken]);
  const loadQueue = useCallback(async () => { if (!adminToken) return; setQueueLoading(true); try { const { rows, pagination } = await adminListHotDealQueue(adminToken, { page: queuePage, limit: QUEUE_LIMIT, status: queueStatus }); setQueue(rows); setQueuePages(pagination?.pages ?? 1); setQueueTotal(pagination?.total ?? 0); } catch (e) { await handleError(e, "Queue error"); } finally { setQueueLoading(false); } }, [adminToken, handleError, queuePage, queueStatus]);
  const loadPreview = useCallback(async () => { if (!adminToken) return; setPreviewLoading(true); try { setPreview((await adminPreviewHotDeals(adminToken)) ?? []); } catch (e) { await handleError(e, "Preview error"); } finally { setPreviewLoading(false); } }, [adminToken, handleError]);

  useEffect(() => { loadSettings(); loadRules(); loadVendors(); }, [loadSettings, loadRules, loadVendors]);
  useEffect(() => { if (tab === "queue") loadQueue(); }, [tab, loadQueue]);
  useEffect(() => { if (tab === "preview") loadPreview(); }, [tab, loadPreview]);

  const updateSetting = async (p) => { if (!adminToken||settingsMissing) return; setSavingSettings(true); try { const n = await patchFeatureSettings(adminToken, p); if (n) setSettings(n); } catch (e) { await handleError(e, "Save failed"); } finally { setSavingSettings(false); } };
  const openCreate = () => { setForm(emptyRule()); setEditId(""); setFormOpen(true); };
  const openEdit = (r) => { setEditId(r._id); setForm({ name: r.name||"", description: r.description||"", minDiscountPercent: String(r.minDiscountPercent??0), startsAt: toDateLocalValue(r.startsAt), endsAt: toDateLocalValue(r.endsAt), dailyStartHour: r.dailyStartHour==null?"":String(r.dailyStartHour), dailyEndHour: r.dailyEndHour==null?"":String(r.dailyEndHour), vendors: (r.vendors||[]).map(idOf), status: r.status||"active" }); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditId(""); setForm(emptyRule()); };

  const onSubmit = async () => {
    const err = validateRule(form);
    if (err) { await Swal.fire({icon:"error",title:"Validation",text:err}); return; }
    const payload = { name: form.name.trim(), description: form.description.trim(), minDiscountPercent: Number(form.minDiscountPercent)||0, startsAt: form.startsAt?new Date(form.startsAt).toISOString():null, endsAt: form.endsAt?new Date(form.endsAt).toISOString():null, dailyStartHour: form.dailyStartHour===""?null:Number(form.dailyStartHour), dailyEndHour: form.dailyEndHour===""?null:Number(form.dailyEndHour), vendors: form.vendors, status: form.status, badge:"Hot Deal", minPrice:0, maxPrice:0, minStock:1, priority:0, requireOptIn:true, autoApprove:false, categories:[], subCategories:[], limit:50 };
    setSaving(true);
    try { if (editId) { await adminUpdateHotDealRule(adminToken, editId, payload); await Swal.fire({icon:"success",title:"Updated",timer:1400}); } else { await adminCreateHotDealRule(adminToken, payload); await Swal.fire({icon:"success",title:"Created",timer:1400}); } closeForm(); await loadRules(); } catch (e) { await handleError(e, "Save failed"); } finally { setSaving(false); }
  };

  const onDelete = async (r) => { const { isConfirmed } = await Swal.fire({icon:"warning",title:"Delete?",text:`Delete "${r.name}"?`,showCancelButton:true,confirmButtonColor:"#dc2626",confirmButtonText:"Delete"}); if (!isConfirmed) return; try { await adminDeleteHotDealRule(adminToken, r._id); if (editId===r._id) closeForm(); await loadRules(); } catch (e) { await handleError(e, "Delete failed"); } };
  const onApprove = async (row) => { setBusyId(row._id); try { await adminApproveHotDeal(adminToken, row._id); await Swal.fire({icon:"success",title:"Approved",timer:1300}); await loadQueue(); } catch (e) { await handleError(e, "Approve failed"); } finally { setBusyId(""); } };
  const onReject = async (row) => { const { value:reason, isConfirmed } = await Swal.fire({title:"Reject?",input:"textarea",inputLabel:"Reason",inputValidator:v=>(String(v||"").trim().length<3?"Reason required":undefined),showCancelButton:true,confirmButtonColor:"#dc2626",confirmButtonText:"Reject"}); if (!isConfirmed) return; setBusyId(row._id); try { await adminRejectHotDeal(adminToken, row._id, String(reason).trim()); await loadQueue(); } catch (e) { await handleError(e, "Reject failed"); } finally { setBusyId(""); } };

  const hotDealsOn = Boolean(settings?.hotDealsEnabled);


  return (
    <div className="page-card">
      <div className="page-card__head"><h2 className="page-card__title">Hot Deals Management</h2></div>
      <div className="settings-tabs-wrap">
        <div className="settings-tabs" role="tablist">{TABS.map(t=><button key={t.id} type="button" role="tab" aria-selected={tab===t.id} className={`settings-tabs__tab${tab===t.id?" settings-tabs__tab--active":""}`} onClick={()=>setTab(t.id)}>{t.label}</button>)}</div>
        {tab==="rules"&&!settingsMissing&&<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12}}><ToggleField checked={hotDealsOn} label="Hot Deals Enabled" disabled={!settings||savingSettings} onChange={v=>updateSetting({hotDealsEnabled:v})}/><small className="data-table__muted">{hotDealsOn?"Live":"Hidden"}</small></div>}
      </div>
      <div className="settings-tab-content">
        {tab==="rules"&&<div className="settings-tab-panel">
          <div className="page-card__head" style={{marginTop:12}}><h3 className="page-card__title" style={{fontSize:"1rem"}}>Hot Deals List</h3><button type="button" className="btn btn--primary" onClick={openCreate}>+ Create Hot Deal</button></div>
          <p className="data-table__muted" style={{marginBottom:16}}>Create hot deals by selecting vendors. Products from selected vendors with "Hot Deal" toggle enabled will be shown.</p>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Title</th><th>Description</th><th>Discount</th><th>Date Range</th><th>Time</th><th>Vendors</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{rulesLoading?<tr><td colSpan={8}>Loading…</td></tr>:rules.length===0?<tr><td colSpan={8}>No hot deals yet.</td></tr>:rules.map(r=><tr key={r._id}><td><strong>{r.name}</strong></td><td><span className="data-table__muted">{r.description||"—"}</span></td><td>{r.minDiscountPercent?`${r.minDiscountPercent}%+`:"Any"}</td><td><small>{formatDate(r.startsAt)} - {formatDate(r.endsAt)}</small></td><td><small>{formatTime(r.dailyStartHour,r.dailyEndHour)}</small></td><td><small>{getVendorNames(r.vendors,vendors)}</small></td><td><span className={`pill ${r.status==="active"?"pill--vendor-approved":"pill--inactive"}`}>{r.status}</span></td><td><div className="row-actions"><button type="button" className="icon-btn icon-btn--edit" title="Edit" onClick={()=>openEdit(r)}><MdEditSquare size={18}/></button><button type="button" className="icon-btn icon-btn--delete" title="Delete" onClick={()=>onDelete(r)}><AiFillDelete size={18}/></button></div></td></tr>)}</tbody>
          </table></div>
        </div>}


        {formOpen&&<div className="modal-overlay" onClick={closeForm}><div className="modal-content modal-content--md" onClick={e=>e.stopPropagation()}>
          <div className="modal-header"><h3>{editId?"Edit Hot Deal":"Create Hot Deal"}</h3><button type="button" className="modal-close" onClick={closeForm}>×</button></div>
          <div className="modal-body"><div className="form-grid">
            <div className="form-group form-group--full"><label className="form-label">Title <span className="required">*</span></label><input type="text" className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g., Summer Sale" maxLength={80}/></div>
            <div className="form-group form-group--full"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Describe this hot deal..." maxLength={300}/></div>
            <div className="form-group"><label className="form-label">Minimum Discount (%)</label><input type="number" className="form-input" value={form.minDiscountPercent} onChange={e=>setForm(f=>({...f,minDiscountPercent:e.target.value}))} min={0} max={100}/><small className="form-hint">Products with at least this discount</small></div>
            <div className="form-group"><label className="form-label">Status</label><select className="form-input" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
            <div className="form-group"><label className="form-label">Start Date</label><input type="date" className="form-input" value={form.startsAt} onChange={e=>setForm(f=>({...f,startsAt:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">End Date</label><input type="date" className="form-input" value={form.endsAt} onChange={e=>setForm(f=>({...f,endsAt:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Start Time (Daily)</label><input type="time" className="form-input" value={toTimeValue(form.dailyStartHour)} onChange={e=>setForm(f=>({...f,dailyStartHour:parseTimeToHour(e.target.value)}))}/><small className="form-hint">Leave empty for all day</small></div>
            <div className="form-group"><label className="form-label">End Time (Daily)</label><input type="time" className="form-input" value={toTimeValue(form.dailyEndHour)} onChange={e=>setForm(f=>({...f,dailyEndHour:parseTimeToHour(e.target.value)}))}/></div>
            <div className="form-group form-group--full"><label className="form-label">Select Vendors <span className="required">*</span></label><VendorMultiSelect vendors={vendors} selected={form.vendors} onChange={ids=>setForm(f=>({...f,vendors:ids}))} disabled={saving}/><small className="form-hint">Products from selected vendors with "Hot Deal" toggle ON will be included</small></div>
          </div></div>
          <div className="modal-footer"><button type="button" className="btn btn--ghost" onClick={closeForm} disabled={saving}>Cancel</button><button type="button" className="btn btn--primary" onClick={onSubmit} disabled={saving}>{saving?"Saving...":editId?"Update":"Create"}</button></div>
        </div></div>}

        {tab==="queue"&&<div className="settings-tab-panel">
          <div className="page-card__head" style={{marginTop:12}}><h3 className="page-card__title" style={{fontSize:"1rem"}}>Products Pending Approval</h3><label className="user-field" style={{margin:0,width:200}}><select className="user-field__input" value={queueStatus} onChange={e=>{setQueueStatus(e.target.value);setQueuePage(1);}}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All</option></select></label></div>
          <p className="data-table__muted" style={{marginBottom:16}}>Products where vendors enabled "Hot Deal" toggle. Approve to show in Hot Deals.</p>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Product</th><th>Vendor</th><th>Price</th><th>Discount</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{queueLoading?<tr><td colSpan={6}>Loading…</td></tr>:queue.length===0?<tr><td colSpan={6}>No products in queue.</td></tr>:queue.map(row=>{const st=row.hotDeal?.status||"none";return<tr key={row._id}><td><div style={{display:"flex",alignItems:"center",gap:10}}>{row.thumbnail&&<img src={mediaUrl(row.thumbnail)} alt="" style={{width:40,height:40,objectFit:"cover",borderRadius:4}}/>}<span>{row.name}</span></div></td><td>{row.vendor?.businessName||"—"}</td><td>{formatInr(row.price)}</td><td>{row.discountPercent?`${row.discountPercent}%`:"—"}</td><td><span className={QUEUE_STATUS_PILL[st]||QUEUE_STATUS_PILL.none}>{st}</span></td><td><div className="row-actions" style={{gap:6}}>{st!=="approved"&&<button type="button" className="btn btn--primary" style={{padding:"4px 10px"}} disabled={busyId===row._id} onClick={()=>onApprove(row)}>Approve</button>}{st!=="rejected"&&<button type="button" className="btn btn--ghost" style={{padding:"4px 10px"}} disabled={busyId===row._id} onClick={()=>onReject(row)}>Reject</button>}</div></td></tr>})}</tbody>
          </table></div>
          <ListPagination page={queuePage} pages={queuePages} total={queueTotal} onPageChange={setQueuePage}/>
        </div>}


        {tab==="preview"&&<div className="settings-tab-panel">
          <div className="page-card__head" style={{marginTop:12}}><h3 className="page-card__title" style={{fontSize:"1rem"}}>What Users See Right Now</h3><button type="button" className="btn btn--ghost" onClick={loadPreview} disabled={previewLoading}>Refresh</button></div>
          {!hotDealsOn&&!settingsMissing&&<p style={{color:"#b45309",marginBottom:16}}>Hot Deals is switched off. Users currently see nothing.</p>}
          <div className="table-scroll"><table className="data-table"><thead><tr><th>#</th><th>Product</th><th>Discount</th><th>Matched Rule</th></tr></thead>
            <tbody>{previewLoading?<tr><td colSpan={4}>Loading…</td></tr>:preview.length===0?<tr><td colSpan={4}>No products qualify right now.</td></tr>:preview.map((row,idx)=><tr key={row._id}><td className="data-table__muted">{idx+1}</td><td>{row.name}</td><td>{row.discountPercent?`${row.discountPercent}%`:"—"}</td><td>{row.rule?.name||"Direct approval"}</td></tr>)}</tbody>
          </table></div>
        </div>}
      </div>
      <style>{`
        .settings-tabs-wrap{display:flex;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap}
        .modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000}
        .modal-content{background:white;border-radius:8px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1)}
        .modal-content--md{width:600px;max-width:95vw}
        .modal-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e5e7eb}
        .modal-header h3{margin:0;font-size:1.125rem;font-weight:600}
        .modal-close{background:none;border:none;font-size:24px;cursor:pointer;color:#6b7280;padding:0;line-height:1}
        .modal-body{padding:20px;overflow-y:auto}
        .modal-footer{display:flex;justify-content:flex-end;gap:10px;padding:16px 20px;border-top:1px solid #e5e7eb}
        .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .form-group{display:flex;flex-direction:column;gap:4px}
        .form-group--full{grid-column:1/-1}
        .form-label{font-size:14px;font-weight:500;color:#374151}
        .form-label .required{color:#dc2626}
        .form-input{padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px}
        .form-input:focus{outline:none;border-color:#3b82f6}
        textarea.form-input{resize:vertical;min-height:60px}
        .form-hint{font-size:12px;color:#6b7280}
        .toggle-field{display:flex;align-items:center;gap:8px}
        .toggle-field__label{font-size:14px;font-weight:500}
        .toggle-field__track{width:44px;height:24px;border-radius:12px;background:#d1d5db;border:none;cursor:pointer;position:relative;transition:background 0.2s}
        .toggle-field__track--on{background:#10b981}
        .toggle-field__thumb{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:white;transition:transform 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)}
        .toggle-field__track--on .toggle-field__thumb{transform:translateX(20px)}
        .vendor-multi-select{position:relative}
        .vendor-multi-select__trigger{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;cursor:pointer;min-height:42px}
        .vendor-multi-select__trigger:hover{border-color:#9ca3af}
        .vendor-multi-select__trigger--disabled{background:#f3f4f6;cursor:not-allowed}
        .vendor-multi-select__placeholder{color:#9ca3af}
        .vendor-multi-select__tags{display:flex;flex-wrap:wrap;gap:4px;flex:1}
        .vendor-multi-select__tag{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:#dbeafe;color:#1d4ed8;border-radius:4px;font-size:13px}
        .vendor-multi-select__tag button{background:none;border:none;padding:0;cursor:pointer;font-size:14px;color:#1d4ed8;line-height:1}
        .vendor-multi-select__more{font-size:13px;color:#6b7280}
        .vendor-multi-select__arrow{font-size:10px;color:#6b7280;margin-left:8px}
        .vendor-multi-select__dropdown{position:absolute;top:100%;left:0;right:0;margin-top:4px;background:white;border:1px solid #d1d5db;border-radius:6px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);z-index:100;max-height:300px;display:flex;flex-direction:column}
        .vendor-multi-select__search{padding:10px 12px;border:none;border-bottom:1px solid #e5e7eb;font-size:14px}
        .vendor-multi-select__search:focus{outline:none}
        .vendor-multi-select__list{overflow-y:auto;max-height:200px;padding:8px 0}
        .vendor-multi-select__item{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;font-size:14px}
        .vendor-multi-select__item:hover{background:#f3f4f6}
        .vendor-multi-select__empty{padding:16px;text-align:center;color:#6b7280}
        .vendor-multi-select__actions{padding:8px 12px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end}
        .vendor-multi-select__backdrop{position:fixed;top:0;left:0;right:0;bottom:0;z-index:99}
      `}</style>
    </div>
  );
}

