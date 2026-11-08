import CircleUserRound from "lucide-solid/icons/circle-user-round";
import Globe from "lucide-solid/icons/globe";
import Monitor from "lucide-solid/icons/monitor";
import Pin from "lucide-solid/icons/pin";
import Puzzle from "lucide-solid/icons/puzzle";
import Smartphone from "lucide-solid/icons/smartphone";
import { For, type JSX, Show } from "solid-js";

import { t } from "../../i18n/catalogue.js";
import { ACCOUNT, BrowserBar, DesktopWallet, HardwareKey, Layer, Mark, ORIGIN, type Peer, PeerIcon, Phone, Scene, SITE_TABS, Skeleton, WebWallet } from "./parts.js";
import { createTimeline, type Timeline } from "./timeline.js";
import { ApprovalWindow, ListView, LoadingView, PairedView, PopupWindow, QrView } from "./windows.js";

const PEERS: Peer[] = ["phone", "desktop", "web"];

const KIND: Record<Peer, { label: string; icon: () => JSX.Element; }> = {
  phone: { label: t("onboarding.peer.phone"), icon: () => <Smartphone size={18} /> },
  desktop: { label: t("onboarding.peer.desktop"), icon: () => <Monitor size={18} /> },
  web: { label: t("onboarding.peer.web"), icon: () => <Globe size={18} /> },
};

type Run<StepId extends string> = { peer: Peer; from: StepId; to: StepId; still: StepId; };

const WalletSwitch = <StepId extends string>(properties: { timeline: Timeline<StepId>; runs: Run<StepId>[]; }): JSX.Element => (
  <div class="kinds">
    <For each={properties.runs}>
      {run => (
        <button type="button" classList={{ current: properties.timeline.within(run.from, run.to) }} onClick={() => properties.timeline.jump(run.from, run.still)}>
          {KIND[run.peer].icon()}
          {KIND[run.peer].label}
        </button>
      )}
    </For>
  </div>
);

const SiteNav = (properties: { account?: Peer; connectRef?: (element: HTMLElement) => void; }): JSX.Element => (
  <div class="site-nav">
    <PeerIcon peer="site" size={28} />
    <strong>Swap</strong>
    <span class="site-spacer" />
    <Show when={properties.account} fallback={<span class="site-button" ref={properties.connectRef}>{t("actions.connect")}</span>}>
      {peer => (
        <span class="site-account">
          <PeerIcon peer={peer()} size={18} />
          {ACCOUNT}
        </span>
      )}
    </Show>
  </div>
);

export const PinScene = (): JSX.Element => {
  const timeline = createTimeline([
    { stepId: "idle", durationMs: 2200, cursor: [["puzzle", 0.75]] },
    { stepId: "menu", durationMs: 3000, cursor: [["pin", 0.75]] },
    { stepId: "pinned", durationMs: 3600 },
    { stepId: "hold", durationMs: 1800 },
  ], "menu", { x: 600, y: 200 });

  return (
    <Scene timeline={timeline} height={300} label={t("onboarding.pin.scene")}>
      <div class="browser-window" style={{ left: "0px", top: "0px", width: "760px", height: "280px" }}>
        <BrowserBar tabs={SITE_TABS} address={ORIGIN}>
          <span class="browser-action pinned" classList={{ hidden: !timeline.within("pinned", "hold") }}><Mark size={20} /></span>
          <span class="browser-action" classList={{ open: timeline.is("menu") }} ref={timeline.target("puzzle")}><Puzzle size={18} /></span>
          <span class="browser-action"><CircleUserRound size={18} /></span>
        </BrowserBar>
        <div class="site-page">
          <Skeleton width={220} height={14} />
          <Skeleton width={420} />
          <Skeleton width={360} />
          <Skeleton width={300} />
        </div>
      </div>
      <div class="extensions-menu" classList={{ hidden: !timeline.is("menu") }} style={{ right: "12px", top: "88px" }}>
        <p class="extensions-title">{t("onboarding.browser.extensions")}</p>
        <div class="extensions-row">
          <Mark size={18} />
          <span>openlv-connect</span>
          <span class="extensions-pin" ref={timeline.target("pin")}><Pin size={16} /></span>
        </div>
        <p class="extensions-manage">{t("onboarding.browser.manageExtensions")}</p>
      </div>
    </Scene>
  );
};

const PAIR_RUNS: Run<PairStep>[] = [
  { peer: "phone", from: "list", to: "done-phone", still: "scan-phone" },
  { peer: "desktop", from: "qr-desktop", to: "done-desktop", still: "paste-desktop" },
  { peer: "web", from: "qr-web", to: "done-web", still: "paste-web" },
];

type PairStep
  = | "list" | "qr-phone" | "scan-phone" | "link-phone" | "ok-phone" | "done-phone"
    | "qr-desktop" | "paste-desktop" | "link-desktop" | "ok-desktop" | "done-desktop"
    | "qr-web" | "card-web" | "paste-web" | "link-web" | "ok-web" | "done-web";

export const PairScene = (): JSX.Element => {
  const timeline = createTimeline<PairStep>([
    { stepId: "list", durationMs: 2400, cursor: [["popup-connect", 0.75]] },
    { stepId: "qr-phone", durationMs: 2400 },
    { stepId: "scan-phone", durationMs: 3800 },
    { stepId: "link-phone", durationMs: 1400 },
    { stepId: "ok-phone", durationMs: 2800, tap: [["phone-ok", 0.65]] },
    { stepId: "done-phone", durationMs: 2600, cursor: [["done", 0.8]] },
    { stepId: "qr-desktop", durationMs: 2600, cursor: [["copy", 0.85]] },
    { stepId: "paste-desktop", durationMs: 3800, cursor: [["desktop-field", 0.15], ["desktop-go", 0.8]] },
    { stepId: "link-desktop", durationMs: 1400 },
    { stepId: "ok-desktop", durationMs: 2800, cursor: [["desktop-ok", 0.65]] },
    { stepId: "done-desktop", durationMs: 2600, cursor: [["done", 0.8]] },
    { stepId: "qr-web", durationMs: 2600, cursor: [["copy", 0.85]] },
    { stepId: "card-web", durationMs: 2200, cursor: [["web-openlv", 0.8]] },
    { stepId: "paste-web", durationMs: 3800, cursor: [["web-field", 0.2], ["web-go", 0.8]] },
    { stepId: "link-web", durationMs: 1400 },
    { stepId: "ok-web", durationMs: 2800, cursor: [["web-ok", 0.65]] },
    { stepId: "done-web", durationMs: 3000 },
  ], "scan-phone", { x: 330, y: 440 });
  const pairedPeer = (): Peer | undefined => PEERS.find(peer => timeline.is(`done-${peer}`));

  return (
    <Scene
      timeline={timeline}
      height={470}
      label={t("onboarding.pair.scene")}
      controls={<WalletSwitch timeline={timeline} runs={PAIR_RUNS} />}
    >
      <PopupWindow style={{ left: "0px", top: "0px" }}>
        <div class="layers">
          <Layer when={timeline.is("list")}><ListView rows={[]} connectRef={timeline.target("popup-connect")} /></Layer>
          <Layer when={timeline.within("qr-phone", "scan-phone") || timeline.within("qr-desktop", "paste-desktop") || timeline.within("qr-web", "paste-web")}>
            <QrView isCopied={timeline.is("paste-desktop", "card-web", "paste-web")} copyRef={timeline.target("copy")} />
          </Layer>
          <Layer when={timeline.is("link-phone", "ok-phone", "link-desktop", "ok-desktop", "link-web", "ok-web")}><LoadingView /></Layer>
          <Show when={pairedPeer()} keyed>
            {peer => <Layer when><PairedView peer={peer} doneRef={timeline.target("done")} /></Layer>}
          </Show>
        </div>
      </PopupWindow>
      <Phone
        timeline={timeline}
        isShown={timeline.within("list", "done-phone")}
        isMoving={timeline.is("scan-phone")}
        style={{ "left": "500px", "top": "18px", "--move-x": "-262px", "--move-y": "-6px" }}
        views={{
          home: timeline.within("list", "qr-phone"),
          scan: timeline.is("scan-phone"),
          link: timeline.is("link-phone"),
          ok: timeline.is("ok-phone"),
          connected: timeline.is("done-phone"),
        }}
      />
      <DesktopWallet
        timeline={timeline}
        isShown={timeline.within("qr-desktop", "done-desktop")}
        isTyped={timeline.is("paste-desktop")}
        style={{ left: "400px", top: "96px" }}
        views={{
          home: timeline.within("qr-desktop", "paste-desktop"),
          link: timeline.is("link-desktop"),
          ok: timeline.is("ok-desktop"),
          connected: timeline.is("done-desktop"),
        }}
      />
      <WebWallet
        timeline={timeline}
        isShown={timeline.within("qr-web", "done-web")}
        isCardOpen={timeline.is("paste-web")}
        isTyped={timeline.is("paste-web")}
        style={{ left: "400px", top: "40px" }}
        views={{
          home: timeline.within("qr-web", "paste-web"),
          link: timeline.is("link-web"),
          ok: timeline.is("ok-web"),
          connected: timeline.is("done-web"),
        }}
      />
    </Scene>
  );
};

export const SiteScene = (): JSX.Element => {
  const timeline = createTimeline([
    { stepId: "idle", durationMs: 2400, cursor: [["site-connect", 0.75]] },
    { stepId: "ask", durationMs: 3000, cursor: [["pick", 0.8]] },
    { stepId: "pick", durationMs: 3400, cursor: [["approve", 0.75]] },
    { stepId: "done", durationMs: 3600 },
  ], "pick", { x: 430, y: 250 });

  return (
    <Scene timeline={timeline} height={640} label={t("onboarding.site.scene")}>
      <div class="browser-window" style={{ left: "0px", top: "0px", width: "560px", height: "380px" }}>
        <BrowserBar tabs={SITE_TABS} address={ORIGIN}>
          <span class="browser-action"><Mark size={20} /></span>
        </BrowserBar>
        <div class="site-page">
          <SiteNav account={timeline.is("done") ? "phone" : undefined} connectRef={timeline.target("site-connect")} />
          <Skeleton width={300} height={14} />
          <Skeleton width={220} />
          <Skeleton width={260} />
        </div>
      </div>
      <ApprovalWindow
        style={{ left: "340px", top: "40px" }}
        isShown={timeline.within("ask", "pick")}
        rows={["phone", "desktop"]}
        picked={timeline.is("pick") ? "phone" : undefined}
        pickRef={timeline.target("pick")}
        connectRef={timeline.target("approve")}
      />
    </Scene>
  );
};

type SignStep
  = | "phone-idle" | "phone-ask" | "phone-done"
    | "desktop-idle" | "desktop-ask" | "desktop-key" | "desktop-done"
    | "web-idle" | "web-ask" | "web-done";

const SIGN_RUNS: Run<SignStep>[] = [
  { peer: "phone", from: "phone-idle", to: "phone-done", still: "phone-ask" },
  { peer: "desktop", from: "desktop-idle", to: "desktop-done", still: "desktop-key" },
  { peer: "web", from: "web-idle", to: "web-done", still: "web-ask" },
];

export const SignScene = (): JSX.Element => {
  const timeline = createTimeline<SignStep>([
    { stepId: "phone-idle", durationMs: 1800, cursor: [["site-sign", 0.7]] },
    { stepId: "phone-ask", durationMs: 3200, tap: [["phone-sign", 0.7]] },
    { stepId: "phone-done", durationMs: 2600 },
    { stepId: "desktop-idle", durationMs: 1800, cursor: [["site-sign", 0.7]] },
    { stepId: "desktop-ask", durationMs: 3000, cursor: [["desktop-sign", 0.7]] },
    { stepId: "desktop-key", durationMs: 3200, cursor: [["key", 0.65]] },
    { stepId: "desktop-done", durationMs: 2800 },
    { stepId: "web-idle", durationMs: 1800, cursor: [["site-sign", 0.7]] },
    { stepId: "web-ask", durationMs: 3200, cursor: [["web-sign", 0.7]] },
    { stepId: "web-done", durationMs: 2600 },
  ], "phone-ask", { x: 300, y: 420 });
  const isWaiting = () => timeline.is("phone-ask", "desktop-ask", "desktop-key", "web-ask");
  const isSigned = () => timeline.is("phone-done", "desktop-done", "web-done");
  const signer = (): Peer => SIGN_RUNS.find(run => timeline.within(run.from, run.to))?.peer ?? "phone";

  return (
    <Scene
      timeline={timeline}
      height={456}
      label={t("onboarding.sign.scene")}
      controls={<WalletSwitch timeline={timeline} runs={SIGN_RUNS} />}
    >
      <div class="browser-window" style={{ left: "0px", top: "78px", width: "380px", height: "300px" }}>
        <BrowserBar tabs={SITE_TABS} address={ORIGIN} />
        <div class="site-page">
          <SiteNav account={signer()} />
          <div class="site-message">
            <p>Hello, world!</p>
            <Show
              when={isSigned()}
              fallback={(
                <span class="site-button" ref={timeline.target("site-sign")}>
                  <Show when={isWaiting()} fallback={t("onboarding.site.signMessage")}><span class="spinner small" /></Show>
                </span>
              )}
            >
              <span class="site-signature">0x7c1e...9b04</span>
            </Show>
          </div>
        </div>
      </div>
      <Phone
        timeline={timeline}
        isShown={timeline.within("phone-idle", "phone-done")}
        style={{ left: "500px", top: "18px" }}
        views={{ connected: timeline.is("phone-idle", "phone-done"), sign: timeline.is("phone-ask") }}
      />
      <DesktopWallet
        timeline={timeline}
        isShown={timeline.within("desktop-idle", "desktop-done")}
        style={{ left: "400px", top: "40px" }}
        views={{ connected: timeline.is("desktop-idle", "desktop-done"), sign: timeline.is("desktop-ask"), hardware: timeline.is("desktop-key") }}
      />
      <HardwareKey
        isShown={timeline.within("desktop-idle", "desktop-done")}
        isLit={timeline.is("desktop-key")}
        isDone={timeline.is("desktop-done")}
        keyRef={timeline.target("key")}
        x={580}
        y={340}
      />
      <WebWallet
        timeline={timeline}
        isShown={timeline.within("web-idle", "web-done")}
        style={{ left: "400px", top: "40px" }}
        views={{ connected: timeline.is("web-idle", "web-done"), sign: timeline.is("web-ask") }}
      />
    </Scene>
  );
};

export const ListScene = (): JSX.Element => {
  const timeline = createTimeline([
    { stepId: "closed", durationMs: 2000, cursor: [["toolbar", 0.7]] },
    { stepId: "list", durationMs: 3000, cursor: [["more", 0.8]] },
    { stepId: "menu", durationMs: 4000 },
    { stepId: "back", durationMs: 3000 },
  ], "menu", { x: 560, y: 240 });

  return (
    <Scene timeline={timeline} height={500} label={t("onboarding.list.scene")}>
      <div class="browser-window" style={{ left: "0px", top: "0px", width: "760px", height: "500px" }}>
        <BrowserBar tabs={SITE_TABS} address={ORIGIN}>
          <span class="browser-action" classList={{ open: !timeline.is("closed") }} ref={timeline.target("toolbar")}><Mark size={20} /></span>
          <span class="browser-action"><CircleUserRound size={18} /></span>
        </BrowserBar>
        <div class="site-page">
          <Skeleton width={160} height={14} />
          <Skeleton width={300} height={14} />
          <Skeleton width={220} />
        </div>
      </div>
      <PopupWindow style={{ left: "332px", top: "88px" }} isShown={!timeline.is("closed")}>
        <ListView rows={[{ peer: "phone", isBound: true }, { peer: "desktop" }, { peer: "web" }]} isMenuOpen={timeline.is("menu")} moreRef={timeline.target("more")} />
      </PopupWindow>
    </Scene>
  );
};
