import { type JSX, Show } from "solid-js";

import { t } from "../../i18n/catalogue.js";
import { Mark } from "./parts.js";
import { ListScene, PairScene, PinScene, SignScene, SiteScene } from "./scenes.js";

const Step = (properties: { number: number; title: string; isOptional?: boolean; children: JSX.Element; scene?: JSX.Element; }): JSX.Element => (
  <li class="step">
    <div class="step-copy">
      <h2>
        {properties.number}
        .
        {" "}
        {properties.title}
        <Show when={properties.isOptional}><span class="step-optional">{t("onboarding.optional")}</span></Show>
      </h2>
      {properties.children}
    </div>
    {properties.scene}
  </li>
);

export const App = (): JSX.Element => (
  <main class="welcome">
    <header class="welcome-intro">
      <div class="welcome-brand">
        <Mark size={32} />
        openlv-connect
      </div>
      <h1>{t("onboarding.intro.title")}</h1>
      <p>{t("onboarding.intro.reach")}</p>
      <p>{t("onboarding.intro.control")}</p>
    </header>

    <ol class="steps">
      <Step number={0} title={t("onboarding.pin.title")} isOptional scene={<PinScene />}>
        <p>{t("onboarding.pin.how")}</p>
        <p>{t("onboarding.pin.why")}</p>
      </Step>
      <Step number={1} title={t("onboarding.pair.title")} scene={<PairScene />}>
        <p>{t("onboarding.pair.how")}</p>
        <p>{t("onboarding.pair.wallets")}</p>
      </Step>
      <Step number={2} title={t("onboarding.site.title")} scene={<SiteScene />}>
        <p>{t("onboarding.site.ask")}</p>
        <p>{t("onboarding.site.pick")}</p>
      </Step>
      <Step number={3} title={t("onboarding.sign.title")} scene={<SignScene />}>
        <p>{t("onboarding.sign.where")}</p>
        <p>{t("onboarding.sign.never")}</p>
      </Step>
      <Step number={4} title={t("onboarding.list.title")} scene={<ListScene />}>
        <p>{t("onboarding.list.open")}</p>
        <p>{t("onboarding.list.menu")}</p>
      </Step>
      <Step number={5} title={t("onboarding.enjoy.title")}>
        <p>{t("onboarding.enjoy.done")}</p>
      </Step>
    </ol>
  </main>
);
