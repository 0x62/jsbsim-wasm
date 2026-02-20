import type { FGFDMExecApi } from "../generated/fgfdmexec-api";
import { JSBSimApi } from "../generated/jsbsim-api";
import type { BinaryLike, JSBSimRuntimeModule, JSBSimSdkOptions } from "./types";
import { loadJSBSimModule } from "./load-module";
import { WasmVfsManager } from "./vfs";

export interface ConfigurePathsOptions {
  rootDir?: string;
  aircraftPath?: string;
  enginePath?: string;
  systemsPath?: string;
  outputPath?: string;
}

export interface LoadModelOptions {
  aircraftPath?: string;
  enginePath?: string;
  systemsPath?: string;
  addModelToPath?: boolean;
}

const DEFAULT_RUNTIME_ROOT = "/runtime";
const DEFAULT_IDB_ROOT = "/persist";

export class JSBSimSdk extends JSBSimApi {
  readonly module: JSBSimRuntimeModule;
  readonly vfs: WasmVfsManager;

  private constructor(module: JSBSimRuntimeModule, exec: FGFDMExecApi, vfs: WasmVfsManager) {
    super(exec);
    this.module = module;
    this.vfs = vfs;
  }

  /**
   * Loads the JSBSim runtime module, creates `FGFDMExec`, and initializes VFS.
   */
  static async create(options: JSBSimSdkOptions = {}): Promise<JSBSimSdk> {
    const module = await loadJSBSimModule(options);
    const runtimeRoot = options.runtimeRoot ?? DEFAULT_RUNTIME_ROOT;
    const idbMountPath = options.persistence?.idbMountPath ?? DEFAULT_IDB_ROOT;

    const vfs = new WasmVfsManager(module, runtimeRoot, idbMountPath);
    if (options.persistence?.enabled) {
      await vfs.enablePersistence();
    }

    const exec = new module.FGFDMExec();
    const sdk = new JSBSimSdk(module, exec, vfs);
    sdk.configurePaths();
    return sdk;
  }

  /**
   * Sets standard JSBSim runtime directories on `FGFDMExec`.
   */
  configurePaths(options: ConfigurePathsOptions = {}): void {
    const rootDir = options.rootDir ?? this.vfs.runtimeRoot;
    const aircraftPath = options.aircraftPath ?? "aircraft";
    const enginePath = options.enginePath ?? "engine";
    const systemsPath = options.systemsPath ?? "systems";
    const outputPath = options.outputPath ?? "output";

    this.setRootDir(rootDir);
    this.setAircraftPath(aircraftPath);
    this.setEnginePath(enginePath);
    this.setSystemsPath(systemsPath);
    this.setOutputPath(outputPath);
  }

  /**
   * Loads an aircraft model using optional path overrides.
   */
  loadModelWithOptions(model: string, options: LoadModelOptions = {}): boolean {
    const addModelToPath = options.addModelToPath ?? true;

    if (options.aircraftPath || options.enginePath || options.systemsPath) {
      return this.loadModel(
        options.aircraftPath ?? "aircraft",
        options.enginePath ?? "engine",
        options.systemsPath ?? "systems",
        model,
        addModelToPath
      );
    }

    return this.loadModel(model, addModelToPath);
  }

  /**
   * Loads a script with JSBSim defaults for optional arguments.
   */
  loadScriptWithDefaults(path: string, deltaT = 0, initFile = ""): boolean {
    return this.loadScript(path, deltaT, initFile);
  }

  /**
   * Writes data to MEMFS (relative to runtime root) and returns resolved path.
   */
  writeDataFile(path: string, data: BinaryLike): string {
    return this.vfs.writeRuntimeFile(path, data);
  }

  /**
   * Reads data from MEMFS (relative to runtime root).
   */
  readDataFile(path: string, encoding: "utf8" | "binary" = "utf8"): string | Uint8Array {
    return this.vfs.readRuntimeFile(path, encoding);
  }

  /**
   * Creates a runtime directory and returns resolved path.
   */
  mkdir(path: string): string {
    return this.vfs.mkdirRuntime(path);
  }

  /**
   * Synchronizes IDBFS -> MEMFS when persistence is enabled.
   */
  async syncFromPersistence(): Promise<void> {
    await this.vfs.syncFromPersistence();
  }

  /**
   * Synchronizes MEMFS -> IDBFS when persistence is enabled.
   */
  async syncToPersistence(): Promise<void> {
    await this.vfs.syncToPersistence();
  }

  /**
   * Mounts IDBFS and performs an initial pull.
   */
  async enablePersistence(): Promise<void> {
    await this.vfs.enablePersistence();
  }

  /**
   * Destroys the underlying wasm-bound exec instance.
   */
  destroy(): void {
    this.module.destroy?.(this.exec);
  }
}
