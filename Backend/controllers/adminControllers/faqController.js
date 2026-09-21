const Faq = require("../../models/other/faq");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");

const ALLOWED_STATUS = new Set(["active", "inactive"]);

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

exports.listFaqs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, search } = req.query;

  const filter = {};
  if (status && String(status).trim()) {
    const normalizedStatus = String(status).trim();
    if (!ALLOWED_STATUS.has(normalizedStatus)) throw new AppError("Invalid status filter", 400);
    filter.status = normalizedStatus;
  }

  const searchOr = searchFilter(search, ["question", "answer"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [faqs, total] = await Promise.all([
    Faq.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Faq.countDocuments(filter),
  ]);

  res.json({
    faqs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getFaqById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const faq = await Faq.findById(req.params.id).lean();
  if (!faq) throw new AppError("FAQ not found", 404);
  res.json({ faq });
});

exports.createFaq = asyncHandler(async (req, res) => {
  const question = normalizeRequired(req.body.question);
  const answer = normalizeRequired(req.body.answer);
  const status = normalizeRequired(req.body.status || "active");

  if (!question || !answer) {
    throw new AppError("Question and answer are required", 400);
  }
  if (!ALLOWED_STATUS.has(status)) {
    throw new AppError("Invalid status", 400);
  }

  const faq = await Faq.create({
    question,
    answer,
    status,
  });

  res.status(201).json({ message: "FAQ created", faq });
});

exports.updateFaq = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const faq = await Faq.findById(req.params.id);
  if (!faq) throw new AppError("FAQ not found", 404);

  if (Object.prototype.hasOwnProperty.call(req.body, "question")) {
    const question = normalizeRequired(req.body.question);
    if (!question) throw new AppError("Question cannot be empty", 400);
    faq.question = question;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "answer")) {
    const answer = normalizeRequired(req.body.answer);
    if (!answer) throw new AppError("Answer cannot be empty", 400);
    faq.answer = answer;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);
    faq.status = status;
  }

  await faq.save();
  res.json({ message: "FAQ updated", faq });
});

exports.deleteFaq = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const faq = await Faq.findById(req.params.id);
  if (!faq) throw new AppError("FAQ not found", 404);

  await Faq.findByIdAndDelete(faq._id);
  res.json({ message: "FAQ deleted" });
});
