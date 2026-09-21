export function todayDateInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startDateMinForEdit(initialStartDate = "") {
  const today = todayDateInputValue();
  if (initialStartDate && initialStartDate < today) return initialStartDate;
  return today;
}

export function endDateMinForPromotion(startDate = "", startDateMin = todayDateInputValue()) {
  if (startDate && startDate >= startDateMin) return startDate;
  return startDateMin;
}

export function applyPromotionStartDateChange(prev, nextStartDate) {
  const next = { ...prev, startDate: nextStartDate };
  if (next.endDate && nextStartDate && next.endDate < nextStartDate) {
    next.endDate = nextStartDate;
  }
  return next;
}

export function validatePromotionDates(
  form,
  { allowExistingPastStart = false, initialStartDate = "" } = {}
) {
  const today = todayDateInputValue();

  if (!form.startDate || !form.endDate) return "Start date and end date are required.";
  if (Number.isNaN(new Date(form.startDate).getTime()) || Number.isNaN(new Date(form.endDate).getTime())) {
    return "Please select valid dates.";
  }

  if (!allowExistingPastStart && form.startDate < today) {
    return "Start date cannot be before today.";
  }

  if (
    allowExistingPastStart &&
    initialStartDate &&
    form.startDate !== initialStartDate &&
    form.startDate < today
  ) {
    return "Start date cannot be before today.";
  }

  if (form.endDate < form.startDate) {
    return "End date cannot be before start date.";
  }

  return "";
}

/** Optional start/end dates (e.g. banners) — same min rules when values are provided */
export function validateOptionalDateRange(
  form,
  { allowExistingPastStart = false, initialStartDate = "" } = {}
) {
  const today = todayDateInputValue();
  const startDate = String(form.startDate ?? "").trim();
  const endDate = String(form.endDate ?? "").trim();

  if (startDate && Number.isNaN(new Date(startDate).getTime())) {
    return "Start date is invalid.";
  }
  if (endDate && Number.isNaN(new Date(endDate).getTime())) {
    return "End date is invalid.";
  }

  if (startDate) {
    if (!allowExistingPastStart && startDate < today) {
      return "Start date cannot be before today.";
    }
    if (
      allowExistingPastStart &&
      initialStartDate &&
      startDate !== initialStartDate &&
      startDate < today
    ) {
      return "Start date cannot be before today.";
    }
  }

  if (endDate && startDate && endDate < startDate) {
    return "End date cannot be before start date.";
  }

  if (endDate && !startDate && endDate < today) {
    return "End date cannot be before today.";
  }

  return "";
}
