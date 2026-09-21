import { AdminSearchField } from "../components/AdminSearchField.jsx";

export function SectionPage({ title, description }) {
  return (
    <div className="page-card">
      <div className="page-card__head">
        <div>
          <h2 className="page-card__title">{title}</h2>
          {description ? (
            <p className="page-card__desc">{description}</p>
          ) : null}
        </div>
        <div className="page-card__actions">
          <AdminSearchField placeholder={`Search ${title.toLowerCase()}...`} aria-label={`Search ${title}`} />
          <button type="button" className="btn btn--ghost">
            Export Data
          </button>
        </div>
      </div>
      <div className="table-placeholder">
        <h1>Coming soon...</h1>
        <p>
          {/* This route renders inside the shared admin layout (sidebar + header). Replace
          this block with your real table or forms for <strong>{title}</strong>. */}

          Content will be added here.
        </p>
      </div>
    </div>
  );
}
