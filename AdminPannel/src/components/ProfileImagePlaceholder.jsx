import { IoPersonOutline } from "react-icons/io5";

/** Empty profile / avatar placeholder — never shows "?" */
export function ProfileImagePlaceholder({ size = 40, className = "" }) {
  return (
    <span className={`user-upload__placeholder ${className}`.trim()} aria-hidden="true">
      <IoPersonOutline size={size} />
    </span>
  );
}
