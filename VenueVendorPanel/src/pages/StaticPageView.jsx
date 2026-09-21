import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { getVenueVendorStaticPage } from "../api/staticPages.js";

export function StaticPageView() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const data = await getVenueVendorStaticPage(slug);
        if (cancelled) return;
        if (!data?.title) {
          setNotFound(true);
          return;
        }
        setPage(data);
      } catch (err) {
        if (!cancelled) {
          if (err?.status === 404) setNotFound(true);
          else setPage(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (notFound) {
    return <Navigate to="/vendor/dashboard" replace />;
  }

  if (loading) {
    return (
      <div className="user-page">
        <div className="page-card">
          <p className="page-card__desc">Loading page…</p>
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="user-page">
        <div className="page-card">
          <p className="page-card__desc">Could not load this page.</p>
          <Link to="/vendor/dashboard" className="btn btn--ghost mt-2">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="user-page vendor-static-page">
      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">{page.title}</h2>
        </div>
        <article
          className="vendor-static-page__content"
          dangerouslySetInnerHTML={{ __html: page.content || "" }}
        />
      </div>
    </div>
  );
}
