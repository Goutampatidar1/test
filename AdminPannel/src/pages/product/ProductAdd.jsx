import { useEffect, useId, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import Select from "react-select";
import { adminListAttributeTitles, adminListAttributeValues } from "../../api/adminAttributes.js";
import { adminListCategories } from "../../api/adminCategories.js";
import { adminCreateProduct } from "../../api/adminProducts.js";
import { adminListSubCategories } from "../../api/adminSubCategories.js";
import { logout } from "../../store/authSlice.js";

function attributeTitleSubCategoryId(title) {
  return String(title?.subCategory?._id || title?.subCategory || "");
}

function attributeTitleMatchesProductScope(title, subCategoryId) {
  return attributeTitleSubCategoryId(title) === String(subCategoryId);
}

function emptyCombination(selectedTitleIds = []) {
  return {
    sku: "",
    price: "",
    discountValue: "0",
    stock: "0",
    status: "active",
    attributes: selectedTitleIds.map((titleId) => ({ attributeTitle: titleId, attributeValue: "" })),
  };
}

function generateSku(existingSkus = []) {
  const used = new Set(existingSkus.map((sku) => String(sku || "").trim()).filter(Boolean));
  let nextSku = "";
  do {
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    nextSku = `SKU-${Date.now()}-${rand}`;
  } while (used.has(nextSku));
  return nextSku;
}

function generateProductSku() {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PRD-${Date.now()}-${rand}`;
}

const multiSelectStyles = {
  control: (base) => ({
    ...base,
    minHeight: 42,
  }),
  valueContainer: (base) => ({
    ...base,
    paddingTop: 4,
    paddingBottom: 4,
  }),
  menu: (base) => ({
    ...base,
    zIndex: 20,
  }),
};

const DECIMAL_STEP = "0.01";

const LIMITS = {
  name: 50,
  description: 2000,
  shortDescription: 500,
};

/** Strips minus signs so numeric fields never store negative values (paste / spin / IME). */
function sanitizeNonNegativeNumericInput(raw) {
  return String(raw ?? "").replace(/-/g, "");
}

function preventNegativeNumberKeyDown(e) {
  if (e.key === "-" || e.code === "Minus" || e.code === "NumpadSubtract") {
    e.preventDefault();
  }
}

function validateProductForm(form, { hasThumbnail }) {
  const name = form.name.trim();
  if (!name) return "Product name is required.";
  if (name.length > LIMITS.name) return `Name cannot exceed ${LIMITS.name} characters.`;

  const description = form.description.trim();
  if (!description) return "Description is required.";
  if (description.length > LIMITS.description) {
    return `Description cannot exceed ${LIMITS.description} characters.`;
  }

  const shortDescription = form.shortDescription.trim();
  if (shortDescription.length > LIMITS.shortDescription) {
    return `Short description cannot exceed ${LIMITS.shortDescription} characters.`;
  }

  if (!hasThumbnail) return "Thumbnail is required.";
  if (!form.category) return "Category is required.";
  if (!form.subCategory) return "Sub-category is required.";

  const moq = Number(form.moq);
  if (Number.isNaN(moq) || moq < 1) return "MOQ must be at least 1.";

  const price = Number(form.price);
  if (Number.isNaN(price)) return "Base price must be a valid number.";
  if (price < 0) return "Base price cannot be negative.";
  if (price < 1) return "Base price must be at least 1.";

  const stock = Number(form.stock);
  if (Number.isNaN(stock) || stock < 0) return "Base stock cannot be negative.";

  const discountValue = Number(form.discountValue);
  if (Number.isNaN(discountValue) || discountValue < 0) return "Discount value cannot be negative.";
  if (form.discountType === "percentage" && discountValue > 100) {
    return "Percentage discount cannot exceed 100.";
  }

  const taxValue = Number(form.taxValue);
  if (Number.isNaN(taxValue) || taxValue < 0) return "Tax value cannot be negative.";

  if (form.variantType === "multi") {
    if (!form.attributeTitles.length) return "Please select at least one variant title.";
    for (let i = 0; i < form.combinations.length; i++) {
      const c = form.combinations[i];
      const row = i + 1;
      if (!String(c.sku || "").trim()) return `Combination row ${row}: SKU is required.`;
      const combinationPrice = Number(c.price);
      const combinationDiscount = Number(c.discountValue);
      const combinationStock = Number(c.stock);
      if (Number.isNaN(combinationPrice)) return `Combination row ${row}: price must be a valid number.`;
      if (combinationPrice < 0) return `Combination row ${row}: price cannot be negative.`;
      if (combinationPrice < 1) return `Combination row ${row}: price must be at least 1.`;
      if (Number.isNaN(combinationDiscount) || combinationDiscount < 0) {
        return `Combination row ${row}: discount cannot be negative.`;
      }
      if (form.discountType === "percentage" && combinationDiscount > 100) {
        return `Combination row ${row}: percentage discount cannot exceed 100.`;
      }
      if (Number.isNaN(combinationStock) || combinationStock < 0) {
        return `Combination row ${row}: stock cannot be negative.`;
      }
      if (!Array.isArray(c.attributes) || c.attributes.length !== form.attributeTitles.length) {
        return `Combination row ${row}: all selected variant values must be present.`;
      }
      if (c.attributes.some((attr) => !attr.attributeTitle || !attr.attributeValue)) {
        return `Combination row ${row}: all variant values are required.`;
      }
    }
  }

  return "";
}

function emptyForm() {
  return {
    name: "",
    sku: generateProductSku(),
    description: "",
    shortDescription: "",
    thumbnail: "",
    category: "",
    subCategory: "",
    moq: "1",
    price: "1",
    stock: "0",
    discountType: "percentage",
    discountValue: "0",
    taxType: "inclusive",
    taxValue: "0",
    variantType: "multi",
    status: "active",
    attributeTitles: [],
    combinations: [{ ...emptyCombination(), sku: generateSku() }],
  };
}

function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function cartesianProduct(groups) {
  if (!groups.length) return [[]];
  return groups.reduce(
    (acc, group) => acc.flatMap((prefix) => group.map((item) => [...prefix, item])),
    [[]]
  );
}

function buildCombinationKey(attributes) {
  return (attributes || [])
    .slice()
    .sort((a, b) => String(a?.attributeTitle || "").localeCompare(String(b?.attributeTitle || "")))
    .map((attr) => `${String(attr.attributeTitle)}:${String(attr.attributeValue || "")}`)
    .join("|");
}

function autoGenerateCombinations({ selectedTitleIds, allAttributeValues, prevCombinations = [] }) {
  const normalizedTitleIds = Array.from(
    new Set((selectedTitleIds || []).map((id) => String(id || "").trim()).filter(Boolean))
  );
  if (!normalizedTitleIds.length) {
    return [{ ...emptyCombination([]), sku: generateSku(prevCombinations.map((c) => c.sku)) }];
  }

  const valueGroups = normalizedTitleIds.map((titleId) =>
    allAttributeValues
      .filter((value) => String(value.attributeTitle?._id || value.attributeTitle) === String(titleId))
      .map((value) => ({ attributeTitle: titleId, attributeValue: value._id }))
  );

  if (valueGroups.some((group) => group.length === 0)) {
    if (prevCombinations.length) return prevCombinations;
    return [{ ...emptyCombination(normalizedTitleIds), sku: generateSku(prevCombinations.map((c) => c.sku)) }];
  }

  const previousByKey = new Map(
    prevCombinations.map((combination) => [buildCombinationKey(combination.attributes), combination])
  );
  const usedSkus = new Set(prevCombinations.map((c) => String(c.sku || "").trim()).filter(Boolean));

  return cartesianProduct(valueGroups).map((attributesSet) => {
    const key = buildCombinationKey(attributesSet);
    const existing = previousByKey.get(key);
    if (existing) {
      return { ...existing, attributes: attributesSet };
    }
    const sku = generateSku(Array.from(usedSkus));
    usedSkus.add(sku);
    return {
      ...emptyCombination(normalizedTitleIds),
      sku,
      attributes: attributesSet,
    };
  });
}

function removeIndexFromFileMap(prev, removeIdx) {
  const next = {};
  Object.entries(prev).forEach(([key, files]) => {
    const idx = Number(key);
    if (Number.isNaN(idx) || idx === removeIdx) return;
    const nextIdx = idx > removeIdx ? idx - 1 : idx;
    next[nextIdx] = files;
  });
  return next;
}

function revokePreviewMap(previewMap = {}) {
  Object.values(previewMap).forEach((items) => {
    (items || []).forEach((item) => {
      if (item?.url) URL.revokeObjectURL(item.url);
    });
  });
}

function fileKey(file) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function mergeUniqueFiles(existingFiles = [], incomingFiles = []) {
  const merged = [...existingFiles];
  const seen = new Set(existingFiles.map((file) => fileKey(file)));
  for (const file of incomingFiles) {
    const key = fileKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(file);
  }
  return merged;
}

const GALLERY_VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";
const MAX_GALLERY_VIDEO_BYTES = 50 * 1024 * 1024;

function isGalleryVideoFile(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return type.startsWith("video/") || /\.(mp4|webm|mov|avi)$/.test(name);
}

function filterGalleryVideoFiles(files) {
  const videos = [];
  const rejected = [];
  for (const file of files) {
    if (!isGalleryVideoFile(file)) {
      rejected.push(`${file.name} is not a video`);
      continue;
    }
    if (file.size > MAX_GALLERY_VIDEO_BYTES) {
      rejected.push(`${file.name} must be 50 MB or less`);
      continue;
    }
    videos.push(file);
  }
  return { videos, rejected };
}

function FormSectionTitle({ children }) {
  return (
    <div className="col-12">
      <h6 className="text-secondary text-uppercase small fw-semibold mb-0 mt-2 border-bottom pb-2">{children}</h6>
    </div>
  );
}

export function ProductAdd() {
  const formId = useId();
  const fid = (name) => `${formId}-${name}`;
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const admin = useSelector((s) => s.auth.admin);
  const adminId = admin?._id || admin?.id || "";

  const [saving, setSaving] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState("");
  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [videoFiles, setVideoFiles] = useState([]);
  const [videoPreviews, setVideoPreviews] = useState([]);
  const [combinationImageFiles, setCombinationImageFiles] = useState({});
  const [combinationImagePreviews, setCombinationImagePreviews] = useState({});
  const [variantTab, setVariantTab] = useState("variants");
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [attributeTitles, setAttributeTitles] = useState([]);
  const [attributeValues, setAttributeValues] = useState([]);

  useEffect(() => {
    return () => {
      revokePreviewMap(combinationImagePreviews);
    };
  }, [combinationImagePreviews]);

  useEffect(() => {
    return () => {
      if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
    };
  }, [thumbnailPreviewUrl]);

  useEffect(() => {
    return () => {
      imagePreviews.forEach((preview) => {
        if (preview?.url) URL.revokeObjectURL(preview.url);
      });
    };
  }, [imagePreviews]);

  useEffect(() => {
    return () => {
      videoPreviews.forEach((preview) => {
        if (preview?.url) URL.revokeObjectURL(preview.url);
      });
    };
  }, [videoPreviews]);

  useEffect(() => {
    if (!adminToken || !adminId) return;
    let cancelled = false;
    (async () => {
      setLoadingOptions(true);
      try {
        const [{ categories: cats }, { subCategories: subs }, { attributeTitles: titles }, { attributeValues: values }] =
          await Promise.all([
            adminListCategories(adminToken, { page: 1, limit: 200, status: "active", role: "Admin", addedById: adminId , mode: "ecom"}),
            adminListSubCategories(adminToken, {
              page: 1,
              limit: 500,
              status: "active",
              role: "Admin",
              addedById: adminId,
              mode: "ecom",
            }),
            adminListAttributeTitles(adminToken, { page: 1, limit: 500, status: "active" }),
            adminListAttributeValues(adminToken, { page: 1, limit: 1000, status: "active" }),
          ]);
        if (cancelled) return;
        setCategories(cats);
        setSubCategories(subs);
        setAttributeTitles(titles);
        setAttributeValues(values);
      } catch (error) {
        if (error?.status === 401) return dispatch(logout());
        await Swal.fire({ icon: "error", title: "Load failed", text: error.message || "Could not load form options." });
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminId, adminToken, dispatch]);

  const subCategoryOptions = useMemo(() => {
    if (!form.category) return [];
    return subCategories.filter((s) => String(s.category?._id || s.category) === String(form.category));
  }, [form.category, subCategories]);

  const subCategoryAttributeTitles = useMemo(() => {
    if (!form.subCategory) return [];
    return attributeTitles.filter((title) => attributeTitleMatchesProductScope(title, form.subCategory));
  }, [attributeTitles, form.subCategory]);

  const subCategoryAttributeValues = useMemo(() => {
    const titleIds = new Set(subCategoryAttributeTitles.map((title) => String(title._id)));
    return attributeValues.filter((value) =>
      titleIds.has(String(value.attributeTitle?._id || value.attributeTitle))
    );
  }, [attributeValues, subCategoryAttributeTitles]);

  const onCategoryChange = (categoryId) => {
    setForm((p) => ({
      ...p,
      category: categoryId,
      subCategory: "",
      attributeTitles: [],
      combinations:
        p.variantType === "multi"
          ? [{ ...emptyCombination([]), sku: generateSku(p.combinations.map((c) => c.sku)) }]
          : p.combinations,
    }));
  };

  const onVariantTypeChange = (value) => {
    setForm((p) => ({
      ...p,
      variantType: value,
      attributeTitles: value === "multi" ? p.attributeTitles : [],
      combinations: value === "multi" ? p.combinations : [{ ...emptyCombination([]), sku: generateSku() }],
    }));
    setVariantTab("variants");
  };

  const onAddCombination = () => {
    setForm((p) => {
      const autoCombinations = autoGenerateCombinations({
        selectedTitleIds: p.attributeTitles,
        allAttributeValues: subCategoryAttributeValues,
        prevCombinations: p.combinations,
      });
      return { ...p, combinations: autoCombinations };
    });
  };

  const onAddCombinationRow = () => {
    if (!form.attributeTitles.length) return;
    setForm((p) => ({
      ...p,
      combinations: [
        ...p.combinations,
        {
          ...emptyCombination(p.attributeTitles),
          sku: generateSku(p.combinations.map((c) => c.sku)),
        },
      ],
    }));
  };

  const onRemoveCombination = (index) => {
    setCombinationImageFiles((prev) => removeIndexFromFileMap(prev, index));
    setCombinationImagePreviews((prev) => {
      const current = prev[index] || [];
      current.forEach((item) => {
        if (item?.url) URL.revokeObjectURL(item.url);
      });
      return removeIndexFromFileMap(prev, index);
    });
    setForm((p) => {
      const next = p.combinations.filter((_, i) => i !== index);
      return {
        ...p,
        combinations: next.length
          ? next
          : [{ ...emptyCombination(p.attributeTitles), sku: generateSku(p.combinations.map((c) => c.sku)) }],
      };
    });
  };

  const onCombinationImagesChange = (idx, files) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    setCombinationImageFiles((prev) => ({
      ...prev,
      [idx]: mergeUniqueFiles(prev[idx] || [], selectedFiles),
    }));
    setCombinationImagePreviews((prev) => {
      const seen = new Set(
        (prev[idx] || []).map((item) =>
          fileKey({ name: item.name, size: item.size, lastModified: item.lastModified })
        )
      );
      const incomingPreviews = selectedFiles
        .filter((file) => !seen.has(fileKey(file)))
        .map((file) => ({
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          url: URL.createObjectURL(file),
        }));
      return {
        ...prev,
        [idx]: [...(prev[idx] || []), ...incomingPreviews],
      };
    });
  };

  const onRemoveMainImage = (removeIdx) => {
    setImageFiles((prev) => prev.filter((_, idx) => idx !== removeIdx));
    setImagePreviews((prev) => {
      const target = prev[removeIdx];
      if (target?.url) URL.revokeObjectURL(target.url);
      return prev.filter((_, idx) => idx !== removeIdx);
    });
  };

  const onRemoveMainVideo = (removeIdx) => {
    setVideoFiles((prev) => prev.filter((_, idx) => idx !== removeIdx));
    setVideoPreviews((prev) => {
      const target = prev[removeIdx];
      if (target?.url) URL.revokeObjectURL(target.url);
      return prev.filter((_, idx) => idx !== removeIdx);
    });
  };

  const onSelectGalleryVideos = (selectedFiles) => {
    const { videos, rejected } = filterGalleryVideoFiles(selectedFiles);
    if (rejected.length) {
      void Swal.fire({ icon: "warning", title: "Some videos were skipped", text: rejected.join("\n") });
    }
    if (!videos.length) return;
    setVideoFiles((prev) => mergeUniqueFiles(prev, videos));
    setVideoPreviews((prev) => {
      const seen = new Set(
        prev.map((item) => fileKey({ name: item.name, size: item.size, lastModified: item.lastModified }))
      );
      const incomingPreviews = videos
        .filter((file) => !seen.has(fileKey(file)))
        .map((file) => ({
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          url: URL.createObjectURL(file),
        }));
      return [...prev, ...incomingPreviews];
    });
  };

  const onRemoveCombinationPreviewImage = (combinationIdx, removePreviewIdx) => {
    setCombinationImageFiles((prev) => ({
      ...prev,
      [combinationIdx]: (prev[combinationIdx] || []).filter((_, idx) => idx !== removePreviewIdx),
    }));
    setCombinationImagePreviews((prev) => {
      const current = prev[combinationIdx] || [];
      const target = current[removePreviewIdx];
      if (target?.url) URL.revokeObjectURL(target.url);
      return {
        ...prev,
        [combinationIdx]: current.filter((_, idx) => idx !== removePreviewIdx),
      };
    });
  };

  const onCombinationChange = (index, key, value) => {
    const nextValue =
      key === "price" || key === "stock" || key === "discountValue" ? sanitizeNonNegativeNumericInput(value) : value;
    setForm((p) => ({
      ...p,
      combinations: p.combinations.map((combination, i) =>
        i === index ? { ...combination, [key]: nextValue } : combination
      ),
    }));
  };

  const onCombinationAttributeChange = (combinationIdx, attrIdx, titleId, attributeValueId) => {
    setForm((p) => ({
      ...p,
      combinations: p.combinations.map((combination, i) => {
        if (i !== combinationIdx) return combination;
        const nextAttributes = combination.attributes.map((attr, j) =>
          j === attrIdx ? { attributeTitle: titleId, attributeValue: attributeValueId } : attr
        );
        return { ...combination, attributes: nextAttributes };
      }),
    }));
  };

  const onAttributeTitlesChange = (selectedTitleIds) => {
    setForm((p) => {
      const autoCombinations = autoGenerateCombinations({
        selectedTitleIds,
        allAttributeValues: subCategoryAttributeValues,
        prevCombinations: p.combinations,
      });
      return { ...p, attributeTitles: selectedTitleIds, combinations: autoCombinations };
    });
  };

  useEffect(() => {
    if (form.variantType !== "multi" || !form.attributeTitles.length) return;
    setForm((p) => ({
      ...p,
      combinations: autoGenerateCombinations({
        selectedTitleIds: p.attributeTitles,
        allAttributeValues: subCategoryAttributeValues,
        prevCombinations: p.combinations,
      }),
    }));
  }, [subCategoryAttributeValues, form.variantType, form.attributeTitles]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!adminToken || !adminId) return;

    const validationMessage = validateProductForm(form, { hasThumbnail: !!thumbnailFile });
    if (validationMessage) {
      await Swal.fire({ icon: "error", title: "Validation error", text: validationMessage });
      return;
    }

    const moq = Number(form.moq);
    const price = Number(form.price);
    const stock = Number(form.stock);
    const discountValue = Number(form.discountValue);
    const taxValue = Number(form.taxValue);

    const normalizedCombinations =
      form.variantType === "multi"
        ? form.combinations.map((combination) => ({
            sku: combination.sku.trim(),
            price: Number(combination.price),
            discountValue: Number(combination.discountValue),
            stock: Number(combination.stock),
            status: combination.status || "active",
            images: [],
            attributes: combination.attributes
              .filter((a) => a.attributeTitle && a.attributeValue)
              .map((a) => ({ attributeTitle: a.attributeTitle, attributeValue: a.attributeValue })),
          }))
        : [];

    if (form.variantType === "multi") {
      const uniqueSkuSet = new Set(normalizedCombinations.map((combination) => String(combination.sku).trim()));
      if (uniqueSkuSet.size !== normalizedCombinations.length) {
        await Swal.fire({ icon: "error", title: "Validation error", text: "Each combination SKU must be unique." });
        return;
      }
      const combinationKeys = normalizedCombinations.map((combination) => buildCombinationKey(combination.attributes));
      const uniqueComboKeys = new Set(combinationKeys);
      if (uniqueComboKeys.size !== combinationKeys.length) {
        await Swal.fire({
          icon: "error",
          title: "Validation error",
          text: "Each variant combination must be unique. Change color, size, or other variant values.",
        });
        return;
      }
    }

    const payload = {
      name: form.name.trim().slice(0, LIMITS.name),
      slug: toSlug(form.name),
      sku: String(form.sku || "").trim() || generateProductSku(),
      description: form.description.trim().slice(0, LIMITS.description),
      shortDescription: form.shortDescription.trim().slice(0, LIMITS.shortDescription),
      images: [],
      videos: [],
      category: form.category,
      subCategory: form.subCategory,
      childCategory: "",
      moq,
      price,
      stock,
      discountType: form.discountType,
      discountValue,
      taxType: form.taxType,
      taxValue,
      variantType: form.variantType,
      attributeTitles: form.attributeTitles,
      combinations: normalizedCombinations,
      adminApproved: true,
      status: form.status,
      role: "Admin",
      addedById: adminId,
    };

    const requestPayload = (() => {
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (key === "images" || key === "videos" || key === "attributeTitles" || key === "combinations") {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value ?? "");
        }
      });
      formData.append("thumbnail", thumbnailFile);
      imageFiles.forEach((file) => formData.append("images", file));
      videoFiles.forEach((file) => formData.append("videos", file));
      Object.entries(combinationImageFiles).forEach(([idx, files]) => {
        (files || []).forEach((file, imageIdx) => {
          formData.append(`combinationImages[${idx}][${imageIdx}]`, file);
        });
      });
      return formData;
    })();

    setSaving(true);
    try {
      const created = await adminCreateProduct(adminToken, requestPayload);
      await Swal.fire({ icon: "success", title: "Product created", timer: 1200 });
      navigate(`/admin/products/${created?._id || ""}`);
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Create failed", text: error.message || "Could not create product." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="user-page">
      <div className="user-page__toolbar d-flex flex-wrap align-items-center gap-2">
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center justify-content-center rounded-circle p-2"
          style={{ width: 40, height: 40 }}
          aria-label="Back"
          onClick={() => navigate(-1)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div className="user-page__toolbar-text flex-grow-1 min-w-0">
          <h2 className="user-page__title h4 mb-0">Create product</h2>
          <p className="user-page__subtitle text-muted small mb-0 mt-1">Add product details, pricing, and variant combinations.</p>
        </div>
        <Link to="/admin/products" className="btn btn-outline-secondary btn-sm text-nowrap">
          Back to list
        </Link>
      </div>

      <div className="card shadow-sm border-0">
        <div className="card-body">
          {loadingOptions ? (
            <div className="d-flex align-items-center gap-2 text-muted py-2 mb-3" role="status">
              <span className="spinner-border spinner-border-sm" aria-hidden="true" />
              Loading form options…
            </div>
          ) : null}
          <form onSubmit={onSubmit}>
            <div className="row g-3">
              <FormSectionTitle>Basic information</FormSectionTitle>

              <div className="col-12 col-lg-6">
                <label htmlFor={fid("name")} className="form-label">
                  Name <span className="text-danger">*</span>
                </label>
                <input
                  id={fid("name")}
                  className="form-control"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Product name"
                  maxLength={LIMITS.name}
                  required
                />
                <div className="form-text">
                  {form.name.length}/{LIMITS.name} characters
                </div>
              </div>
              <div className="col-12 col-lg-6">
                <label htmlFor={fid("sku")} className="form-label">
                  Product SKU <span className="text-muted fw-normal">(auto)</span>
                </label>
                <input id={fid("sku")} className="form-control bg-light" value={form.sku} readOnly tabIndex={-1} />
              </div>
              <div className="col-12 col-md-6">
                <label htmlFor={fid("category")} className="form-label">
                  Category <span className="text-danger">*</span>
                </label>
                <select
                  id={fid("category")}
                  className="form-select"
                  value={form.category}
                  onChange={(e) => onCategoryChange(e.target.value)}
                  required
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-md-6">
                <label htmlFor={fid("subCategory")} className="form-label">
                  Sub-category <span className="text-danger">*</span>
                </label>
                <select
                  id={fid("subCategory")}
                  className="form-select"
                  value={form.subCategory}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      subCategory: e.target.value,
                      attributeTitles: [],
                      combinations:
                        p.variantType === "multi"
                          ? [{ ...emptyCombination([]), sku: generateSku(p.combinations.map((c) => c.sku)) }]
                          : p.combinations,
                    }))
                  }
                  disabled={!form.category}
                  required
                >
                  <option value="">{form.category ? "Select sub-category" : "Select a category first"}</option>
                  {subCategoryOptions.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-md-6">
                <label htmlFor={fid("variantType")} className="form-label">
                  Variant type
                </label>
                <select
                  id={fid("variantType")}
                  className="form-select"
                  value={form.variantType}
                  onChange={(e) => onVariantTypeChange(e.target.value)}
                >
                  <option value="single">Single</option>
                  <option value="multi">Multi</option>
                </select>
                <div className="form-text">Use Multi to add variants (size, color, etc.).</div>
              </div>
              <div className="col-12">
                <label htmlFor={fid("description")} className="form-label">
                  Description <span className="text-danger">*</span>
                </label>
                <textarea
                  id={fid("description")}
                  className="form-control"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Full product description"
                  maxLength={LIMITS.description}
                  required
                />
                <div className="form-text">
                  {form.description.length}/{LIMITS.description} characters
                </div>
              </div>
              <div className="col-12">
                <label htmlFor={fid("shortDescription")} className="form-label">
                  Short description
                </label>
                <textarea
                  id={fid("shortDescription")}
                  className="form-control"
                  rows={2}
                  value={form.shortDescription}
                  onChange={(e) => setForm((p) => ({ ...p, shortDescription: e.target.value }))}
                  placeholder="Optional summary"
                  maxLength={LIMITS.shortDescription}
                />
                <div className="form-text">
                  {form.shortDescription.length}/{LIMITS.shortDescription} characters
                </div>
              </div>
            </div>

            {form.variantType === "multi" ? (
              <>
                <div className="card border mt-2 mb-3 shadow-sm">
                  <div className="card-body">
                    <label className="form-label">
                      Variants <span className="text-danger">*</span>
                    </label>
                    <Select
                      inputId={fid("variants-select")}
                      isMulti
                      closeMenuOnSelect={false}
                      classNamePrefix="react-select"
                      styles={multiSelectStyles}
                      isDisabled={!form.subCategory}
                      options={subCategoryAttributeTitles.map((title) => ({
                        value: title._id,
                        label: title.title,
                      }))}
                      value={form.attributeTitles
                        .map((titleId) => {
                          const matched = subCategoryAttributeTitles.find((title) => String(title._id) === String(titleId));
                          return matched ? { value: matched._id, label: matched.title } : null;
                        })
                        .filter(Boolean)}
                      onChange={(selected) => onAttributeTitlesChange((selected || []).map((option) => option.value))}
                      placeholder={form.subCategory ? "Select one or more variants..." : "Select a sub-category first"}
                      noOptionsMessage={() =>
                        form.subCategory ? "No variants for this sub-category" : "Select a sub-category first"
                      }
                    />
                    <div className="form-text">Select a sub-category first, then choose variant titles (e.g. Size, Color).</div>
                  </div>
                </div>

                {form.attributeTitles.length ? (
                  <div className="card border mb-3 shadow-sm">
                    <div className="card-body">
                      <ul className="nav nav-tabs mb-3" role="tablist">
                        <li className="nav-item" role="presentation">
                          <button
                            type="button"
                            className={`nav-link${variantTab === "variants" ? " active" : ""}`}
                            onClick={() => setVariantTab("variants")}
                            role="tab"
                            aria-selected={variantTab === "variants"}
                          >
                            Variants
                          </button>
                        </li>
                        <li className="nav-item" role="presentation">
                          <button
                            type="button"
                            className={`nav-link${variantTab === "images" ? " active" : ""}`}
                            onClick={() => setVariantTab("images")}
                            role="tab"
                            aria-selected={variantTab === "images"}
                          >
                            Images
                          </button>
                        </li>
                      </ul>
                      {variantTab === "variants" ? (
                        <>
                          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                            <div>
                              <h3 className="h6 mb-1">
                                Auto-generated variant values <span className="text-danger">*</span>
                              </h3>
                              <p className="text-muted small mb-0">
                                Rows are auto-generated from selected variant titles. You can change color, size, and other values per row.
                              </p>
                            </div>
                            <div className="d-flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="btn btn-outline-primary btn-sm text-nowrap"
                                onClick={onAddCombinationRow}
                                disabled={!form.attributeTitles.length}
                              >
                                Add row
                              </button>
                              <button type="button" className="btn btn-outline-secondary btn-sm text-nowrap" onClick={onAddCombination}>
                                Refresh combinations
                              </button>
                            </div>
                          </div>
                          <div className="table-responsive">
                            <table className="table table-bordered table-hover table-sm align-middle mb-0">
                              <thead className="table-light">
                                <tr>
                                  <th>SKU *</th>
                                  {form.attributeTitles.map((titleId) => {
                                    const title = subCategoryAttributeTitles.find((t) => String(t._id) === String(titleId));
                                    return (
                                      <th key={titleId}>
                                        {title?.title || "Variant"} *
                                      </th>
                                    );
                                  })}
                                  <th>Price *</th>
                                  <th>Stock *</th>
                                  <th>Discount</th>
                                  <th>Status</th>
                                  <th className="text-nowrap">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {form.combinations.map((combination, idx) => (
                                  <tr key={`combination-${idx}`}>
                                    <td style={{ minWidth: 140 }}>
                                      <input
                                        className="form-control form-control-sm bg-light"
                                        value={combination.sku}
                                        onChange={(e) => onCombinationChange(idx, "sku", e.target.value)}
                                        readOnly
                                      />
                                    </td>
                                    {form.attributeTitles.map((titleId, attrIdx) => {
                                      const valueOptions = subCategoryAttributeValues.filter(
                                        (value) => String(value.attributeTitle?._id || value.attributeTitle) === String(titleId)
                                      );
                                      return (
                                        <td key={`${titleId}-${idx}`} style={{ minWidth: 120 }}>
                                          <select
                                            className="form-select form-select-sm"
                                            value={combination.attributes[attrIdx]?.attributeValue || ""}
                                            onChange={(e) =>
                                              onCombinationAttributeChange(idx, attrIdx, titleId, e.target.value)
                                            }
                                            required
                                          >
                                            <option value="">Select value</option>
                                            {valueOptions.map((value) => (
                                              <option key={value._id} value={value._id}>
                                                {value.value}
                                              </option>
                                            ))}
                                          </select>
                                        </td>
                                      );
                                    })}
                                    <td style={{ minWidth: 100 }}>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="form-control form-control-sm"
                                        value={combination.price}
                                        onKeyDown={preventNegativeNumberKeyDown}
                                        onChange={(e) => onCombinationChange(idx, "price", e.target.value)}
                                        placeholder="Price"
                                        required
                                      />
                                    </td>
                                    <td style={{ minWidth: 90 }}>
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        className="form-control form-control-sm"
                                        value={combination.stock}
                                        onKeyDown={preventNegativeNumberKeyDown}
                                        onChange={(e) => onCombinationChange(idx, "stock", e.target.value)}
                                        placeholder="Stock"
                                        required
                                      />
                                    </td>
                                    <td style={{ minWidth: 90 }}>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="form-control form-control-sm"
                                        value={combination.discountValue}
                                        onKeyDown={preventNegativeNumberKeyDown}
                                        onChange={(e) => onCombinationChange(idx, "discountValue", e.target.value)}
                                        placeholder="Discount"
                                      />
                                    </td>
                                    <td style={{ minWidth: 110 }}>
                                      <select
                                        className="form-select form-select-sm"
                                        value={combination.status}
                                        onChange={(e) => onCombinationChange(idx, "status", e.target.value)}
                                      >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                      </select>
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className="btn btn-outline-danger btn-sm text-nowrap"
                                        onClick={() => onRemoveCombination(idx)}
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : form.combinations.length ? (
                        <>
                          <div className="mb-3">
                            <h3 className="h6 mb-1">Combination images</h3>
                            <p className="text-muted small mb-0">Upload images per variation row.</p>
                          </div>
                          <div className="table-responsive">
                            <table className="table table-bordered table-hover table-sm align-middle mb-0">
                              <thead className="table-light">
                                <tr>
                                  <th>SKU *</th>
                                  {form.attributeTitles.map((titleId) => {
                                    const title = subCategoryAttributeTitles.find((t) => String(t._id) === String(titleId));
                                    return (
                                      <th key={titleId}>
                                        {title?.title || "Variant"} *
                                      </th>
                                    );
                                  })}
                                  <th>Images</th>
                                </tr>
                              </thead>
                              <tbody>
                                {form.combinations.map((combination, idx) => (
                                  <tr key={`media-row-${idx}`}>
                                    <td className="text-nowrap fw-medium">{combination.sku || `Combination ${idx + 1}`}</td>
                                    {form.attributeTitles.map((titleId, attrIdx) => {
                                      const selectedValue = subCategoryAttributeValues.find(
                                        (value) => String(value._id) === String(combination.attributes[attrIdx]?.attributeValue || "")
                                      );
                                      return <td key={`media-value-${titleId}-${idx}`}>{selectedValue?.value || "—"}</td>;
                                    })}
                                    <td style={{ minWidth: 220 }}>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="form-control form-control-sm"
                                        onChange={(e) => {
                                          onCombinationImagesChange(idx, e.target.files);
                                          e.target.value = "";
                                        }}
                                      />
                                      <div className="form-text">{(combinationImageFiles[idx] || []).length} file(s) selected</div>
                                      {(combinationImagePreviews[idx] || []).length ? (
                                        <div className="d-flex flex-wrap gap-2 mt-2">
                                          {(combinationImagePreviews[idx] || []).map((preview, previewIdx) => (
                                            <div key={`${idx}-${previewIdx}-${preview.name}`} className="position-relative d-inline-block">
                                              <img
                                                src={preview.url}
                                                alt={preview.name || `Variant preview ${previewIdx + 1}`}
                                                title={preview.name}
                                                className="img-thumbnail d-block"
                                                style={{ width: 72, height: 72, objectFit: "cover" }}
                                              />
                                              <button
                                                type="button"
                                                className="btn btn-danger btn-sm position-absolute top-0 end-0 m-1 py-0 px-1 lh-1 rounded-circle shadow-sm"
                                                style={{ width: 22, height: 22, fontSize: "0.85rem" }}
                                                aria-label={`Remove variant image ${previewIdx + 1}`}
                                                onClick={() => onRemoveCombinationPreviewImage(idx, previewIdx)}
                                              >
                                                ×
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <p className="text-muted small mb-0">No variant rows available to upload images.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="row g-3">
              <FormSectionTitle>Media</FormSectionTitle>

              <div className="col-12 col-lg-6">
                <label htmlFor={fid("thumbnail")} className="form-label">
                  Thumbnail <span className="text-danger">*</span>
                </label>
                <input
                  id={fid("thumbnail")}
                  type="file"
                  accept="image/*"
                  className="form-control"
                  onChange={(e) => {
                    const nextFile = e.target.files?.[0] || null;
                    setThumbnailFile(nextFile);
                    setThumbnailPreviewUrl((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return nextFile ? URL.createObjectURL(nextFile) : "";
                    });
                  }}
                  required
                />
                {thumbnailPreviewUrl ? (
                  <div className="mt-2">
                    <img
                      src={thumbnailPreviewUrl}
                      alt="Thumbnail preview"
                      className="img-thumbnail"
                      style={{ maxWidth: 160, maxHeight: 160, objectFit: "cover" }}
                    />
                  </div>
                ) : null}
              </div>
              <div className="col-12 col-lg-6">
                <label htmlFor={fid("images")} className="form-label">
                  Gallery images
                </label>
                <input
                  id={fid("images")}
                  type="file"
                  accept="image/*"
                  multiple
                  className="form-control"
                  onChange={(e) => {
                    const selectedFiles = Array.from(e.target.files || []);
                    if (!selectedFiles.length) return;
                    setImageFiles((prev) => mergeUniqueFiles(prev, selectedFiles));
                    setImagePreviews((prev) => {
                      const seen = new Set(
                        prev.map((item) =>
                          fileKey({ name: item.name, size: item.size, lastModified: item.lastModified })
                        )
                      );
                      const incomingPreviews = selectedFiles
                        .filter((file) => !seen.has(fileKey(file)))
                        .map((file) => ({
                          name: file.name,
                          size: file.size,
                          lastModified: file.lastModified,
                          url: URL.createObjectURL(file),
                        }));
                      return [...prev, ...incomingPreviews];
                    });
                    e.target.value = "";
                  }}
                />
                <div className="form-text">{imageFiles.length} file(s) selected</div>
                {imagePreviews.length ? (
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {imagePreviews.map((preview, idx) => (
                      <div key={`${preview.name}-${idx}`} className="position-relative d-inline-block">
                        <img
                          src={preview.url}
                          alt={preview.name || `Image preview ${idx + 1}`}
                          title={preview.name}
                          className="img-thumbnail d-block"
                          style={{ width: 96, height: 96, objectFit: "cover" }}
                        />
                        <button
                          type="button"
                          className="btn btn-danger btn-sm position-absolute top-0 end-0 m-1 py-0 px-1 lh-1 rounded-circle shadow-sm"
                          style={{ width: 26, height: 26, fontSize: "1rem" }}
                          aria-label={`Remove image ${idx + 1}`}
                          onClick={() => onRemoveMainImage(idx)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="col-12 col-lg-6">
                <label htmlFor={fid("videos")} className="form-label">
                  Gallery videos
                </label>
                <input
                  id={fid("videos")}
                  type="file"
                  accept={GALLERY_VIDEO_ACCEPT}
                  multiple
                  className="form-control"
                  onChange={(e) => {
                    const selectedFiles = Array.from(e.target.files || []);
                    e.target.value = "";
                    if (!selectedFiles.length) return;
                    onSelectGalleryVideos(selectedFiles);
                  }}
                />
                <div className="form-text">
                  MP4, WebM, or MOV · up to 50 MB each · {videoFiles.length} file(s) selected
                </div>
                {videoPreviews.length ? (
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {videoPreviews.map((preview, idx) => (
                      <div key={`${preview.name}-${idx}`} className="position-relative d-inline-block">
                        <video
                          src={preview.url}
                          title={preview.name}
                          className="img-thumbnail d-block"
                          style={{ width: 140, height: 96, objectFit: "cover", background: "#111" }}
                          muted
                          playsInline
                          controls
                        />
                        <button
                          type="button"
                          className="btn btn-danger btn-sm position-absolute top-0 end-0 m-1 py-0 px-1 lh-1 rounded-circle shadow-sm"
                          style={{ width: 26, height: 26, fontSize: "1rem" }}
                          aria-label={`Remove video ${idx + 1}`}
                          onClick={() => onRemoveMainVideo(idx)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <FormSectionTitle>Pricing &amp; inventory</FormSectionTitle>

              <div className="col-6 col-md-3 col-lg-2">
                <label htmlFor={fid("moq")} className="form-label">
                  MOQ <span className="text-danger">*</span>
                </label>
                <input
                  id={fid("moq")}
                  type="number"
                  min="1"
                  step="1"
                  className="form-control"
                  value={form.moq}
                  onKeyDown={preventNegativeNumberKeyDown}
                  onChange={(e) => setForm((p) => ({ ...p, moq: sanitizeNonNegativeNumericInput(e.target.value) }))}
                  required
                />
              </div>
              <div className="col-6 col-md-3 col-lg-2">
                <label htmlFor={fid("price")} className="form-label">
                  Base price <span className="text-danger">*</span>
                </label>
                <input
                  id={fid("price")}
                  type="number"
                  min="0"
                  step={DECIMAL_STEP}
                  className="form-control"
                  value={form.price}
                  onKeyDown={preventNegativeNumberKeyDown}
                  onChange={(e) => setForm((p) => ({ ...p, price: sanitizeNonNegativeNumericInput(e.target.value) }))}
                  required
                />
         
              </div>
              <div className="col-6 col-md-3 col-lg-2">
                <label htmlFor={fid("discountType")} className="form-label">
                  Discount type
                </label>
                <select
                  id={fid("discountType")}
                  className="form-select"
                  value={form.discountType}
                  onChange={(e) => setForm((p) => ({ ...p, discountType: e.target.value }))}
                >
                  <option value="percentage">Percentage</option>
                  <option value="flat">Flat</option>
                </select>
              </div>
              <div className="col-6 col-md-3 col-lg-2">
                <label htmlFor={fid("discountValue")} className="form-label">
                  Discount value
                </label>
                <input
                  id={fid("discountValue")}
                  type="number"
                  min="0"
                  step={DECIMAL_STEP}
                  className="form-control"
                  value={form.discountValue}
                  onKeyDown={preventNegativeNumberKeyDown}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, discountValue: sanitizeNonNegativeNumericInput(e.target.value) }))
                  }
                />
              </div>
              <div className="col-6 col-md-3 col-lg-2">
                <label htmlFor={fid("status")} className="form-label">
                  Status
                </label>
                <select
                  id={fid("status")}
                  className="form-select"
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="d-flex flex-wrap gap-2 pt-4 mt-4 border-top">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  "Create product"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
