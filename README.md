# openlv-connect

A browser extension that connects approved sites to [Open Lavatory](https://openlv.sh) wallets.
It injects an EIP-1193 provider and announces it through EIP-6963 alongside providers already on the page.
It preserves an existing `window.ethereum`.

## Connections

Each connection links the extension to a wallet and can serve one origin at a time.
To connect a phone from a site's approval window, select **Pair** and scan the QR with an OpenLV wallet.
The new connection is selected when the wallet joins, and the site's request stays pending until you select **Connect** or **Reject**.
The popup's **Connect** action uses the same QR flow.
Opening the popup shows saved connections without starting the connection engine.
An unfinished pairing stays in memory and does not appear in connection history.
A connection is saved after its encrypted handshake and the wallet's account reply.
Closing an unfinished pairing cancels it.
Each signaling protocol keeps its own server URL and uses the modal's default when no URL is saved.
Signaling and WebRTC transport settings are saved for the next connection.
Existing connections keep their settings.

A site's first `eth_requestAccounts` opens the approval window.
Choose a connection and the accounts that the site may see, then select **Connect** or **Reject**.
An approved origin can request its granted accounts again without another prompt.
Unapproved origins receive no accounts and cannot send wallet requests.
Granting a connection to another origin removes the previous grant.
The approval window shows the previous origin before this transfer.
Use a second connection to serve two sites at once.

The extension approves sites.
The wallet handles signature and transaction approval.
The development wallet returns fake signatures and transaction hashes without a confirmation prompt or a network broadcast.

## Development

Install the locked dependencies, then build and check:

```sh
nix develop -c pnpm install --frozen-lockfile
nix develop -c pnpm exec wxt build
nix develop -c pnpm exec tsc --noEmit
nix develop -c pnpm exec eslint
```

The build writes the unpacked extension to `.output/chrome-mv3`.
Load that directory through `chrome://extensions` with developer mode enabled.
The development profile lives in `.wxt/chromium-profile`.

## Behavior checks

Start a local MQTT broker with WebSocket support at `ws://127.0.0.1:18884`.
The broker can use this configuration:

```conf
listener 18884 127.0.0.1
protocol websockets
allow_anonymous true
persistence false
```

With the extension built and the broker running:

```sh
nix develop -c node --test tests/provider.mjs
```

The suite uses the runner's Chromium through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
It starts the dev lab on loopback and uses real MQTT and WebRTC connections.
It checks origin approval, provider coexistence, request routing, rejection, and connection transfer.
It does not use a phone, real funds, or transaction broadcasts.

The development wallet and dApp in `dev/` are never included in the extension build.

```sh
node dev/lab.mjs shots
node dev/lab.mjs live
node dev/lab.mjs open --headed
```

The lab uses the same loopback broker and writes light and dark screenshots to `.tmp/lab/shots`.
The live command checks a connection, site approval, a signature answer, a second origin, a rejection, settings reload, and a saved STUN entry.
QR data is masked in screenshots.

## Deferred work

Connections do not resume after a browser restart.
The extension currently stores connection metadata and site grants, but no session record or startup restore path.
Session persistence needs open-lavatory #22, then extension work to save and validate session records, restore offscreen sessions, refresh accounts and chain state, and remove records when a connection is forgotten.
Pending signature requests must not be replayed.
The policy for temporary connection loss and dApp disconnect events stays deferred until that work.

There is no signed `.crx` or declarative install package yet.
The Nix package uses the npm lockfile and does not use local workspace links.
Its build needs verification after the package release.

## Architecture

| Context | Responsibility |
| --- | --- |
| `src/entrypoints/inpage.content.ts` | EIP-1193 provider and EIP-6963 announcement in the page |
| `src/entrypoints/bridge.content.ts` | Messages between the page and the worker |
| `src/entrypoints/background.ts` | Site grants, request routing, and pending approvals |
| `src/entrypoints/offscreen/` | Live sessions and WebRTC connections |
| Popup and approval window | Connection management, settings, and account grants |

The worker reads a request's origin from the browser port sender.
The popup and approval window use the colors, controls, spacing, and motion from `@openlv/modal`.

## License

LGPL-3.0-only, matching Open Lavatory.
