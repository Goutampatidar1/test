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

/**
 * Validate multiple form sections in order (multi-tab forms).
 * Calls onInvalidSection(tabId, field) before showing the native message.
 */
export function reportSectionsValidity(sections, onInvalidSection) {
  for (const section of sections) {
    const element = section?.element;
    if (!element) continue;

    const fields = element.querySelectorAll("input, select, textarea");
    for (const field of fields) {
      if (field.disabled || field.type === "hidden") continue;
      if (!field.checkValidity()) {
        onInvalidSection?.(section.id, field);
        requestAnimationFrame(() => field.reportValidity());
        return false;
      }
    }
  }
  return true;
}

/** Clear custom validity message when the user edits a field. */
export function bindValidityReset(field) {
  if (!field) return;
  field.addEventListener("input", () => field.setCustomValidity(""));
  field.addEventListener("change", () => field.setCustomValidity(""));
}
