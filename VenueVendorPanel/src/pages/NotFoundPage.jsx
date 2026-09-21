import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="not-found-page">
      <div className="page-card not-found-page__card">
        <div className="not-found-page__badge">
          <span className="not-found-page__badge-text">404</span>
        </div>
        <h1 className="not-found-page__title">Page not found</h1>
        <p className="not-found-page__desc">The page you requested does not exist or was moved.</p>
        <div className="not-found-page__actions">
          <Link to="/" className="btn btn--primary">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
