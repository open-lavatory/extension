import "../../ui/style.css";

const mount = async (): Promise<void> => {
  try {
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
    const status = document.querySelector("[data-popup-status]");

    if (status) status.textContent = "Could not open the extension. Close it and try again.";
  }
};

void mount();
