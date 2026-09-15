// Compares per-call getPropertyValue with PropertyBatch.read() on the C172.
// Requires a build: `npm run build:wasm && npm run build:sdk`, then
// `node bench/property-batch.mjs`.
import os from "node:os";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSBSimSdk } from "../dist/index.js";
import { wasmBinaryUrl, wasmModuleUrl } from "../dist/wasm.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const copyTree = (sdk, from, to) => {
  for (const entry of readdirSync(from)) {
    const source = path.join(from, entry);
    if (statSync(source).isDirectory()) copyTree(sdk, source, `${to}/${entry}`);
    else if (entry.endsWith(".xml")) sdk.writeDataFile(`${to}/${entry}`, readFileSync(source, "utf8"));
  }
};

const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl, log: { console: false } });
for (const dir of ["aircraft/c172p", "engine", "systems"]) copyTree(sdk, path.join(root, "vendor/jsbsim", dir), dir);
sdk.loadModel("c172p");
sdk.setPropertyValue("ic/h-agl-ft", 3);
sdk.setPropertyValue("ic/vc-kts", 50);
sdk.runIc();
for (let i = 0; i < 240; i++) sdk.run();

const counts = [5, 15, 60];
const paths = Array.from({ length: 60 }, (_, i) => {
  const gear = i % 3;
  return [`gear/unit[${gear}]/WOW`, `gear/unit[${gear}]/compression-ft`, `gear/unit[${gear}]/compression-velocity-fps`,
    `gear/unit[${gear}]/wheel-speed-fps`, `velocities/u-fps`][Math.floor(i / 3) % 5];
});
const results = [];
let sink = 0;
for (const count of counts) {
  const names = paths.slice(0, count);
  const batch = sdk.createPropertyBatch(names);
  const perCall = n => { for (let r = 0; r < n; r++) for (const name of names) sink += sdk.getPropertyValue(name); };
  const batched = n => { for (let r = 0; r < n; r++) { const v = batch.read(); for (let i = 0; i < v.length; i++) sink += v[i]; } };
  const time = (fn, n) => { const start = performance.now(); fn(n); return (performance.now() - start) * 1000 / n; };
  for (const fn of [perCall, batched]) fn(20_000);
  const samples = { perCall: [], batched: [] };
  for (let round = 0; round < 11; round++) {
    samples.perCall.push(time(perCall, 20_000));
    samples.batched.push(time(batched, 20_000));
  }
  const median = values => values.sort((a, b) => a - b)[5];
  results.push({ properties: count, "getPropertyValue µs": median(samples.perCall).toFixed(3),
    "batch.read µs": median(samples.batched).toFixed(3),
    speedup: (median(samples.perCall) / median(samples.batched)).toFixed(1) + "×" });
  batch.dispose();
}
const reader = sdk.createGearContactReader();
const gearTime = n => { const start = performance.now(); for (let r = 0; r < n; r++) sink += reader.read()[0]; return (performance.now() - start) * 1000 / n; };
gearTime(20_000);
const gearSamples = Array.from({ length: 11 }, () => gearTime(20_000)).sort((a, b) => a - b);
const gearUnits = reader.count;
reader.dispose();

console.log(`${os.cpus()[0]?.model} · ${os.platform()} ${os.arch()} · Node ${process.version}`);
console.table(results);
console.log(`GearContactReader.read(): ${gearSamples[5].toFixed(3)} µs for all ${gearUnits} contact units (${reader.stride} fields each)`);
if (!Number.isFinite(sink)) throw new Error("unexpected non-finite sum");
sdk.destroy();
