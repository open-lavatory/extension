import LucideChevronLeft from "lucide-solid/icons/chevron-left";
import LucideSettings from "lucide-solid/icons/settings";
import { type JSX, Show } from "solid-js";

import mark from "../assets/openlv.svg";
import { t } from "../i18n/catalogue.js";

export const Header = (properties: {
  title: string;
  onBack?: () => void;
  onSettings?: () => void;
}): JSX.Element => (
  <header class="header">
    <Show
      when={properties.onBack}
      fallback={<img class="mark" src={mark} alt="openlv" width="24" height="24" />}
    >
      {back => (
        <button type="button" class="icon-button" aria-label={t("actions.back")} onClick={() => back()()}>
          <LucideChevronLeft />
        </button>
      )}
    </Show>
    <h1>{properties.title}</h1>
    <Show when={properties.onSettings} fallback={<span />}>
      {settings => (
        <button type="button" class="icon-button" aria-label={t("settings.title")} onClick={() => settings()()}>
          <LucideSettings size={20} />
        </button>
      )}
    </Show>
  </header>
);
