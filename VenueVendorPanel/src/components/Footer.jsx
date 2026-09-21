import { useEffect, useState } from "react";
import { getPublicAppConfig } from "../api/publicAppConfig.js";

const DEFAULT = "© 2026 Oho E-Bazaar. All rights reserved.";

export function Footer() {
  const [text, setText] = useState(DEFAULT);

  useEffect(() => {
    getPublicAppConfig()
      .then((res) => {
        const cfg = res?.data ?? res;
        if (cfg?.footer_text?.trim()) setText(cfg.footer_text.trim());
      })
      .catch(() => {});
  }, []);

  return <footer className="admin-footer">{text}</footer>;
}
