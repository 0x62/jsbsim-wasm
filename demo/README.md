# JSBSim WASM Demo SPA

This demo is a lightweight React + Vite app that boots a preloaded hobby-rocket scenario.

## Run

From repo root:

```bash
npm run demo:install
npm run build:wasm
npm run demo:sync-assets
npm run demo:dev
```

Then open the Vite URL. The app preloads a rocket model and launch script. Press `Launch` to ignite and track the full up/down flight profile.

## What it shows

- WASM module load (`jsbsim_wasm.mjs` + `jsbsim_wasm.wasm`)
- Preloaded hobby rocket model + script
- Launch / pause-resume / reload controls
- Flight stage widget (launch, burnout, coast, apogee, descent, landing)
- Live telemetry cards and `recharts` streams (altitude, vertical velocity, vertical acceleration)
