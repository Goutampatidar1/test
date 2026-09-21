/** Run native HTML5 validation on a form; focus the first invalid field. */
export function reportFormValidity(form) {
  if (!(form instanceof HTMLFormElement)) return true;
  if (form.checkValidity()) return true;
  form.reportValidity();
  return false;
}

/** Validate only fields inside a step/section (multi-step forms). */
export function reportStepValidity(stepElement) {
  if (!stepElement) return true;

  const fields = stepElement.querySelectorAll("input, select, textarea");
  for (const field of fields) {
    if (field.disabled || field.type === "hidden") continue;
    if (!field.checkValidity()) {
      field.reportValidity();
      return false;
    }
  }
  return true;
}
