import CircleUserRound from "lucide-solid/icons/circle-user-round";
import Pin from "lucide-solid/icons/pin";
import Puzzle from "lucide-solid/icons/puzzle";
import { For, type JSX, Show } from "solid-js";

import { ACCOUNT, BrowserBar, DesktopWallet, HardwareKey, Layer, Mark, ORIGIN, type Peer, PeerIcon, Phone, Scene, Skeleton, WebWallet } from "./parts.js";
import { createTimeline } from "./timeline.js";
import { ApprovalWindow, ListView, LoadingView, PairedView, PopupWindow, QrView } from "./windows.js";

const SiteNav = (properties: { account?: Peer; connectRef?: (element: HTMLElement) => void; }): JSX.Element => (
  <div class="site-nav">
    <PeerIcon peer="site" size={28} />
    <strong>Swap</strong>
    <span class="site-spacer" />
    <Show when={properties.account} fallback={<span class="site-button" ref={properties.connectRef}>Connect</span>}>
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
  ], "menu");

  return (
    <Scene timeline={timeline} height={300} label="The extensions menu next to the address bar, with the pin next to openlv-connect.">
      <div class="browser-window" style={{ left: "0px", top: "0px", width: "760px", height: "280px" }}>
        <BrowserBar origin={ORIGIN}>
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
      <div class="extensions-menu" classList={{ hidden: !timeline.is("menu") }} style={{ right: "12px", top: "84px" }}>
        <p class="extensions-title">Extensions</p>
        <div class="extensions-row">
          <Mark size={18} />
          <span>openlv-connect</span>
          <span class="extensions-pin" ref={timeline.target("pin")}><Pin size={16} /></span>
        </div>
        <p class="extensions-manage">Manage extensions</p>
      </div>
    </Scene>
  );
};

const KINDS: { peer: Peer; label: string; jumpTo: PairStep; still: PairStep; }[] = [
  { peer: "phone", label: "Phone", jumpTo: "list", still: "scan-phone" },
  { peer: "desktop", label: "Desktop", jumpTo: "qr-desktop", still: "paste-desktop" },
  { peer: "web", label: "Browser", jumpTo: "qr-web", still: "paste-web" },
];

type PairStep
  = | "list" | "qr-phone" | "scan-phone" | "link-phone" | "ok-phone" | "done-phone"
    | "qr-desktop" | "paste-desktop" | "link-desktop" | "ok-desktop" | "done-desktop"
    | "qr-web" | "open-web" | "paste-web" | "link-web" | "ok-web" | "done-web";

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
    { stepId: "open-web", durationMs: 1800 },
    { stepId: "paste-web", durationMs: 3800, cursor: [["web-field", 0.15], ["web-go", 0.8]] },
    { stepId: "link-web", durationMs: 1400 },
    { stepId: "ok-web", durationMs: 2800, cursor: [["web-ok", 0.65]] },
    { stepId: "done-web", durationMs: 3000 },
  ], "scan-phone");
  const pairedPeer = (): Peer | undefined => KINDS.find(kind => timeline.is(`done-${kind.peer}`))?.peer;

  return (
    <Scene
      timeline={timeline}
      height={470}
      label="openlv-connect shows a QR code and a link. A phone wallet scans the code, a desktop wallet and a wallet in another browser take the link."
      controls={(
        <div class="kinds">
          <For each={KINDS}>
            {kind => (
              <button type="button" classList={{ current: timeline.within(kind.jumpTo, `done-${kind.peer}`) || (kind.peer === "phone" && timeline.is("list")) }} onClick={() => timeline.jump(kind.jumpTo, kind.still)}>
                <PeerIcon peer={kind.peer} size={18} />
                {kind.label}
              </button>
            )}
          </For>
        </div>
      )}
    >
      <PopupWindow style={{ left: "0px", top: "0px" }}>
        <div class="layers">
          <Layer when={timeline.is("list")}><ListView rows={[]} connectRef={timeline.target("popup-connect")} /></Layer>
          <Layer when={timeline.within("qr-phone", "scan-phone") || timeline.within("qr-desktop", "paste-desktop") || timeline.within("qr-web", "paste-web")}>
            <QrView isCopied={timeline.is("paste-desktop", "open-web", "paste-web")} copyRef={timeline.target("copy")} />
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
        isShown={timeline.within("open-web", "done-web")}
        isTyped={timeline.is("paste-web")}
        style={{ left: "400px", top: "40px" }}
        views={{
          home: timeline.within("open-web", "paste-web"),
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
  ], "pick");

  return (
    <Scene timeline={timeline} height={640} label="A site asks to connect. The openlv-connect window lists your wallets and the accounts the site may see.">
      <div class="browser-window" style={{ left: "0px", top: "0px", width: "560px", height: "380px" }}>
        <BrowserBar origin={ORIGIN}>
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

export const SignScene = (): JSX.Element => {
  const timeline = createTimeline([
    { stepId: "phone-idle", durationMs: 1800, cursor: [["site-sign", 0.7]] },
    { stepId: "phone-ask", durationMs: 3200, tap: [["phone-sign", 0.7]] },
    { stepId: "phone-done", durationMs: 2600 },
    { stepId: "desktop-idle", durationMs: 1800, cursor: [["site-sign", 0.7]] },
    { stepId: "desktop-ask", durationMs: 3000, cursor: [["desktop-sign", 0.7]] },
    { stepId: "desktop-key", durationMs: 3200, cursor: [["key", 0.65]] },
    { stepId: "desktop-done", durationMs: 2800 },
  ], "desktop-key");
  const isWaiting = () => timeline.is("phone-ask", "desktop-ask", "desktop-key");
  const isSigned = () => timeline.is("phone-done", "desktop-done");

  return (
    <Scene timeline={timeline} height={456} label="The site asks for a signature. You approve it in your wallet, and on a hardware key when you use one.">
      <div class="browser-window" style={{ left: "0px", top: "78px", width: "380px", height: "300px" }}>
        <BrowserBar origin={ORIGIN} />
        <div class="site-page">
          <SiteNav account={timeline.within("phone-idle", "phone-done") ? "phone" : "desktop"} />
          <div class="site-message">
            <p>Hello, world!</p>
            <Show
              when={isSigned()}
              fallback={(
                <span class="site-button" ref={timeline.target("site-sign")}>
                  <Show when={isWaiting()} fallback="Sign message"><span class="spinner small" /></Show>
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
    </Scene>
  );
};

export const ListScene = (): JSX.Element => {
  const timeline = createTimeline([
    { stepId: "closed", durationMs: 2000, cursor: [["toolbar", 0.7]] },
    { stepId: "list", durationMs: 3000, cursor: [["more", 0.8]] },
    { stepId: "menu", durationMs: 4000 },
    { stepId: "back", durationMs: 3000 },
  ], "menu");

  return (
    <Scene timeline={timeline} height={500} label="The openlv-connect popup lists your wallets and the sites that use them.">
      <div class="browser-window" style={{ left: "0px", top: "0px", width: "760px", height: "500px" }}>
        <BrowserBar origin={ORIGIN}>
          <span class="browser-action" classList={{ open: !timeline.is("closed") }} ref={timeline.target("toolbar")}><Mark size={20} /></span>
          <span class="browser-action"><CircleUserRound size={18} /></span>
        </BrowserBar>
        <div class="site-page">
          <Skeleton width={160} height={14} />
          <Skeleton width={300} height={14} />
          <Skeleton width={220} />
        </div>
      </div>
      <PopupWindow style={{ left: "332px", top: "84px" }} isShown={!timeline.is("closed")}>
        <ListView rows={[{ peer: "phone", isBound: true }, { peer: "desktop" }, { peer: "web" }]} isMenuOpen={timeline.is("menu")} moreRef={timeline.target("more")} />
      </PopupWindow>
    </Scene>
  );
};
