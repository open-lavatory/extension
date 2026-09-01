default:
    @just --list --unsorted

# install dependencies and generate wxt's type stubs
install:
    pnpm install
    pnpm exec wxt prepare

# open chromium with the extension loaded, reloading on every save
dev:
    pnpm dev

# screenshot every extension surface into .tmp/lab/shots
shots: build
    node dev/lab.mjs shots

# pair for real against the dev wallet and screenshot the whole flow
live: build
    node dev/lab.mjs live

# leave a chromium open with the extension, the dev wallet and the dev dapp
lab: build
    node dev/lab.mjs open --headed

# production build into .output/chrome-mv3
build:
    pnpm exec wxt prepare
    pnpm exec wxt build

typecheck:
    pnpm exec wxt prepare
    pnpm exec tsc --noEmit

lint:
    pnpm exec eslint

lint-fix:
    pnpm exec eslint --fix

# generate the signing keypair that fixes the extension id (run once, then commit key.pem)
keygen:
    #!/usr/bin/env bash
    set -euo pipefail
    test ! -f key.pem || { echo "key.pem already exists, refusing to overwrite"; exit 1; }
    openssl genrsa -out key.pem 2048
    echo "public key for wxt.config.ts manifest.key:"
    openssl rsa -in key.pem -pubout -outform DER 2>/dev/null | base64 -w0
    echo
