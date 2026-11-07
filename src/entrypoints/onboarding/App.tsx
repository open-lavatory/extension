import type { JSX } from "solid-js";

import { Mark, Qr } from "./parts.js";
import { ListScene, PairScene, PinScene, SignScene, SiteScene } from "./scenes.js";

const Step = (properties: { number: number; title: string; children: JSX.Element; scene: JSX.Element; }): JSX.Element => (
  <li class="step">
    <div class="step-copy">
      <span class="step-number">{properties.number}</span>
      <h2>{properties.title}</h2>
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
      <h1>Thank you for installing openlv-connect</h1>
      <p>It connects websites to any wallet that supports openlv, whether that wallet runs on your phone, on your computer, or in another browser.</p>
      <p>Your wallet stays in charge. It approves every signature, and a site only sees the accounts you choose.</p>
    </header>

    <ol class="steps">
      <Step number={1} title="Pin it to your toolbar" scene={<PinScene />}>
        <p>Click the puzzle piece next to the address bar, then the pin next to openlv-connect.</p>
        <p>Its icon stays in your toolbar, so your wallets are one click away.</p>
      </Step>
      <Step number={2} title="Pair a wallet" scene={<PairScene />}>
        <p>Open openlv-connect and select Connect. It shows a QR code and a link.</p>
        <p>Scan the code with a phone wallet that supports openlv, or paste the link into one on your computer or in another browser.</p>
      </Step>
      <Step number={3} title="Let a site connect" scene={<SiteScene />}>
        <p>When a site asks for a wallet, openlv-connect opens a small window.</p>
        <p>Pick the wallet and the accounts the site may see, then select Connect. Until you do, the site sees nothing.</p>
      </Step>
      <Step number={4} title="Approve in your wallet" scene={<SignScene />}>
        <p>Signatures and transactions go to your wallet, and you approve or reject them there.</p>
        <p>openlv-connect never signs anything itself. With a hardware wallet, you also confirm on the device, as usual.</p>
      </Step>
      <Step number={5} title="Find your connections" scene={<ListScene />}>
        <p>Open openlv-connect from the toolbar to see your wallets and the sites that use them.</p>
        <p>The menu next to a wallet lets you revoke a site or forget the wallet.</p>
      </Step>
    </ol>

    <section class="welcome-more">
      <div class="welcome-docs">
        <span class="welcome-qr" role="img" aria-label="QR code for openlv.sh"><Qr /></span>
        <div>
          <h2>Learn more</h2>
          <p>The openlv docs explain how the connection between openlv-connect and your wallet works.</p>
          <a class="secondary welcome-link" href="https://openlv.sh">openlv.sh</a>
        </div>
      </div>
      <div class="welcome-again">
        <h2>See this page again</h2>
        <p>Right-click the openlv-connect icon in your toolbar and choose How it works.</p>
      </div>
    </section>
  </main>
);
