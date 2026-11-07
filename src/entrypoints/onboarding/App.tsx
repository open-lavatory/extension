import { type JSX, Show } from "solid-js";

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
        <Show when={properties.isOptional}><span class="step-optional">optional</span></Show>
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
      <h1>Thank you for installing</h1>
      <p>It connects websites to any wallet that supports openlv, whether that wallet runs on your phone, on your computer, or in another browser.</p>
      <p>Your wallet stays in charge. It approves every signature, and a site only sees the accounts you choose.</p>
    </header>

    <ol class="steps">
      <Step number={0} title="Pin it to your toolbar" isOptional scene={<PinScene />}>
        <p>Click the puzzle piece next to the address bar, then the pin next to openlv-connect.</p>
        <p>Its icon stays in your toolbar, so your wallets are one click away.</p>
      </Step>
      <Step number={1} title="Connect a wallet" scene={<PairScene />}>
        <p>Open openlv-connect and select Connect. It shows a QR code and a link.</p>
        <p>Scan the code with a phone wallet that supports openlv, or paste the link into one on your computer or in another browser.</p>
      </Step>
      <Step number={2} title="Connect to a dApp" scene={<SiteScene />}>
        <p>When a site asks for a wallet, openlv-connect opens a small window.</p>
        <p>Pick the wallet and the accounts the site may see, then select Connect. Until you do, the site sees nothing.</p>
      </Step>
      <Step number={3} title="Approve in your wallet" scene={<SignScene />}>
        <p>Signatures and transactions go to your wallet, and you approve or reject them there.</p>
        <p>openlv-connect never signs anything itself. With a hardware wallet, you also confirm on the device, as usual.</p>
      </Step>
      <Step number={4} title="Manage your connections" scene={<ListScene />}>
        <p>Open openlv-connect from the toolbar to see your wallets and the sites that use them.</p>
        <p>The menu next to a wallet lets you revoke a site or forget the wallet.</p>
      </Step>
      <Step number={5} title="Enjoy">
        <p>You now know everything you need to use openlv. We hope you have a wonderful time.</p>
      </Step>
    </ol>
  </main>
);
