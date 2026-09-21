import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import Select from "react-select";
import { adminListAttributeTitles, adminListAttributeValues } from "../../api/adminAttributes.js";
import { adminListCategories } from "../../api/adminCategories.js";
import { adminGetProductById, adminUpdateProduct } from "../../api/adminProducts.js";
import { adminListSubCategories } from "../../api/adminSubCategories.js";
import { mediaUrl } from "../../media.js";
import { logout } from "../../store/authSlice.js";
import { NotFoundPage } from "../NotFoundPage.jsx";

function attributeTitleSubCategoryId(title) {
  return String(title?.subCategory?._id || title?.subCategory || "");
}

function attributeTitleMatchesProductScope(title, subCategoryId) {
  return attributeTitleSubCategoryId(title) === String(subCategoryId);
}

function mergeById(items = [], extras = []) {
  const map = new Map();
  for (const item of [...items, ...extras]) {
    const id = item?._id || item;
    if (!id) continue;
    const key = String(id);
    if (!map.has(key)) {
      map.set(key, typeof item === "object" && item._id ? item : { _id: id });
    }
  }
  return [...map.values()];
}

function attributeTitlesFromCombinations(product) {
  const map = new Map();
  for (const combo of product?.combinations || []) {
    for (const attr of combo.attributes || []) {
      const title = attr?.attributeTitle;
      const id = title?._id || title;
      if (!id || map.has(String(id))) continue;
      map.set(String(id), typeof title === "object" && title._id ? title : { _id: id });
    }
  }
  return [...map.values()];
}

function attributeValuesFromCombinations(product) {
  const map = new Map();
  for (const combo of product?.combinations || []) {
    for (const attr of combo.attributes || []) {
      const val = attr?.attributeValue;
      const id = val?._id || val;
      if (!id || map.has(String(id))) continue;
      const titleId = attr?.attributeTitle?._id || attr?.attributeTitle || "";
      map.set(
        String(id),
        typeof val === "object" && val._id ? { ...val, attributeTitle: titleId } : { _id: id, attributeTitle: titleId }
      );
    }
  }
  return [...map.values()];
}

function deriveAttributeTitleIds(product) {
  const fromField = Array.isArray(product?.attributeTitles)
    ? product.attributeTitles.map((a) => a?._id || a).filter(Boolean)
    : [];
  if (fromField.length) return fromField;
  return attributeTitlesFromCombinations(product).map((title) => title._id);
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

function normalizeCombination(v) {
  return {
    sku: v?.sku || "",
    price: v?.price ?? "",
    discountValue: v?.discountValue ?? "0",
    stock: v?.stock ?? "",
    status: v?.status || "active",
    images: Array.isArray(v?.images) ? v.images.filter(Boolean) : [],
    attributes: Array.isArray(v?.attributes)
      ? v.attributes.map((a) => ({
          attributeTitle: a?.attributeTitle?._id || a?.attributeTitle || "",
          attributeValue: a?.attributeValue?._id || a?.attributeValue || "",
        }))
      : [],
  };
}

function emptyCombination(selectedTitleIds = []) {
  return {
    ...normalizeCombination({}),
    attributes: selectedTitleIds.map((titleId) => ({ attributeTitle: titleId, attributeValue: "" })),
  };
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

  const previousByKey = new Map(prevCombinations.map((combination) => [buildCombinationKey(combination.attributes), combination]));
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

function generateProductSku() {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PRD-${Date.now()}-${rand}`;
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

function sanitizeNonNegativeNumericInput(raw) {
  return String(raw ?? "").replace(/-/g, "");
}

function preventNegativeNumberKeyDown(e) {
  if (e.key === "-" || e.code === "Minus" || e.code === "NumpadSubtract") {
    e.preventDefault();
  }
}

function FormSectionTitle({ children }) {
  return (
    <div className="col-12">
      <h6 className="text-secondary text-uppercase small fw-semibold mb-0 mt-2 border-bottom pb-2">{children}</h6>
    </div>
  );
}

export function ProductEdit() {
  const { productId } = useParams();
  const formId = useId();
  const fid = (name) => `${formId}-${name}`;
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const admin = useSelector((s) => s.auth.admin);
  const adminId = admin?._id || admin?.id || "";

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState("");
  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [videoFiles, setVideoFiles] = useState([]);
  const [videoPreviews, setVideoPreviews] = useState([]);
  const [combinationImageFiles, setCombinationImageFiles] = useState({});
  const [combinationImagePreviews, setCombinationImagePreviews] = useState({});
  const [variantTab, setVariantTab] = useState("variants");
  const [form, setForm] = useState({
    name: "",
    sku: generateProductSku(),
    description: "",
    shortDescription: "",
    thumbnail: "",
    images: [],
    videos: [],
    category: "",
    subCategory: "",
    moq: "1",
    price: "",
    stock: "0",
    discountType: "percentage",
    discountValue: "0",
    taxType: "inclusive",
    taxValue: "0",
    variantType: "single",
    status: "active",
    attributeTitles: [],
    combinations: [{ ...emptyCombination(), sku: generateSku() }],
  });
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [attributeTitles, setAttributeTitles] = useState([]);
  const [attributeValues, setAttributeValues] = useState([]);
  const [productMeta, setProductMeta] = useState({ role: "Admin", addedById: "" });
  const skipCombinationSyncRef = useRef(true);

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
    if (!adminToken || !adminId || !productId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const [
          productPayload,
          { categories: cats },
          { subCategories: subs },
          { attributeTitles: titles },
          { attributeValues: values },
        ] = await Promise.all([
          adminGetProductById(adminToken, productId),
          adminListCategories(adminToken, {
            page: 1,
            limit: 200,
            status: "active",
            role: "Admin",
            addedById: adminId,
            mode: "ecom",
          }),
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
        const product =
          productPayload?.product && typeof productPayload.product === "object"
            ? productPayload.product
            : productPayload;
        if (!product?._id) {
          setNotFound(true);
          return;
        }

        setCategories(cats);
        setSubCategories(subs);
        setAttributeTitles(mergeById(titles, attributeTitlesFromCombinations(product)));
        setAttributeValues(mergeById(values, attributeValuesFromCombinations(product)));
        setProductMeta({
          role: product.role || "Admin",
          addedById: product.addedById?._id || product.addedById || adminId,
        });
        skipCombinationSyncRef.current = true;
        setForm({
          name: product.name || "",
          sku: product.sku || generateProductSku(),
          description: product.description || "",
          shortDescription: product.shortDescription || "",
          thumbnail: product.thumbnail || "",
          images: Array.isArray(product.images) ? product.images.filter(Boolean) : [],
          videos: Array.isArray(product.videos) ? product.videos.filter(Boolean) : [],
          category: product.category?._id || product.category || "",
          subCategory: product.subCategory?._id || product.subCategory || "",
          moq: product.moq ?? "1",
          price: product.price ?? "",
          stock: product.stock ?? "0",
          discountType: product.discountType || "percentage",
          discountValue: product.discountValue ?? "0",
          taxType: product.taxType || "inclusive",
          taxValue: product.taxValue ?? "0",
          variantType: product.variantType || "single",
          status: product.status || "active",
          attributeTitles: deriveAttributeTitleIds(product),
          combinations: Array.isArray(product.combinations) && product.combinations.length
            ? product.combinations.map((combination) => {
                const normalized = normalizeCombination(combination);
                return {
                  ...normalized,
                  sku: normalized.sku || generateSku(product.combinations.map((c) => c?.sku)),
                };
              })
            : [{ ...emptyCombination(), sku: generateSku() }],
        });
      } catch (error) {
        if (cancelled) return;
        if (error?.status === 401) return dispatch(logout());
        if (error?.status === 404) {
          setNotFound(true);
          return;
        }
        await Swal.fire({ icon: "error", title: "Load failed", text: error.message || "Could not load product." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adminId, adminToken, dispatch, productId]);

  const subCategoryOptions = useMemo(() => {
    if (!form.category) return [];
    return subCategories.filter((s) => String(s.category?._id || s.category) === String(form.category));
  }, [form.category, subCategories]);

  const subCategoryAttributeTitles = useMemo(() => {
    const titleIds = new Set((form.attributeTitles || []).map(String));
    return attributeTitles.filter((title) => {
      const id = String(title._id);
      if (titleIds.has(id)) return true;
      if (!form.subCategory) return false;
      return attributeTitleMatchesProductScope(title, form.subCategory);
    });
  }, [attributeTitles, form.attributeTitles, form.subCategory]);

  const subCategoryAttributeValues = useMemo(() => {
    const titleIds = new Set([
      ...subCategoryAttributeTitles.map((title) => String(title._id)),
      ...(form.attributeTitles || []).map(String),
    ]);
    return attributeValues.filter((value) =>
      titleIds.has(String(value.attributeTitle?._id || value.attributeTitle))
    );
  }, [attributeValues, form.attributeTitles, subCategoryAttributeTitles]);

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

  const onRemoveExistingMainImage = (removeIdx) => {
    setForm((p) => ({
      ...p,
      images: (p.images || []).filter((_, idx) => idx !== removeIdx),
    }));
  };

  const onRemoveMainVideo = (removeIdx) => {
    setVideoFiles((prev) => prev.filter((_, idx) => idx !== removeIdx));
    setVideoPreviews((prev) => {
      const target = prev[removeIdx];
      if (target?.url) URL.revokeObjectURL(target.url);
      return prev.filter((_, idx) => idx !== removeIdx);
    });
  };

  const onRemoveExistingMainVideo = (removeIdx) => {
    setForm((p) => ({
      ...p,
      videos: (p.videos || []).filter((_, idx) => idx !== removeIdx),
    }));
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

  const onRemoveExistingCombinationImage = (combinationIdx, imageIdx) => {
    setForm((p) => ({
      ...p,
      combinations: p.combinations.map((c, i) =>
        i === combinationIdx ? { ...c, images: (c.images || []).filter((_, j) => j !== imageIdx) } : c
      ),
    }));
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
    if (skipCombinationSyncRef.current) {
      skipCombinationSyncRef.current = false;
      return;
    }
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
    if (!adminToken || !productId) return;
    if (!form.name.trim() || !form.description.trim() || (!form.thumbnail.trim() && !thumbnailFile) || !form.category || !form.subCategory) {
      await Swal.fire({ icon: "error", title: "Validation error", text: "Name, description, thumbnail, category and sub-category are required." });
      return;
    }

    try {
      const moq = Number(form.moq);
      const price = Number(form.price);
      const stock = Number(form.stock);
      const discountValue = Number(form.discountValue);
      const taxValue = Number(form.taxValue);

      if ([moq, price, stock, discountValue, taxValue].some(Number.isNaN) || moq < 1 || price < 1 || stock < 0 || discountValue < 0 || taxValue < 0) {
        throw new Error("Invalid numeric values in base product fields.");
      }

      const combinations = form.variantType === "multi"
        ? form.combinations.map((combination, idx) => {
            const combinationPrice = Number(combination.price);
            const combinationDiscount = Number(combination.discountValue);
            const combinationStock = Number(combination.stock || 0);
            if (!combination.sku.trim() || Number.isNaN(combinationPrice) || Number.isNaN(combinationDiscount) || Number.isNaN(combinationStock)) {
              throw new Error(`Combination ${idx + 1}: sku, price, discount and stock are required.`);
            }
            if (!Array.isArray(combination.attributes) || combination.attributes.length !== form.attributeTitles.length) {
              throw new Error(`Combination ${idx + 1}: all selected variant titles must have values.`);
            }
            if (combination.attributes.some((attr) => !attr.attributeTitle || !attr.attributeValue)) {
              throw new Error(`Combination ${idx + 1}: all variant values are required.`);
            }
            if (combinationPrice < 1 || combinationDiscount < 0 || combinationStock < 0) {
              throw new Error(`Combination ${idx + 1}: invalid numeric values.`);
            }
            return {
              sku: combination.sku.trim(),
              price: combinationPrice,
              discountValue: combinationDiscount,
              stock: combinationStock,
              status: combination.status || "active",
              images: Array.isArray(combination.images) ? combination.images.filter(Boolean) : [],
              attributes: combination.attributes
                .filter((a) => a.attributeTitle && a.attributeValue)
                .map((a) => ({ attributeTitle: a.attributeTitle, attributeValue: a.attributeValue })),
            };
          })
        : [];

      if (form.variantType === "multi") {
        const uniqueSkuSet = new Set(combinations.map((combination) => String(combination.sku).trim()));
        if (uniqueSkuSet.size !== combinations.length) {
          throw new Error("Each combination SKU must be unique.");
        }
        const combinationKeys = combinations.map((combination) => buildCombinationKey(combination.attributes));
        const uniqueComboKeys = new Set(combinationKeys);
        if (uniqueComboKeys.size !== combinationKeys.length) {
          throw new Error("Each variant combination must be unique. Change color, size, or other variant values.");
        }
      }

      if (form.variantType === "multi" && form.attributeTitles.length === 0) {
        throw new Error("Please select at least one variant title.");
      }

      const payload = {
        name: form.name.trim(),
        slug: toSlug(form.name),
        sku: String(form.sku || "").trim() || generateProductSku(),
        description: form.description.trim(),
        shortDescription: form.shortDescription.trim(),
        ...(thumbnailFile ? {} : { thumbnail: form.thumbnail.trim() }),
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
        images: Array.isArray(form.images) ? form.images.filter(Boolean) : [],
        videos: Array.isArray(form.videos) ? form.videos.filter(Boolean) : [],
        adminApproved: true,
        status: form.status,
        role: productMeta.role || "Admin",
        addedById: productMeta.addedById || adminId,
        combinations,
      };

      const hasCombinationFiles = Object.values(combinationImageFiles).some((files) => (files || []).length > 0);
      const shouldUseMultipart = Boolean(thumbnailFile) || imageFiles.length > 0 || videoFiles.length > 0 || hasCombinationFiles;
      const requestPayload = shouldUseMultipart ? (() => {
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (key === "images" || key === "videos" || key === "attributeTitles" || key === "combinations") {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, value ?? "");
          }
        });
        if (thumbnailFile) formData.append("thumbnail", thumbnailFile);
        imageFiles.forEach((file) => formData.append("images", file));
        videoFiles.forEach((file) => formData.append("videos", file));
        Object.entries(combinationImageFiles).forEach(([idx, files]) => {
          (files || []).forEach((file, imageIdx) => {
            formData.append(`combinationImages[${idx}][${imageIdx}]`, file);
          });
        });
        return formData;
      })() : payload;

      setSaving(true);
      await adminUpdateProduct(adminToken, productId, requestPayload);
      await Swal.fire({ icon: "success", title: "Product updated", timer: 1200 });
      navigate("/admin/products");
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Update failed", text: error.message || "Could not update product." });
    } finally {
      setSaving(false);
    }
  };

  if (notFound) return <NotFoundPage />;
  if (loading) {
    return (
      <div className="user-page">
        <p className="static-cms-loading">Loading product…</p>
      </div>
    );
  }

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
          <h2 className="user-page__title h4 mb-0">Edit product</h2>
          <p className="user-page__subtitle text-muted small mb-0 mt-1">Update product details, pricing, and variant combinations.</p>
        </div>
        <Link to={`/admin/products/${productId}`} className="btn btn-outline-secondary btn-sm text-nowrap">
          View product
        </Link>
        <Link to="/admin/products" className="btn btn-outline-secondary btn-sm text-nowrap">
          Back to list
        </Link>
      </div>

      <div className="card shadow-sm border-0">
        <div className="card-body">
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
                />
                <div className="form-text">Upload a new file to replace the current thumbnail.</div>
                {thumbnailPreviewUrl ? (
                  <div className="mt-2">
                    <img
                      src={thumbnailPreviewUrl}
                      alt="Thumbnail preview"
                      className="img-thumbnail"
                      style={{ maxWidth: 160, maxHeight: 160, objectFit: "cover" }}
                    />
                  </div>
                ) : form.thumbnail ? (
                  <div className="mt-2">
                    <img
                      src={mediaUrl(form.thumbnail)}
                      alt="Current thumbnail"
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
                <div className="form-text">
                  {Array.isArray(form.images) ? form.images.length : 0} saved · {imageFiles.length} new file(s) selected
                </div>
                {Array.isArray(form.images) && form.images.length ? (
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {form.images.map((img, idx) => (
                      <div key={`existing-main-${img}-${idx}`} className="position-relative d-inline-block">
                        <img
                          src={mediaUrl(img)}
                          alt={`Saved image ${idx + 1}`}
                          className="img-thumbnail d-block"
                          style={{ width: 96, height: 96, objectFit: "cover" }}
                        />
                        <button
                          type="button"
                          className="btn btn-danger btn-sm position-absolute top-0 end-0 m-1 py-0 px-1 lh-1 rounded-circle shadow-sm"
                          style={{ width: 26, height: 26, fontSize: "1rem" }}
                          aria-label={`Remove saved image ${idx + 1}`}
                          onClick={() => onRemoveExistingMainImage(idx)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {imagePreviews.length ? (
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {imagePreviews.map((preview, idx) => (
                      <div key={`${preview.name}-${idx}`} className="position-relative d-inline-block">
                        <img
                          src={preview.url}
                          alt={preview.name || `New image ${idx + 1}`}
                          title={preview.name}
                          className="img-thumbnail d-block"
                          style={{ width: 96, height: 96, objectFit: "cover" }}
                        />
                        <button
                          type="button"
                          className="btn btn-danger btn-sm position-absolute top-0 end-0 m-1 py-0 px-1 lh-1 rounded-circle shadow-sm"
                          style={{ width: 26, height: 26, fontSize: "1rem" }}
                          aria-label={`Remove new image ${idx + 1}`}
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
                  MP4, WebM, or MOV · up to 50 MB each · {Array.isArray(form.videos) ? form.videos.length : 0} saved · {videoFiles.length} new file(s) selected
                </div>
                {Array.isArray(form.videos) && form.videos.length ? (
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {form.videos.map((vid, idx) => (
                      <div key={`existing-main-video-${vid}-${idx}`} className="position-relative d-inline-block">
                        <video
                          src={mediaUrl(vid)}
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
                          aria-label={`Remove saved video ${idx + 1}`}
                          onClick={() => onRemoveExistingMainVideo(idx)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
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
                          aria-label={`Remove new video ${idx + 1}`}
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
                <label htmlFor={fid("stock")} className="form-label">
                  Base stock <span className="text-danger">*</span>
                </label>
                <input
                  id={fid("stock")}
                  type="number"
                  min="0"
                  step="1"
                  className="form-control"
                  value={form.stock}
                  onKeyDown={preventNegativeNumberKeyDown}
                  onChange={(e) => setForm((p) => ({ ...p, stock: sanitizeNonNegativeNumericInput(e.target.value) }))}
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

            {form.variantType === "multi" ? (
              <>
                <div className="card border mt-4 shadow-sm">
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
                    <div className="form-text">You can select multiple variant titles.</div>
                  </div>
                </div>

                {form.attributeTitles.length ? (
                  <div className="card border mt-3 shadow-sm">
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
                                      <div className="form-text">
                                        {(Array.isArray(combination.images) ? combination.images.length : 0)} saved ·{" "}
                                        {(combinationImageFiles[idx] || []).length} new file(s) selected
                                      </div>
                                      {Array.isArray(combination.images) && combination.images.length ? (
                                        <div className="d-flex flex-wrap gap-2 mt-2">
                                          {combination.images.map((img, imageIdx) => (
                                            <div key={`existing-combo-${idx}-${img}-${imageIdx}`} className="position-relative d-inline-block">
                                              <img
                                                src={mediaUrl(img)}
                                                alt={`Saved variant ${imageIdx + 1}`}
                                                className="img-thumbnail d-block"
                                                style={{ width: 72, height: 72, objectFit: "cover" }}
                                              />
                                              <button
                                                type="button"
                                                className="btn btn-danger btn-sm position-absolute top-0 end-0 m-1 py-0 px-1 lh-1 rounded-circle shadow-sm"
                                                style={{ width: 22, height: 22, fontSize: "0.85rem" }}
                                                aria-label={`Remove saved variant image ${imageIdx + 1}`}
                                                onClick={() => onRemoveExistingCombinationImage(idx, imageIdx)}
                                              >
                                                ×
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      ) : null}
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
                                                aria-label={`Remove new variant image ${previewIdx + 1}`}
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

            <div className="d-flex flex-wrap gap-2 pt-4 mt-4 border-top">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  "Update product"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
