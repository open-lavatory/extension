import "../../ui/style.css";

import { language, t } from "../../i18n/catalogue.js";

const status = document.querySelector("[data-popup-status]");

document.documentElement.lang = language;

if (status) status.textContent = t("popup.loadingConnections");

const mount = async (): Promise<void> => {
  try {
    // Loaded after the placeholder text is set, so the popup paints it before App and Solid are parsed.
    const { App } = await import("./App.js");
    const { render } = await import("solid-js/web");
    const root = document.querySelector("#root");

    if (root) {
      root.replaceChildren();
      root.removeAttribute("aria-busy");
      render(App, root);
    }
  }
  catch {
    if (status) status.textContent = t("errors.couldNotOpen");
  }
};

void mount();
