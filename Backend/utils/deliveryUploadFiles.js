const DELIVERY_UPLOAD_DIR = "delivery";

function buildDeliveryUploadMap(req) {
  const files = req.files || {};
  const map = new Map();

  const addFile = (rawField, file) => {
    const key = String(rawField || "").trim();
    if (!key || !file) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(file);
  };

  if (Array.isArray(files)) {
    for (const file of files) addFile(file.fieldname, file);
    return map;
  }

  for (const [field, list] of Object.entries(files)) {
    for (const file of list || []) addFile(field, file);
  }

  return map;
}

function resolveDeliveryUploadPath(req, fieldNames, uploadDir = DELIVERY_UPLOAD_DIR) {
  const map = buildDeliveryUploadMap(req);
  const names = Array.isArray(fieldNames) ? fieldNames : [fieldNames];

  for (const name of names) {
    const key = String(name).trim();
    const file = map.get(key)?.[0];
    if (file?.filename) {
      return `/uploads/${uploadDir}/${file.filename}`;
    }
  }

  return undefined;
}

module.exports = {
  DELIVERY_UPLOAD_DIR,
  buildDeliveryUploadMap,
  resolveDeliveryUploadPath,
};
