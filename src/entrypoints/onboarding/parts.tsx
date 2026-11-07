import ArrowLeftRight from "lucide-solid/icons/arrow-left-right";
import BatteryFull from "lucide-solid/icons/battery-full";
import Camera from "lucide-solid/icons/camera";
import Check from "lucide-solid/icons/check";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import MousePointer2 from "lucide-solid/icons/mouse-pointer-2";
import Pause from "lucide-solid/icons/pause";
import Play from "lucide-solid/icons/play";
import Signal from "lucide-solid/icons/signal";
import Usb from "lucide-solid/icons/usb";
import Wifi from "lucide-solid/icons/wifi";
import { encodeQR } from "qr";
import { createSignal, For, type JSX, onCleanup, Show } from "solid-js";

import mark from "../../assets/openlv.svg";
import type { Playback } from "./timeline.js";

export type Peer = "phone" | "desktop" | "web";

export const PEER_NAME: Record<Peer, string> = {
  phone: "Example Wallet",
  desktop: "Example Desktop",
  web: "Example Multisig",
};

export const ORIGIN = "swap.example";
export const ACCOUNT = "0x71C7...976F";
export const ACCOUNT_APPROVE = "0x71C7656E...d8976F";

const LINK = "openlv://k7n8m9x2w5q1p3r6@1?h=a1b2c3d4e5f60708&k=0123456789abcdef";

export const QR_SVG = encodeQR("https://openlv.sh", "svg", { ecc: "low", border: 2 });

const PEER_GLYPH: Record<Peer | "site", () => JSX.Element> = {
  site: () => <ArrowLeftRight />,
  phone: () => (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  ),
  desktop: () => (
    <svg viewBox="0 0 24 24">
      <path d="M12 3.5 19.5 7.75v8.5L12 20.5 4.5 16.25v-8.5z" />
    </svg>
  ),
  web: () => (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="6.5" r="2.5" />
      <circle cx="6" cy="17" r="2.5" />
      <circle cx="18" cy="17" r="2.5" />
      <path d="M10.7 8.7 7.3 14.8M13.3 8.7l3.4 6.1M8.5 17h7" />
    </svg>
  ),
};

export const PeerIcon = (properties: { peer: Peer | "site"; size: number; }): JSX.Element => (
  <span class="peer-icon" classList={{ [`peer-${properties.peer}`]: true }} style={{ "--size": `${properties.size}px` }}>
    {PEER_GLYPH[properties.peer]()}
  </span>
);

export const Mark = (properties: { size: number; }): JSX.Element => <img class="mark" src={mark} alt="" width={properties.size} height={properties.size} />;

export const Qr = (): JSX.Element => <span class="qr" innerHTML={QR_SVG} />;

export const Layer = (properties: { when: boolean; class?: string; children: JSX.Element; }): JSX.Element => (
  <div class={properties.class} classList={{ layer: true, on: properties.when }}>{properties.children}</div>
);

const SCENE_WIDTH = 760;

export const Scene = (properties: {
  timeline: Playback;
  height: number;
  label: string;
  children: JSX.Element;
  controls?: JSX.Element;
}): JSX.Element => {
  const [scale, setScale] = createSignal(1);
  const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, (entry?.contentRect.width ?? SCENE_WIDTH) / SCENE_WIDTH)));

  onCleanup(() => observer.disconnect());

  return (
    <figure class="visual">
      <div class="scene-frame" role="img" aria-label={properties.label} ref={element => observer.observe(element)} style={{ height: `${properties.height * scale()}px` }}>
        <div class="scene" classList={{ paused: properties.timeline.isPaused() }} inert aria-hidden="true" ref={properties.timeline.setRoot} style={{ "width": `${SCENE_WIDTH}px`, "height": `${properties.height}px`, "--scale": scale() }}>
          {properties.children}
          <span class="pointer" classList={{ on: properties.timeline.pointer().isVisible, clicking: properties.timeline.pointer().isClicking }} style={{ left: `${properties.timeline.pointer().x - 4}px`, top: `${properties.timeline.pointer().y - 4}px` }}>
            <MousePointer2 size={24} />
          </span>
          <For each={properties.timeline.ripples()}>
            {ripple => <span class="ripple" style={{ left: `${ripple.x - 18}px`, top: `${ripple.y - 18}px` }} />}
          </For>
        </div>
      </div>
      <Show when={!properties.timeline.isReduced()}>
        <div class="visual-controls">
          {properties.controls}
          <button type="button" class="icon-button" aria-label={properties.timeline.isPaused() ? "Play animation" : "Pause animation"} onClick={() => properties.timeline.togglePaused()}>
            <Show when={properties.timeline.isPaused()} fallback={<Pause size={16} />}><Play size={16} /></Show>
          </button>
        </div>
      </Show>
      <Show when={properties.timeline.isReduced() && properties.controls}>
        <div class="visual-controls">{properties.controls}</div>
      </Show>
    </figure>
  );
};

export const BrowserBar = (properties: { origin: string; children?: JSX.Element; }): JSX.Element => (
  <>
    <div class="browser-tabs">
      <span class="browser-tab active">
        <PeerIcon peer="site" size={14} />
        {properties.origin}
      </span>
    </div>
    <div class="browser-bar">
      <span class="browser-nav">
        <ChevronLeft size={16} />
        <ChevronRight size={16} />
      </span>
      <span class="browser-address">{properties.origin}</span>
      {properties.children}
    </div>
  </>
);

export const Skeleton = (properties: { width: number; height?: number; }): JSX.Element => <i class="skeleton" style={{ width: `${properties.width}px`, height: `${properties.height ?? 8}px` }} />;

const PhoneStatus = (): JSX.Element => (
  <div class="phone-status">
    <span>9:41</span>
    <span class="phone-island" />
    <span class="phone-status-icons">
      <Signal size={11} />
      <Wifi size={11} />
      <BatteryFull size={14} />
    </span>
  </div>
);

export type WalletViews = {
  home?: boolean;
  scan?: boolean;
  link?: boolean;
  ok?: boolean;
  connected?: boolean;
  sign?: boolean;
  hardware?: boolean;
};

const ConnectPrompt = (properties: { okRef: (element: HTMLElement) => void; }): JSX.Element => (
  <div class="wallet-prompt">
    <Mark size={36} />
    <strong>openlv-connect</strong>
    <span class="wallet-identity">sh.openlv.connect</span>
    <p>wants to connect</p>
    <label class="wallet-account">
      <input type="checkbox" checked />
      <span>{ACCOUNT}</span>
    </label>
    <div class="wallet-actions">
      <span class="secondary">Dismiss</span>
      <span class="primary" ref={properties.okRef}>Connect</span>
    </div>
  </div>
);

const SignPrompt = (properties: { okRef: (element: HTMLElement) => void; }): JSX.Element => (
  <div class="wallet-prompt">
    <Mark size={36} />
    <strong>openlv-connect</strong>
    <span class="wallet-identity">sh.openlv.connect</span>
    <span class="wallet-label">Sign</span>
    <p class="wallet-message">Hello, world!</p>
    <div class="wallet-actions">
      <span class="secondary">Reject</span>
      <span class="primary" ref={properties.okRef}>Approve</span>
    </div>
  </div>
);

const WalletConnected = (): JSX.Element => (
  <div class="wallet-connected">
    <div class="wallet-session">
      <Mark size={28} />
      <span>
        <strong>openlv-connect</strong>
        <span class="wallet-live">Connected</span>
      </span>
    </div>
    <Skeleton width={120} />
    <Skeleton width={90} />
  </div>
);

const LinkHome = (properties: { isTyped: boolean; fieldRef: (element: HTMLElement) => void; goRef: (element: HTMLElement) => void; }): JSX.Element => (
  <div class="wallet-link">
    <span class="wallet-link-label">Connect with link</span>
    <span class="wallet-field" ref={properties.fieldRef}>
      <Show when={properties.isTyped} fallback={<span class="wallet-placeholder">Paste an openlv:// link</span>}>
        <span class="wallet-typed">{LINK}</span>
      </Show>
    </span>
    <span class="primary full" ref={properties.goRef}>Connect</span>
  </div>
);

const WalletBody = (properties: { views: WalletViews; home: JSX.Element; timeline: Playback; name: string; }): JSX.Element => (
  <div class="layers wallet-body">
    <Show when={properties.views.home !== undefined}>
      <Layer when={!!properties.views.home}>{properties.home}</Layer>
    </Show>
    <Show when={properties.views.scan !== undefined}>
      <Layer when={!!properties.views.scan} class="viewfinder">
        <span class="corner top-left" />
        <span class="corner top-right" />
        <span class="corner bottom-left" />
        <span class="corner bottom-right" />
        <span class="viewfinder-code"><Qr /></span>
        <span class="scanline" />
      </Layer>
    </Show>
    <Show when={properties.views.link !== undefined}>
      <Layer when={!!properties.views.link} class="wallet-wait"><span class="spinner" /></Layer>
    </Show>
    <Show when={properties.views.ok !== undefined}>
      <Layer when={!!properties.views.ok}><ConnectPrompt okRef={properties.timeline.target(`${properties.name}-ok`)} /></Layer>
    </Show>
    <Layer when={!!properties.views.connected}><WalletConnected /></Layer>
    <Show when={properties.views.sign !== undefined}>
      <Layer when={!!properties.views.sign}><SignPrompt okRef={properties.timeline.target(`${properties.name}-sign`)} /></Layer>
    </Show>
    <Show when={properties.views.hardware !== undefined}>
      <Layer when={!!properties.views.hardware} class="state">
        <Usb />
        <strong>Confirm on your device</strong>
        <p>Example Key</p>
      </Layer>
    </Show>
  </div>
);

export const Phone = (properties: { timeline: Playback; views: WalletViews; isMoving?: boolean; isShown?: boolean; style: JSX.CSSProperties; }): JSX.Element => (
  <div class="device phone" classList={{ moving: !!properties.isMoving, hidden: properties.isShown === false }} style={properties.style}>
    <span class="phone-button phone-power" />
    <span class="phone-button phone-volume-up" />
    <span class="phone-button phone-volume-down" />
    <div class="phone-screen">
      <PhoneStatus />
      <div class="wallet-header">
        <PeerIcon peer="phone" size={24} />
        <strong>{PEER_NAME.phone}</strong>
      </div>
      <WalletBody
        views={properties.views}
        timeline={properties.timeline}
        name="phone"
        home={(
          <div class="wallet-home">
            <span class="wallet-address">{ACCOUNT}</span>
            <Skeleton width={110} height={18} />
            <Skeleton width={70} />
            <span class="secondary full">
              <Camera size={18} />
              Scan
            </span>
          </div>
        )}
      />
      <span class="phone-home" />
    </div>
  </div>
);

export const DesktopWallet = (properties: { timeline: Playback; views: WalletViews; isTyped?: boolean; isShown?: boolean; style: JSX.CSSProperties; }): JSX.Element => (
  <div class="device app-window" classList={{ hidden: properties.isShown === false }} style={properties.style}>
    <div class="app-titlebar">
      <span class="app-lights">
        <i />
        <i />
        <i />
      </span>
      <PeerIcon peer="desktop" size={16} />
      <span>{PEER_NAME.desktop}</span>
    </div>
    <div class="app-content">
      <WalletBody
        views={properties.views}
        timeline={properties.timeline}
        name="desktop"
        home={properties.isTyped === undefined
          ? (
              <div class="wallet-home">
                <span class="wallet-address">{ACCOUNT}</span>
                <Skeleton width={140} height={18} />
              </div>
            )
          : <LinkHome isTyped={properties.isTyped} fieldRef={properties.timeline.target("desktop-field")} goRef={properties.timeline.target("desktop-go")} />}
      />
    </div>
  </div>
);

export const WebWallet = (properties: { timeline: Playback; views: WalletViews; isTyped: boolean; isShown?: boolean; style: JSX.CSSProperties; }): JSX.Element => (
  <div class="device browser-window web-wallet" classList={{ hidden: properties.isShown === false }} style={properties.style}>
    <div class="browser-tabs">
      <span class="browser-tab">
        <PeerIcon peer="site" size={14} />
        {ORIGIN}
      </span>
      <span class="browser-tab active">
        <PeerIcon peer="web" size={14} />
        multisig.example
      </span>
    </div>
    <div class="browser-bar">
      <span class="browser-address">multisig.example</span>
    </div>
    <div class="web-wallet-header">
      <PeerIcon peer="web" size={22} />
      <strong>{PEER_NAME.web}</strong>
    </div>
    <div class="app-content">
      <WalletBody
        views={properties.views}
        timeline={properties.timeline}
        name="web"
        home={<LinkHome isTyped={properties.isTyped} fieldRef={properties.timeline.target("web-field")} goRef={properties.timeline.target("web-go")} />}
      />
    </div>
  </div>
);

export const HardwareKey = (properties: { isShown: boolean; isLit: boolean; isDone: boolean; keyRef: (element: HTMLElement) => void; x: number; y: number; }): JSX.Element => (
  <div class="hardware" classList={{ hidden: !properties.isShown }} style={{ left: `${properties.x}px`, top: `${properties.y}px` }}>
    <i class="cable" />
    <div class="hardware-key" classList={{ lit: properties.isLit }} ref={properties.keyRef}>
      <Usb size={18} />
      <span>Example Key</span>
      <Show when={properties.isDone}><Check size={16} class="hardware-done" /></Show>
    </div>
  </div>
);
