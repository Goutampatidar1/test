import { useEffect, useId, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import Swal from "sweetalert2";
import { vendorEcomUpdateShopImages } from "../../api/vendorEcom.js";
import { AppImage } from "../AppImage.jsx";
import { setAccountUser } from "../../store/authSlice.js";

const MAX_SHOP_IMAGES = 5;

export function ShopImagesPanel({ user }) {
  const dispatch = useDispatch();
  const galleryInputId = useId();
  const logoInputId = useId();
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [removedUrls, setRemovedUrls] = useState(() => new Set());
  const [pendingLogoFile, setPendingLogoFile] = useState(null);
  const [pendingLogoPreview, setPendingLogoPreview] = useState("");
  const [removeLogo, setRemoveLogo] = useState(false);

  const existingImages = useMemo(
    () => (Array.isArray(user?.shopImages) ? user.shopImages.filter(Boolean) : []),
    [user?.shopImages],
  );

  const visibleExisting = useMemo(
    () => existingImages.filter((url) => !removedUrls.has(url)),
    [existingImages, removedUrls],
  );

  const totalCount = visibleExisting.length + pendingFiles.length;
  const canAddMore = totalCount < MAX_SHOP_IMAGES;

  const logoPreview = removeLogo ? "" : pendingLogoPreview || user?.shopLogo || "";

  useEffect(() => {
    setRemovedUrls(new Set());
    setPendingFiles([]);
    setPendingLogoFile(null);
    setPendingLogoPreview("");
    setRemoveLogo(false);
  }, [user?._id]);

  useEffect(
    () => () => {
      pendingFiles.forEach((file) => URL.revokeObjectURL(file.previewUrl));
      if (pendingLogoPreview) URL.revokeObjectURL(pendingLogoPreview);
    },
    [pendingFiles, pendingLogoPreview],
  );

  const onPickFiles = (event) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    if (!picked.length) return;

    const slotsLeft = MAX_SHOP_IMAGES - totalCount;
    if (slotsLeft <= 0) {
      Swal.fire({
        icon: "info",
        title: "Limit reached",
        text: `You can upload up to ${MAX_SHOP_IMAGES} shop images.`,
      });
      return;
    }

    const nextFiles = picked.slice(0, slotsLeft).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      key: `${file.name}-${file.size}-${file.lastModified}`,
    }));
    setPendingFiles((prev) => [...prev, ...nextFiles]);
  };

  const onPickLogo = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (pendingLogoPreview) URL.revokeObjectURL(pendingLogoPreview);
    setPendingLogoFile(file);
    setPendingLogoPreview(URL.createObjectURL(file));
    setRemoveLogo(false);
  };

  const clearPendingLogo = () => {
    if (pendingLogoPreview) URL.revokeObjectURL(pendingLogoPreview);
    setPendingLogoFile(null);
    setPendingLogoPreview("");
    if (user?.shopLogo) setRemoveLogo(true);
  };

  const removePending = (key) => {
    setPendingFiles((prev) => {
      const target = prev.find((row) => row.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((row) => row.key !== key);
    });
  };

  const removeExisting = (url) => {
    setRemovedUrls((prev) => new Set([...prev, url]));
  };

  const undoRemove = (url) => {
    setRemovedUrls((prev) => {
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  };

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const keepUrls = existingImages.filter((url) => !removedUrls.has(url));
      const result = await vendorEcomUpdateShopImages({
        keepUrls,
        newFiles: pendingFiles.map((row) => row.file),
        shopLogoFile: pendingLogoFile,
        removeLogo,
      });
      const nextUser = result?.user;
      if (nextUser) {
        dispatch(setAccountUser({ mode: "ecom", user: nextUser }));
      }
      pendingFiles.forEach((row) => URL.revokeObjectURL(row.previewUrl));
      if (pendingLogoPreview) URL.revokeObjectURL(pendingLogoPreview);
      setPendingFiles([]);
      setRemovedUrls(new Set());
      setPendingLogoFile(null);
      setPendingLogoPreview("");
      setRemoveLogo(false);
      await Swal.fire({
        icon: "success",
        title: "Shop media updated",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Upload failed",
        text: err?.message || "Could not update shop images.",
      });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    pendingFiles.length > 0 || removedUrls.size > 0 || pendingLogoFile !== null || removeLogo;

  return (
    <section className="vendor-dash-panel vendor-shop-images" id="shop-images">
      <div className="vendor-shop-images__head">
        <div>
          <h2 className="vendor-dash-panel__title">Shop Images</h2>
          <p className="vendor-shop-images__hint">
            Add a shop logo and gallery photos so customers recognize your store.
          </p>
          <p className="vendor-shop-images__status">
            {totalCount}/{MAX_SHOP_IMAGES} gallery images
            {logoPreview ? " · Logo added" : " · Logo optional"}
          </p>
        </div>
      </div>

      <div className="vendor-shop-images__logo-row">
        <div className="vendor-shop-images__logo-slot">
          <span className="vendor-shop-images__logo-label">Shop logo</span>
          <div className={`vendor-shop-images__logo-box${logoPreview ? "" : " is-empty"}`}>
            {logoPreview ? (
              <>
                <AppImage src={logoPreview} alt="Shop logo preview" />
                <button type="button" className="vendor-shop-images__remove" onClick={clearPendingLogo}>
                  Remove
                </button>
              </>
            ) : (
              <span>Square logo works best</span>
            )}
          </div>
          <label htmlFor={logoInputId} className="vendor-shop-images__logo-add">
            {logoPreview ? "Change logo" : "+ Add logo"}
            <input id={logoInputId} type="file" accept="image/*" hidden onChange={onPickLogo} />
          </label>
        </div>

        <div className="vendor-shop-images__gallery">
          <span className="vendor-shop-images__logo-label">Gallery photos</span>
          <div className="vendor-shop-images__grid">
            {visibleExisting.map((url) => (
              <div key={url} className="vendor-shop-images__tile">
                <AppImage src={url} alt="" />
                <button type="button" className="vendor-shop-images__remove" onClick={() => removeExisting(url)}>
                  Remove
                </button>
              </div>
            ))}

            {pendingFiles.map((row) => (
              <div key={row.key} className="vendor-shop-images__tile is-pending">
                <img src={row.previewUrl} alt="" />
                <button type="button" className="vendor-shop-images__remove" onClick={() => removePending(row.key)}>
                  Remove
                </button>
              </div>
            ))}

            {canAddMore ? (
              <label htmlFor={galleryInputId} className="vendor-shop-images__add">
                <span>+ Add image</span>
                <input id={galleryInputId} type="file" accept="image/*" multiple hidden onChange={onPickFiles} />
              </label>
            ) : null}
          </div>
        </div>
      </div>

      {removedUrls.size > 0 ? (
        <div className="vendor-shop-images__removed">
          {existingImages
            .filter((url) => removedUrls.has(url))
            .map((url) => (
              <button key={url} type="button" className="vendor-shop-images__undo" onClick={() => undoRemove(url)}>
                Undo remove
              </button>
            ))}
        </div>
      ) : null}

      <div className="vendor-shop-images__actions">
        <button type="button" className="vendor-btn vendor-btn--primary" disabled={!hasChanges || saving} onClick={onSave}>
          {saving ? "Saving…" : "Save shop images"}
        </button>
      </div>
    </section>
  );
}
