# JSBSim WASM Tooling + TypeScript SDK

This repository builds [JSBSim](https://github.com/JSBSim-Team/jsbsim) to WebAssembly for Node.js and browsers, and ships a TypeScript SDK for loading and interacting with `FGFDMExec`.

> [!WARNING]  
> This toolkit is still in early development and may contain bugs or unexpected behavior. *Please note that WASM and SDK builds are not available yet. To use this libary, you must build it yourself.*

**Demo: https://0x62.github.io/jsbsim-wasm/**

## Highlights

- JSBSim is tracked as a git submodule at `vendor/jsbsim`.
- `FGFDMExec` bindings are generated automatically from `FGFDMExec.h`.
- No static data preloading is used.
- Runtime data lives in Emscripten MEMFS for speed.
- Optional persistence is available through IDBFS sync (browser).
- SDK package output is ESM-first.

## Prerequisites

- Node.js 20+
- CMake 3.20+
- Emscripten SDK (`emcmake`/`em++` in `PATH`)

## Build

```bash
npm install
npm run prepare:jsbsim
npm run generate:bindings
npm run build:wasm
npm run build:sdk
```

Or all at once:

```bash
npm run build
```

Note: `prepare:jsbsim` automatically applies `patches/jsbsim-emscripten-compat.patch` to keep JSBSim Emscripten-compatible (portable `strerror_r` handling and POSIX socket/select headers).

Artifacts:

- WASM runtime: `dist/wasm/jsbsim_wasm.mjs`, `dist/wasm/jsbsim_wasm.wasm`
- SDK package output: `dist/*`

## SDK Usage

`JSBSimSdk` extends a generated `JSBSimApi` class:

- `JSBSimApi` is generated from `FGFDMExec.h` and exposes methods in `camelCase`.
- `JSBSimSdk` adds runtime/VFS helpers (`create`, `writeDataFile`, `syncToPersistence`, etc.).

### Basic lifecycle

```ts
import { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { wasmBinaryUrl, wasmModuleUrl } from "@0x62/jsbsim-wasm/wasm";

const sdk = await JSBSimSdk.create({
  moduleUrl: wasmModuleUrl,
  wasmUrl: wasmBinaryUrl,
  persistence: { enabled: true },
  log: {
    console: true,
    stripAnsi: true
  }
});

// Write runtime files into MEMFS
sdk.writeDataFile("aircraft/c172/c172.xml", xmlText);
sdk.writeDataFile("scripts/c172-test.xml", scriptXml);

// Optional: override runtime search paths
sdk.configurePaths({
  rootDir: "/runtime",
  aircraftPath: "aircraft",
  enginePath: "engine",
  systemsPath: "systems"
});

sdk.loadModel("c172"); // addModelToPath defaults to true
sdk.loadScript("scripts/c172-test.xml"); // deltaT defaults to 0, initfile defaults to ""
sdk.runIc();

while (sdk.run()) {
  const altitudeFt = sdk.getPropertyValue("position/h-sl-ft");
  if (altitudeFt > 2000) break;
}

await sdk.syncToPersistence();
```

### WASM package export

Use the package `/wasm` export to reference the bundled runtime artifacts:

```ts
import { wasmBinaryUrl, wasmModuleUrl } from "@0x62/jsbsim-wasm/wasm";
```

Raw artifact subpaths are also exported:

- `@0x62/jsbsim-wasm/wasm/module`
- `@0x62/jsbsim-wasm/wasm/binary`

### Enums and mode flags

```ts
import {
  JSBSimSdk,
  TrimMode,
  ResetToInitialConditionsMode
} from "@0x62/jsbsim-wasm";

const sdk = await JSBSimSdk.create();

sdk.setTrimMode(TrimMode.tLongitudinal);
sdk.doTrim(TrimMode.tLongitudinal);

// Reset flags are bitmasks and can be OR-ed together.
sdk.resetToInitialConditions(
  ResetToInitialConditionsMode.START_NEW_OUTPUT |
  ResetToInitialConditionsMode.DONT_EXECUTE_RUN_IC
);

// Required when DONT_EXECUTE_RUN_IC is set.
sdk.runIc();
```

### Overloads and default parameters

```ts
// Generated overloads map directly to FGFDMExec overloads.
sdk.loadModel("c172");
sdk.loadModel("aircraft", "engine", "systems", "c172");

// JSBSimSdk helper for path overrides.
sdk.loadModelWithOptions("c172", {
  aircraftPath: "aircraft",
  enginePath: "engine",
  systemsPath: "systems",
  addModelToPath: true
});

// Default args mirrored from FGFDMExec.h.
sdk.loadPlanet("earth.xml"); // useAircraftPath defaults to true
sdk.forceOutput(); // idx defaults to 0
const catalog = sdk.queryPropertyCatalog("fcs/"); // end_of_line defaults to "\n"
```

### Raw exec access

If you need the underlying embind object, it is available on `sdk.exec`:

```ts
sdk.exec.RunIC();
sdk.exec.Run();
```

## Updating JSBSim

### Local

```bash
npm run update:jsbsim
```

This will:

1. Update submodule to `origin/master` (or a ref you pass).
2. Regenerate bindings and TypeScript API.
3. Rebuild WASM artifacts.
4. Rebuild SDK output.

### CI automation

`.github/workflows/update-jsbsim.yml` runs weekly and on manual trigger, checks for a newer stable JSBSim tag, and opens/updates a PR only when a new version is available. The PR updates the submodule, regenerates artifacts, and bumps package version to the next `<jsbsim>-beta.<N>` release.

## Release Workflow

Run a release preparation with:

```bash
./scripts/release.sh
```

What it does by default:

1. Resolves the target JSBSim tag (latest stable `vX.Y.Z` unless overridden).
2. Checks out that JSBSim tag in the submodule, reapplies patches, and rebuilds SDK/WASM artifacts.
3. Sets package version to `<jsbsim-version>-beta.<N>` (for example `1.2.4-beta.1`, auto-incremented from npm history).
4. Creates a release commit and annotated git tag.
5. Publishes to npm.
6. Creates a GitHub release and uploads `release/dist-<version>.tar.gz` plus `release/publish-metadata.json`.
7. Pushes commit + tag to origin.

Useful flags:

- `--jsbsim-tag <tag>`
- `--beta <N>`
- `--npm-tag <tag>`
- `--skip-demo-check`
- `--allow-dirty`
- `--dry-run`

Publish metadata includes package/tarball details, git commit/tag data, JSBSim submodule revision, and SHA-256 digests of packed files.

## Demo SPA

The `demo/` folder contains a simple React + Vite UI that:

- Loads the WASM module
- Preloads a hobby rocket model and launch script
- Provides launch/pause-resume/reload controls
- Streams altitude, vertical velocity, and vertical acceleration telemetry live

From repo root:

```bash
npm run demo:install
npm run build:wasm
npm run demo:sync-assets
npm run demo:dev
```

## Notes on API Exposure

The binding generator parses `FGFDMExec.h` and emits:

- `src/generated/fgfdmexec-api.ts` (TypeScript types/enums for embind surface)
- `src/generated/jsbsim-api.ts` (camelCase wrapper class with JSDoc/defaults)

Most public `FGFDMExec` methods are exposed automatically; a small ignore list is used for methods that are not useful in this SDK context (for example output file-name overrides). For complex native types that are not JS-safe, opaque numeric handles are used.

## License

This SDK bundles a WebAssembly build of JSBSim, which is licensed under the GNU Lesser General Public License v2.1 (LGPL-2.1). The WebAssembly bundle, and associated compatibility patches (`/patches`) are distributed under the terms of the LGPL-2.1.

This SDK itself, which provides a Javascript/Typescript wrapper around the JSBSim WASM module, is licensed under the MIT License.
