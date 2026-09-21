import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="not-found-page" aria-labelledby="not-found-title">
      <div className="page-card not-found-page__card">
        <div className="not-found-page__badge" aria-hidden="true">
          <span className="not-found-page__badge-text">404</span>
        </div>
        <h1 id="not-found-title" className="not-found-page__title">
          Page not found
        </h1>
        <p className="not-found-page__desc">
          That page does not exist, or the item may have been removed. Check the address or go back
          to the dashboard.
        </p>
        <div className="not-found-page__actions">
          <Link to="/admin/dashboard" className="btn btn--primary">
            Back to dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}
