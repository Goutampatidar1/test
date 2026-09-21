const { Page } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const {
  STATIC_PAGE_APPS,
  STATIC_PAGE_APP_LABELS,
  normalizeStaticPageApp,
  normalizeStaticPageSlug,
  attachStaticPageUrls,
} = require("../../utils/staticPage");

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePagePayload(body = {}, { partial = false } = {}) {
  const payload = {};

  if (!partial || body.title !== undefined) {
    const title = String(body.title ?? "").trim();
    if (!partial || body.title !== undefined) {
      if (title.length < 3) {
        throw new AppError("Title must be at least 3 characters", 400);
      }
      payload.title = title;
    }
  }

  if (!partial || body.content !== undefined) {
    const content = String(body.content ?? "").trim();
    if (!stripHtml(content)) {
      throw new AppError("Content is required", 400);
    }
    payload.content = content;
  }

  if (!partial) {
    const slug = normalizeStaticPageSlug(body.slug, body.title ?? payload.title);
    if (!slug) {
      throw new AppError("Slug is required", 400);
    }
    payload.slug = slug;
  } else if (body.slug !== undefined) {
    const slug = normalizeStaticPageSlug(body.slug, body.title ?? payload.title);
    if (!slug) {
      throw new AppError("Slug is required", 400);
    }
    payload.slug = slug;
  }

  if (!partial) {
    payload.app = normalizeStaticPageApp(body.app) || "user";
  } else if (body.app !== undefined) {
    const app = normalizeStaticPageApp(body.app);
    if (!app) {
      throw new AppError(
        `Invalid app. Use one of: ${STATIC_PAGE_APPS.join(", ")}`,
        400
      );
    }
    payload.app = app;
  }

  if (!partial || body.status !== undefined) {
    const status = String(body.status || "active").trim().toLowerCase();
    if (!["active", "inactive"].includes(status)) {
      throw new AppError("Invalid status. Use active or inactive", 400);
    }
    payload.status = status;
  }

  return payload;
}

function mapAdminPage(page, req) {
  return attachStaticPageUrls(page, getPublicBaseUrl(req));
}

async function assertPageSlugAvailable({ slug, app, excludeId } = {}) {
  const filter = { slug, app };
  if (excludeId) {
    filter._id = { $ne: excludeId };
  }
  const existing = await Page.findOne(filter).select("title app").lean();
  if (!existing) return;

  const appLabel = STATIC_PAGE_APP_LABELS[app] || app;
  throw new AppError(
    `A page with slug "${slug}" already exists for ${appLabel} (${existing.title}). Use a different slug or edit the existing page.`,
    409
  );
}

exports.createPage = asyncHandler(async (req, res) => {
  const payload = parsePagePayload(req.body);
  await assertPageSlugAvailable({ slug: payload.slug, app: payload.app });

  let page;
  try {
    page = await Page.create(payload);
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError(
        `A page with slug "${payload.slug}" already exists. If this is for a different app, restart the backend so the database index can be updated.`,
        409
      );
    }
    throw err;
  }

  res.status(201).json({
    message: "Page created",
    data: mapAdminPage(page.toObject(), req),
  });
});

exports.getAllPages = asyncHandler(async (req, res) => {
  const filter = {};
  const app = normalizeStaticPageApp(req.query.app);
  if (app) filter.app = app;

  const pages = await Page.find(filter).sort({ app: 1, updatedAt: -1 }).lean();
  const baseUrl = getPublicBaseUrl(req);

  res.json({
    message: "Pages fetched",
    total: pages.length,
    data: pages.map((page) =>
      attachStaticPageUrls({ ...page, app: page.app || "user" }, baseUrl)
    ),
  });
});

exports.getPageById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "Invalid page id");
  const page = await Page.findById(req.params.id).lean();
  if (!page) {
    throw new AppError("Page not found", 404);
  }
  res.json({ message: "Page fetched", data: mapAdminPage(page, req) });
});

exports.getPageBySlug = asyncHandler(async (req, res) => {
  const slug = normalizeStaticPageSlug(req.params.slug);
  if (!slug) {
    throw new AppError("Slug is required", 400);
  }

  const filter = { slug };
  const app = normalizeStaticPageApp(req.query.app);
  if (app) filter.app = app;

  const page = await Page.findOne(filter).lean();
  if (!page) {
    throw new AppError("Page not found", 404);
  }
  res.json({ message: "Page fetched", data: mapAdminPage(page, req) });
});

exports.updatePage = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "Invalid page id");
  const payload = parsePagePayload(req.body, { partial: true });
  if (!Object.keys(payload).length) {
    throw new AppError("No valid fields to update", 400);
  }

  const current = await Page.findById(req.params.id).select("slug app").lean();
  if (!current) {
    throw new AppError("Page not found", 404);
  }

  const nextSlug = payload.slug ?? current.slug;
  const nextApp = payload.app ?? current.app ?? "user";
  if (payload.slug !== undefined || payload.app !== undefined) {
    await assertPageSlugAvailable({
      slug: nextSlug,
      app: nextApp,
      excludeId: req.params.id,
    });
  }

  let page;
  try {
    page = await Page.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    }).lean();
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError(
        `A page with slug "${nextSlug}" already exists for this app.`,
        409
      );
    }
    throw err;
  }

  if (!page) {
    throw new AppError("Page not found", 404);
  }
  res.json({ message: "Page updated", data: mapAdminPage(page, req) });
});

exports.deletePage = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "Invalid page id");
  const page = await Page.findByIdAndDelete(req.params.id);
  if (!page) {
    throw new AppError("Page not found", 404);
  }
  res.json({ message: "Page deleted" });
});
