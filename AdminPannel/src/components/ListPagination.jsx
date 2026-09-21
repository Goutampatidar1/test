import { useEffect, useMemo, useState } from "react";
import {
  getPaginationRangeFromWindow,
  getPaginationWindowStartForPage,
} from "../utils/pagination.js";

export function ListPagination({ page, pages, total, onPageChange, windowSize = 3 }) {
  const [windowStart, setWindowStart] = useState(1);

  useEffect(() => {
    setWindowStart(1);
  }, [pages]);

  const range = useMemo(
    () => getPaginationRangeFromWindow(windowStart, pages, windowSize),
    [windowStart, pages, windowSize]
  );

  useEffect(() => {
    if (!range.length) return;
    if (!range.includes(page)) {
      setWindowStart(getPaginationWindowStartForPage(page, pages, windowSize));
    }
  }, [page, pages, windowSize, range]);

  if (!pages || pages <= 1) return null;

  const pageInfo =
    total != null
      ? `Page ${page} of ${pages} · ${total} records`
      : `Page ${page} of ${pages}`;

  const applyPage = (nextPage) => {
    const value = Math.min(Math.max(1, nextPage), pages);
    if (typeof onPageChange === "function") {
      onPageChange(value);
    }
  };

  const goToPrevious = () => {
    if (page <= 1) return;
    if (page === windowStart) {
      setWindowStart(Math.max(1, windowStart - 1));
    }
    applyPage(page - 1);
  };

  const goToNext = () => {
    if (page >= pages) return;
    const windowEnd = windowStart + windowSize - 1;
    if (page === windowEnd && page < pages) {
      setWindowStart(Math.min(windowStart + 1, Math.max(1, pages - windowSize + 1)));
    }
    applyPage(page + 1);
  };

  const goToPageNumber = (pageNumber) => {
    const first = range[0];
    const last = range[range.length - 1];

    if (pageNumber < first || pageNumber > last) {
      setWindowStart(getPaginationWindowStartForPage(pageNumber, pages, windowSize));
    }

    applyPage(pageNumber);
  };

  return (
    <div className="user-list-pagination">
      <span className="user-list-pagination__info">{pageInfo}</span>
      <div className="user-list-pagination__btns">
        <button
          type="button"
          className="btn btn--ghost user-list-pagination__nav"
          disabled={page <= 1}
          onClick={goToPrevious}
        >
          Previous
        </button>
        {range.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            className={`btn user-list-pagination__page${pageNumber === page ? " is-active" : ""}`}
            aria-current={pageNumber === page ? "page" : undefined}
            onClick={() => goToPageNumber(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          className="btn btn--ghost user-list-pagination__nav"
          disabled={page >= pages}
          onClick={goToNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}
