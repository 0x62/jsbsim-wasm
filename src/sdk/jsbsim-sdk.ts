import type { FGFDMExecApi } from "../generated/fgfdmexec-api";
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

export class JSBSimSdk {
  readonly module: JSBSimRuntimeModule;
  readonly exec: FGFDMExecApi;
  readonly vfs: WasmVfsManager;

  private constructor(module: JSBSimRuntimeModule, exec: FGFDMExecApi, vfs: WasmVfsManager) {
    this.module = module;
    this.exec = exec;
    this.vfs = vfs;
  }

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

  configurePaths(options: ConfigurePathsOptions = {}): void {
    const rootDir = options.rootDir ?? this.vfs.runtimeRoot;
    const aircraftPath = options.aircraftPath ?? "aircraft";
    const enginePath = options.enginePath ?? "engine";
    const systemsPath = options.systemsPath ?? "systems";
    const outputPath = options.outputPath ?? "output";

    this.exec.SetRootDir(rootDir);
    this.exec.SetAircraftPath(aircraftPath);
    this.exec.SetEnginePath(enginePath);
    this.exec.SetSystemsPath(systemsPath);
    this.exec.SetOutputPath(outputPath);
  }

  loadModel(model: string, options: LoadModelOptions = {}): boolean {
    const addModelToPath = options.addModelToPath ?? true;

    if (options.aircraftPath || options.enginePath || options.systemsPath) {
      return this.exec.LoadModel(
        options.aircraftPath ?? "aircraft",
        options.enginePath ?? "engine",
        options.systemsPath ?? "systems",
        model,
        addModelToPath
      );
    }

    return this.exec.LoadModel(model, addModelToPath);
  }

  loadScript(path: string, deltaT = 0, initFile = ""): boolean {
    return this.exec.LoadScript(path, deltaT, initFile);
  }

  run(): boolean {
    return this.exec.Run();
  }

  runIC(): boolean {
    return this.exec.RunIC();
  }

  setDeltaT(value: number): void {
    this.exec.Setdt(value);
  }

  getDeltaT(): number {
    return this.exec.GetDeltaT();
  }

  getSimTime(): number {
    return this.exec.GetSimTime();
  }

  setProperty(path: string, value: number): void {
    this.exec.SetPropertyValue(path, value);
  }

  getProperty(path: string): number {
    return this.exec.GetPropertyValue(path);
  }

  queryPropertyCatalog(check: string, endOfLine = "\n"): string {
    return this.exec.QueryPropertyCatalog(check, endOfLine);
  }

  forceOutput(index = 0): void {
    this.exec.ForceOutput(index);
  }

  writeDataFile(path: string, data: BinaryLike): string {
    return this.vfs.writeRuntimeFile(path, data);
  }

  readDataFile(path: string, encoding: "utf8" | "binary" = "utf8"): string | Uint8Array {
    return this.vfs.readRuntimeFile(path, encoding);
  }

  mkdir(path: string): string {
    return this.vfs.mkdirRuntime(path);
  }

  async syncFromPersistence(): Promise<void> {
    await this.vfs.syncFromPersistence();
  }

  async syncToPersistence(): Promise<void> {
    await this.vfs.syncToPersistence();
  }

  async enablePersistence(): Promise<void> {
    await this.vfs.enablePersistence();
  }

  destroy(): void {
    this.module.destroy?.(this.exec);
  }
}
