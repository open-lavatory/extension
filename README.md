# OpenLV Connector

A browser extension that keeps several paired [Open Lavatory](https://openlv.sh)
connections alive and hands any web3 site an ordinary EIP-1193 provider routed
to whichever connection you granted it.

The site sees a normal injected wallet. You are running a peer to peer session
to your phone, over infrastructure you chose, with no relay in the middle once
the handshake is done.

## The model

A **connection** is what you pair, what the popup lists, and what is either
free or in use by exactly one site. Pair one by scanning its code with an
OpenLV compatible wallet.

A connection serves one site at a time. Granting it to a second site takes it
away from the first, and the first is told it was disconnected. To use two
sites at once, pair a second connection.

The extension approves sites. The wallet approves transactions. Connecting a
site raises one prompt from the extension; every signature after that is
confirmed on your phone and nowhere else.

## Status

Working: pairing, the injected provider and its EIP-6963 announcement, the
approval window, per origin bindings with exclusivity, account selection, and
request forwarding.

Not working yet:

- **Connections do not survive a browser restart.** `initEncryptionKeys` in
  `@openlv/core` generates a fresh keypair on every call and ignores the one
  `SessionConnectionParameters` carries, so a restarted host fails the
  wallet's `h` check and is rejected as tampering. Fixing it needs the session
  assembled with an injected keypair, and then the same fix taken upstream.
  Still true in 0.2.0.
- No packed `.crx` yet, so no declarative install. Load it unpacked for now.
- No automated tests.

## Relays

Signaling carries the handshake that sets up a connection. Whoever runs that
relay sees that two peers met and when, so the choice is yours and it is made
per connection: the pairing screen asks for a protocol (`mqtt`, `ntfy` or
`gun`) and a server every time, prefilled with whatever you used last. Each
connection then carries the relay it was paired on.

The manifest asks for no host permissions at all. WebSocket relays are not
gated by them, and an HTTP relay works as long as it sends permissive CORS
headers, which the public ones do. A self hosted relay without those headers
will fail to connect rather than silently reach out from your browser.

## Development

```bash
just install
just dev
```

`just dev` opens Chromium with the extension already loaded and reloads it on
every save. It needs `web-ext`, which WXT treats as an optional peer: without
it WXT falls back to printing "load the unpacked extension manually" instead of
opening anything. The browser is found automatically, and the profile lives in
`.wxt/chromium-profile` so relays and paired connections survive a restart of
the dev server.

`just build` writes a production build to `.output/chrome-mv3` for loading
through `chrome://extensions`, developer mode, load unpacked.

`just lint`, `just typecheck` and `just build` are the three checks.

## Trying it

1. `just dev`, which opens Chromium with the extension loaded.
2. Open the popup, pair a connection, and choose the relay for it.
3. Scan the code with an OpenLV compatible wallet, or use the dev wallet
   described below.
4. Visit any dapp with a wallet picker. "OpenLV Connector" appears in the list
   through EIP-6963. Connecting raises the approval window, where you pick the
   connection and the accounts that site may see.

## The lab

`dev/lab.mjs` drives a headless Chromium with the extension loaded, so the
whole flow can be exercised without a phone.

```bash
just shots   # screenshot every surface into .tmp/lab/shots
just live    # pair for real against the dev wallet, then connect a dapp
just lab     # leave a browser open with everything running
```

`just live` is the end to end run: it pairs over a real relay, joins from
`dev/wallet` over WebRTC, discovers the provider from `dev/dapp` through
EIP-6963, walks the approval window, and checks the account reaches the page.
Both fixtures are served by Vite on port 5174 and are never part of a build.

The dev wallet answers with anvil's first development account and obviously
fake signatures. It exists to exercise the extension, not to hold anything.

## Nix

```bash
nix build
```

Builds the unpacked extension into the store. Flakes only see files tracked by
git, so a new file has to be staged before the build can find it.

Installing it declaratively needs a signed `.crx`, which is the next packaging
step. The signature there derives the extension id and is not a trust anchor:
a Nix user pins a store path, so the store hash is the thing being relied on.
`just keygen` generates the keypair when that lands.

## Architecture

Five contexts, and the split is forced rather than chosen.

| context | holds | why |
| --- | --- | --- |
| `src/entrypoints/inpage.content.ts` | the EIP-1193 provider, announced over EIP-6963 | a provider has to be a real object in the page's own realm |
| `src/entrypoints/bridge.content.ts` | nothing | carries messages between the page and the worker |
| `src/entrypoints/background.ts` | the registry, the bindings, pending approvals | the only context with extension privileges that outlives a navigation |
| `src/entrypoints/offscreen/` | every live session and its `RTCPeerConnection` | a service worker has no `RTCPeerConnection`, so the transport cannot run there |
| popup, approve | nothing durable | pairing and approval |

The popup and the approval window use the token set from `@openlv/modal`, and
the pairing screen switches on session status the way the modal does: a spinner
while signaling connects, the code once the session is `ready`, a spinner again
while the transport links, then the wallet's own name and icon.

The origin of a request is read from `sender.origin` on the port, never from
the message body. A page can write anything into a `postMessage` payload and
nothing into the port it opened.

## Licence

LGPL-3.0-only, matching the rest of Open Lavatory.
