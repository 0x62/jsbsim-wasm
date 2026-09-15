/**
 * Field order of one gear record, matching `bindings/GearContactBindings.cpp`.
 * Units are JSBSim's: ft, ft/s, lbf, deg. Body axes are relative to the CG.
 * Signs follow JSBSim: `strutForceLbs` is negative while the strut supports
 * the aircraft, and the body forces sum to `forces/fb{x,y,z}-gear-lbs`.
 */
export const GEAR_CONTACT_FIELDS = [
  "wow",
  "compressionFt",
  "compressionVelocityFps",
  "strutForceLbs",
  "bodyXFt",
  "bodyYFt",
  "bodyZFt",
  "wheelRollVelocityFps",
  "wheelSideVelocityFps",
  "slipAngleDeg",
  "steerAngleDeg",
  "wheelRollForceLbs",
  "wheelSideForceLbs",
  "bodyForceXLbs",
  "bodyForceYLbs",
  "bodyForceZLbs",
  "isBogey",
  "gearPos",
] as const;

export type GearContactField = (typeof GEAR_CONTACT_FIELDS)[number];

/** One gear unit as plain numbers; `wow` and `isBogey` are 0 or 1. */
export type GearContact = Record<GearContactField, number>;

/** Native `GearContacts` bound in `bindings/GearContactBindings.cpp`. */
export interface NativeGearContacts {
  fields(): number;
  count(): number;
  read(): number;
  values(): Float64Array;
  detach(): void;
  delete(): void;
}

/**
 * Read-only per-gear contact state after the last `run()`: weight on wheels,
 * strut compression and load, contact-point velocity in the wheel frame, and
 * the reaction forces JSBSim applied. Reading never changes the simulation.
 */
export class GearContactReader {
  /** Values per gear unit in `read()` output. */
  readonly stride = GEAR_CONTACT_FIELDS.length;
  private native: NativeGearContacts | null;
  private readonly onDispose: () => void;

  /** @internal Use `JSBSimSdk.createGearContactReader()`. */
  constructor(native: NativeGearContacts, onDispose: () => void) {
    if (native.fields() !== GEAR_CONTACT_FIELDS.length) {
      native.delete();
      throw new Error(`GearContacts field count mismatch: wasm has ${native.fields()}, SDK expects ${GEAR_CONTACT_FIELDS.length}.`);
    }
    this.native = native;
    this.onDispose = onDispose;
  }

  /** Number of gear/contact units in the loaded model. */
  get count(): number {
    return this.requireNative().count();
  }

  /**
   * Snapshot of all units, `stride` values each, in `GEAR_CONTACT_FIELDS`
   * order. The array views wasm memory: use it before the next SDK call, or
   * pass `target` (length `count * stride`) to copy.
   */
  read(target?: Float64Array): Float64Array {
    const native = this.requireNative();
    native.read();
    const values = native.values();
    if (!target) {
      return values;
    }
    if (target.length !== values.length) {
      throw new RangeError(`Expected a target of length ${values.length}, got ${target.length}.`);
    }
    target.set(values);
    return target;
  }

  /** Convenience: one unit as a named record (allocates; prefer `read()` per step). */
  readUnit(index: number): GearContact {
    const values = this.read();
    if (!Number.isInteger(index) || index < 0 || (index + 1) * this.stride > values.length) {
      throw new RangeError(`No gear unit ${index}.`);
    }
    const base = index * this.stride;
    return Object.fromEntries(GEAR_CONTACT_FIELDS.map((field, offset) => [field, values[base + offset]])) as GearContact;
  }

  /** Frees the native reader. Further use throws. */
  dispose(): void {
    if (!this.native) {
      return;
    }
    this.native.delete();
    this.native = null;
    this.onDispose();
  }

  /** @internal Called by `JSBSimSdk.destroy()` before the exec is freed. */
  detach(): void {
    this.native?.detach();
    this.dispose();
  }

  private requireNative(): NativeGearContacts {
    if (!this.native) {
      throw new Error("GearContactReader has been disposed.");
    }
    return this.native;
  }
}
