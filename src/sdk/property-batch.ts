/**
 * Native `PropertyBatch` bound in `bindings/PropertyBatchBindings.cpp`.
 */
export interface NativePropertyBatch {
  add(path: string, create: boolean): number;
  has(index: number): boolean;
  size(): number;
  read(): void;
  write(): void;
  values(): Float64Array;
  get(index: number): number;
  set(index: number, value: number): void;
  delete(): void;
}

export interface PropertyBatchOptions {
  /** Create missing properties instead of reading them as `NaN`. Defaults to false. */
  create?: boolean;
}

/**
 * Reads or writes many JSBSim properties in one call.
 *
 * Paths are resolved to property nodes once, so each `read()` avoids a string
 * conversion and a property-tree path lookup per value. Create batches after
 * `loadModel()`; re-create them after loading a different model. Call
 * `dispose()` when finished to free the native object.
 */
export class PropertyBatch {
  /** Paths in slot order. */
  readonly paths: readonly string[];
  /** Paths that did not exist when the batch was created; they read as `NaN`. */
  readonly missing: readonly string[];
  private native: NativePropertyBatch | null;

  /** @internal Use `JSBSimSdk.createPropertyBatch()`. */
  constructor(native: NativePropertyBatch, paths: readonly string[], options: PropertyBatchOptions = {}) {
    const create = options.create ?? false;
    const missing: string[] = [];
    for (const path of paths) {
      const index = native.add(path, create);
      if (!native.has(index)) {
        missing.push(path);
      }
    }
    this.native = native;
    this.paths = Object.freeze([...paths]);
    this.missing = Object.freeze(missing);
  }

  get size(): number {
    return this.paths.length;
  }

  /**
   * Refreshes all values and returns them in slot order.
   *
   * The returned array is a view of wasm memory: use it before the next SDK
   * call, or pass `target` to copy the values into your own array.
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

  /**
   * Writes all values in slot order. Missing properties are skipped unless the
   * batch was created with `create: true`.
   */
  write(values: ArrayLike<number>): void {
    const native = this.requireNative();
    if (values.length !== this.paths.length) {
      throw new RangeError(`Expected ${this.paths.length} values, got ${values.length}.`);
    }
    native.values().set(values);
    native.write();
  }

  /** Reads one slot directly from the property tree. */
  get(index: number): number {
    return this.requireNative().get(index);
  }

  /** Writes one slot directly to the property tree. */
  set(index: number, value: number): void {
    this.requireNative().set(index, value);
  }

  /** Frees the native batch. Further use throws. */
  dispose(): void {
    this.native?.delete();
    this.native = null;
  }

  private requireNative(): NativePropertyBatch {
    if (!this.native) {
      throw new Error("PropertyBatch has been disposed.");
    }
    return this.native;
  }
}
