export type { FGFDMExecApi, OpaqueHandle } from "./generated/fgfdmexec-api";
export type {
  JSBSimModuleFactory,
  JSBSimRuntimeModule,
  JSBSimSdkOptions,
  LoadJSBSimModuleOptions,
  PersistenceOptions,
  JSBSimLogEntry,
  JSBSimLogHandler,
  JSBSimLogOptions,
  JSBSimLogStream
} from "./sdk/types";
export { loadJSBSimModule } from "./sdk/load-module";
export { JSBSimSdk } from "./sdk/jsbsim-sdk";
export type { ConfigurePathsOptions, LoadModelOptions } from "./sdk/jsbsim-sdk";
