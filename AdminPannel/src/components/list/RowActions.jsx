import { Link } from "react-router-dom";
import { IoEyeSharp } from "react-icons/io5";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete } from "react-icons/ai";

/** View / edit / delete icon buttons; `children` (e.g. Approve/Reject `btn--sm`) render first. */
export function RowActions({ viewTo, onView, editTo, onEdit, onDelete, deleteDisabled = false, children }) {
  return (
    <div className="row-actions list-row-actions">
      {children}
      {viewTo ? (
        <Link to={viewTo} className="icon-btn icon-btn--view" title="View">
          <IoEyeSharp size={18} />
        </Link>
      ) : onView ? (
        <button type="button" className="icon-btn icon-btn--view" title="View" onClick={onView}>
          <IoEyeSharp size={18} />
        </button>
      ) : null}
      {editTo ? (
        <Link to={editTo} className="icon-btn icon-btn--edit" title="Edit">
          <MdEditSquare size={18} />
        </Link>
      ) : onEdit ? (
        <button type="button" className="icon-btn icon-btn--edit" title="Edit" onClick={onEdit}>
          <MdEditSquare size={18} />
        </button>
      ) : null}
      {onDelete ? (
        <button type="button" className="icon-btn icon-btn--delete" title="Delete" onClick={onDelete} disabled={deleteDisabled}>
          <AiFillDelete size={18} />
        </button>
      ) : null}
    </div>
  );
}
