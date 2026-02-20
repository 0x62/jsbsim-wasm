import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
export const JSBSIM_SRC_DIR = path.join(ROOT_DIR, "vendor/jsbsim/src");

export const CLASS_NAME = "FGFDMExec";

export const HEADER_PATH = path.join(JSBSIM_SRC_DIR, `${CLASS_NAME}.h`);
export const IMPLEMENTATION_PATH = path.join(JSBSIM_SRC_DIR, `${CLASS_NAME}.cpp`);

export const CPP_OUT_PATH = path.join(ROOT_DIR, "generated/FGFDMExecBindings.cpp");
export const TS_OUT_PATH = path.join(ROOT_DIR, "src/generated/fgfdmexec-api.ts");
export const SDK_API_OUT_PATH = path.join(ROOT_DIR, "src/generated/jsbsim-api.ts");

export const AST_TMP_PREFIX = "jsbsim-bindgen-";
