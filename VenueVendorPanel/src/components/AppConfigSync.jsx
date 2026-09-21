import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { mediaUrl, mediaUrlOnNodePort } from "../media.js";
import { selectAppConfigData, selectAppDisplayName } from "../store/appConfigSelectors.js";
import { fetchPublicAppConfig } from "../store/appConfigSlice.js";
import { applyAppConfigFavicon } from "../utils/documentFavicon.js";

export function AppConfigSync() {
  const dispatch = useDispatch();
  const config = useSelector(selectAppConfigData);
  const appName = useSelector(selectAppDisplayName);

  useEffect(() => {
    dispatch(fetchPublicAppConfig());
  }, [dispatch]);

  useEffect(() => {
    document.title = appName ? `${appName} — Service Vendor` : "Oho Ebazar — Service Vendor";
  }, [appName]);

  useEffect(() => {
    applyAppConfigFavicon(config?.favicon, {
      cacheKey: config?.updatedAt || config?.favicon || "",
      mediaUrl,
      mediaUrlOnNodePort,
      baseUrl: import.meta.env.BASE_URL || "/",
    });
  }, [config?.favicon, config?.updatedAt]);

  return null;
}
