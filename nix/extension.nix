{
  lib,
  stdenv,
  nodejs_24,
  pnpm_11,
  fetchPnpmDeps,
  pnpmConfigHook,
}:
stdenv.mkDerivation (final: {
  pname = "openlv-connect";
  version = (lib.importJSON ../package.json).version;

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../package.json
      ../pnpm-workspace.yaml
      ../public
      ../pnpm-lock.yaml
      ../tsconfig.json
      ../wxt.config.ts
      ../src
    ];
  };

  nativeBuildInputs = [nodejs_24 pnpm_11 pnpmConfigHook];

  # fetcherVersion 3 is rejected for pnpm 11 and newer, see
  # pkgs/build-support/node/fetch-pnpm-deps/default.nix
  pnpmDeps = fetchPnpmDeps {
    inherit (final) pname version src;
    fetcherVersion = 4;
    hash = "sha256-uDRKBhSzWv/8Rb6GXuFbgkywYMzmnqvMqUta0IhP7VI=";
  };

  buildPhase = ''
    runHook preBuild
    export HOME=$(mktemp -d)
    pnpm exec wxt prepare
    pnpm exec wxt build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r .output/chrome-mv3/. $out/
    runHook postInstall
  '';

  meta = {
    description = "Connect and manage openlv connections";
    license = lib.licenses.lgpl3Only;
    platforms = lib.platforms.all;
  };
})
