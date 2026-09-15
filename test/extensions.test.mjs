// Requires a build: `npm run build:wasm && npm run build:sdk`, then `npm test`.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { GEAR_CONTACT_FIELDS, JSBSimSdk, PropertyBatch } from "../dist/index.js";
import { wasmBinaryUrl, wasmModuleUrl } from "../dist/wasm.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsbsimRoot = path.join(root, "vendor/jsbsim");

function copyTree(sdk, from, to) {
  for (const entry of readdirSync(from)) {
    const source = path.join(from, entry);
    const target = `${to}/${entry}`;
    if (statSync(source).isDirectory()) copyTree(sdk, source, target);
    else if (entry.endsWith(".xml")) sdk.writeDataFile(target, readFileSync(source, "utf8"));
  }
}

async function createC172() {
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl, log: { console: false } });
  copyTree(sdk, path.join(jsbsimRoot, "aircraft/c172p"), "aircraft/c172p");
  copyTree(sdk, path.join(jsbsimRoot, "engine"), "engine");
  copyTree(sdk, path.join(jsbsimRoot, "systems"), "systems");
  assert.equal(sdk.loadModel("c172p"), true);
  for (const [name, value] of Object.entries({
    "ic/h-agl-ft": 3, "ic/vc-kts": 50, "ic/theta-deg": 2, "ic/vd-fps": 1.5, "ic/lat-geod-deg": 34, "ic/long-gc-deg": -118,
  })) sdk.setPropertyValue(name, value);
  assert.equal(sdk.runIc(), true);
  return sdk;
}

const GEAR_PATHS = [0, 1, 2].flatMap(index => [
  `gear/unit[${index}]/WOW`, `gear/unit[${index}]/compression-ft`,
  `gear/unit[${index}]/compression-velocity-fps`, `gear/unit[${index}]/wheel-speed-fps`,
]);

describe("PropertyBatch", () => {
  let sdk;
  before(async () => { sdk = await createC172(); });
  after(() => sdk?.destroy());

  it("reads the same values as getPropertyValue, including tied getters, while the sim runs", () => {
    const paths = [...GEAR_PATHS, "velocities/u-fps", "position/h-agl-ft", "simulation/sim-time-sec"];
    const batch = sdk.createPropertyBatch(paths);
    assert.ok(batch instanceof PropertyBatch);
    assert.deepEqual(batch.missing, []);
    let sawContact = false;
    for (let step = 0; step < 240; step++) {
      assert.equal(sdk.run(), true);
      const values = batch.read();
      assert.equal(values.length, paths.length);
      paths.forEach((name, index) => assert.equal(values[index], sdk.getPropertyValue(name), name));
      sawContact ||= values[4] > 0.5;
    }
    assert.ok(sawContact, "the fixture must include gear contact");
    batch.dispose();
  });

  it("reports missing paths as NaN, and creates them only when asked", () => {
    const missing = sdk.createPropertyBatch(["velocities/u-fps", "does/not/exist"]);
    assert.deepEqual(missing.missing, ["does/not/exist"]);
    const values = missing.read();
    assert.ok(Number.isFinite(values[0]));
    assert.ok(Number.isNaN(values[1]));
    missing.write([values[0], 5]);
    assert.ok(Number.isNaN(missing.get(1)));
    missing.dispose();

    const created = sdk.createPropertyBatch(["tests/property-batch/value"], { create: true });
    assert.deepEqual(created.missing, []);
    created.write([42.5]);
    assert.equal(sdk.getPropertyValue("tests/property-batch/value"), 42.5);
    created.dispose();
  });

  it("writes all slots, or one slot, into the property tree", () => {
    const batch = sdk.createPropertyBatch(["fcs/throttle-cmd-norm[0]", "fcs/left-brake-cmd-norm"]);
    batch.write(new Float64Array([0.25, 0.5]));
    assert.equal(sdk.getPropertyValue("fcs/throttle-cmd-norm[0]"), 0.25);
    assert.equal(sdk.getPropertyValue("fcs/left-brake-cmd-norm"), 0.5);
    batch.set(1, 0.75);
    assert.equal(sdk.getPropertyValue("fcs/left-brake-cmd-norm"), 0.75);
    assert.equal(batch.get(0), 0.25);
    assert.throws(() => batch.write([1]), RangeError);
    batch.dispose();
  });

  it("copies into a caller array, stays valid after wasm memory growth, and refuses use after dispose", () => {
    const batch = sdk.createPropertyBatch(["velocities/u-fps", "attitude/theta-rad"]);
    const target = new Float64Array(2);
    assert.equal(batch.read(target), target);
    assert.equal(target[0], sdk.getPropertyValue("velocities/u-fps"));
    assert.throws(() => batch.read(new Float64Array(3)), RangeError);
    // Force the wasm heap to grow; every read takes a fresh view.
    sdk.writeDataFile("tests/grow.bin", new Uint8Array(64 * 1024 * 1024));
    assert.equal(sdk.run(), true);
    assert.equal(batch.read()[1], sdk.getPropertyValue("attitude/theta-rad"));
    batch.dispose();
    assert.throws(() => batch.read(), /disposed/);
    batch.dispose();
  });
});

describe("GearContactReader", () => {
  it("matches JSBSim's own gear properties and sums to its total gear force", async () => {
    const sdk = await createC172();
    try {
      const reader = sdk.createGearContactReader();
      assert.equal(reader.stride, GEAR_CONTACT_FIELDS.length);
      const field = name => GEAR_CONTACT_FIELDS.indexOf(name);
      let grounded = 0;
      for (let step = 0; step < 360; step++) {
        assert.equal(sdk.run(), true);
        const values = reader.read();
        const units = reader.count;
        assert.equal(values.length, units * reader.stride);
        const total = { x: 0, y: 0, z: 0 };
        for (let unit = 0; unit < units; unit++) {
          const at = name => values[unit * reader.stride + field(name)];
          const property = name => sdk.getPropertyValue(`gear/unit[${unit}]/${name}`);
          assert.equal(at("wow"), property("WOW"));
          assert.equal(at("compressionFt"), property("compression-ft"));
          assert.equal(at("compressionVelocityFps"), property("compression-velocity-fps"));
          if (at("isBogey") === 1) {
            assert.equal(at("wheelRollVelocityFps"), property("wheel-speed-fps"));
            assert.equal(at("slipAngleDeg"), property("slip-angle-deg"));
          }
          if (at("wow") === 1) {
            grounded += 1;
            // JSBSim's sign convention: a supporting strut pushes with negative force.
            assert.ok(at("strutForceLbs") < 0);
          }
          total.x += at("bodyForceXLbs");
          total.y += at("bodyForceYLbs");
          total.z += at("bodyForceZLbs");
        }
        const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
        assert.ok(close(total.x, sdk.getPropertyValue("forces/fbx-gear-lbs")), `fbx at step ${step}`);
        assert.ok(close(total.y, sdk.getPropertyValue("forces/fby-gear-lbs")), `fby at step ${step}`);
        assert.ok(close(total.z, sdk.getPropertyValue("forces/fbz-gear-lbs")), `fbz at step ${step}`);
      }
      assert.ok(grounded > 0, "the fixture must include gear contact");
      const nose = reader.readUnit(0);
      assert.equal(typeof nose.strutForceLbs, "number");
      assert.throws(() => reader.readUnit(99), RangeError);
      reader.dispose();
      assert.throws(() => reader.read(), /disposed/);
    } finally { sdk.destroy(); }
  });

  it("never changes the simulation it reads", async () => {
    const trajectory = async (withReader) => {
      const sdk = await createC172();
      const reader = withReader ? sdk.createGearContactReader() : null;
      const samples = [];
      for (let step = 0; step < 480; step++) {
        sdk.run();
        reader?.read();
        reader?.readUnit(1);
        if (step % 20 === 0) samples.push(["position/h-agl-ft", "velocities/u-fps", "velocities/q-rad_sec"].map(name => sdk.getPropertyValue(name)));
      }
      sdk.destroy(); // Also detaches the reader.
      if (reader) assert.throws(() => reader.read(), /disposed/);
      return samples;
    };
    assert.deepEqual(await trajectory(true), await trajectory(false));
  });
});
