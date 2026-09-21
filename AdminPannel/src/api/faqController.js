import api, { authHeader, normalizeApiError } from "../api.js";

function faqBase() {
  return "/admin/faq";
}

export async function adminListFaqs(token, { page = 1, limit = 200, status, search } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (search && String(search).trim()) q.set("search", String(search).trim());
  try {
    const { data } = await api.get(`${faqBase()}?${q}`, { headers: authHeader(token) });
    return {
      faqs: Array.isArray(data.faqs) ? data.faqs : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetFaqById(token, id) {
  try {
    const { data } = await api.get(`${faqBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
    return data.faq;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreateFaq(token, fields) {
  try {
    const { data } = await api.post(
      faqBase(),
      {
        question: String(fields.question ?? "").trim(),
        answer: String(fields.answer ?? "").trim(),
        status: String(fields.status || "active"),
      },
      { headers: authHeader(token) }
    );
    return data.faq;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateFaq(token, id, fields) {
  const payload = {};
  if (fields.question !== undefined) payload.question = String(fields.question).trim();
  if (fields.answer !== undefined) payload.answer = String(fields.answer).trim();
  if (fields.status !== undefined) payload.status = String(fields.status);

  try {
    const { data } = await api.patch(`${faqBase()}/${encodeURIComponent(id)}`, payload, {
      headers: authHeader(token),
    });
    return data.faq;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteFaq(token, id) {
  try {
    await api.delete(`${faqBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
  } catch (error) {
    normalizeApiError(error);
  }
}
