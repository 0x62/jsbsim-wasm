# JSBSim WASM Tooling + TypeScript SDK

This repository builds [JSBSim](https://github.com/JSBSim-Team/jsbsim) to WebAssembly for Node.js and browsers, and ships a TypeScript SDK for loading and interacting with `FGFDMExec`.

> [!WARNING]  
> This toolkit is still in early development and may contain bugs or unexpected behavior. Use at your own risk.

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

## SDK Example

```ts
import { JSBSimSdk } from "@0x62/jsbsim-wasm";

const sdk = await JSBSimSdk.create({
  moduleUrl: new URL("./dist/wasm/jsbsim_wasm.mjs", import.meta.url),
  wasmUrl: new URL("./dist/wasm/jsbsim_wasm.wasm", import.meta.url),
  persistence: { enabled: true },
  log: {
    console: true,           // Also output to console
    stripAnsi: true,         // Remove escape sequences from log output
    onStdout: (entry) => {}, // optional hook for JSBSim stdout
    onStderr: (entry) => {}  // optional hook for JSBSim stderr
  }
});

// Write model/config files into VFS
sdk.writeDataFile("aircraft/c172/c172.xml", xmlText);

sdk.configurePaths({
  rootDir: "/runtime",
  aircraftPath: "aircraft",
  enginePath: "engine",
  systemsPath: "systems"
});

sdk.loadModel("c172");
sdk.runIC();
sdk.run();

const altitude = sdk.getProperty("position/h-sl-ft");

// Persist runtime tree to IDBFS when needed
await sdk.syncToPersistence();
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

`.github/workflows/update-jsbsim.yml` runs weekly and on manual trigger, rebuilds artifacts, and opens/updates a PR.

## Release Workflow

Run a release preparation with:

```bash
./scripts/release.sh 0.2.0
```

What it does by default:

1. Updates `package.json` / `package-lock.json` version.
2. Runs `npm run build`.
3. Generates `release/publish-metadata.json`.
4. Creates a release commit.
5. Creates an annotated tag `v<version>`.

Useful flags:

- `--skip-build`
- `--skip-commit`
- `--skip-tag`
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

The generated bridge exports all parsed public methods on `FGFDMExec` automatically. For complex native types that are not JS-safe, opaque numeric handles are used.

## License

This SDK bundles a WebAssembly build of JSBSim, which is licensed under the GNU Lesser General Public License v2.1 (LGPL-2.1). The WebAssembly bundle, and associated compatibility patches (`/patches`) are distributed under the terms of the LGPL-2.1.

This SDK itself, which provides a Javascript/Typescript wrapper around the JSBSim WASM module, is licensed under the MIT License.
