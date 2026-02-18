#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HEADER_PATH = path.join(ROOT_DIR, "vendor/jsbsim/src/FGFDMExec.h");
const CPP_OUT_PATH = path.join(ROOT_DIR, "generated/FGFDMExecBindings.cpp");
const TS_OUT_PATH = path.join(ROOT_DIR, "src/generated/fgfdmexec-api.ts");

const CLASS_NAME = "FGFDMExec";

const NUMERIC_TYPES = new Set([
  "char",
  "signed char",
  "unsigned char",
  "short",
  "unsigned short",
  "int",
  "unsigned int",
  "long",
  "unsigned long",
  "long long",
  "unsigned long long",
  "float",
  "double",
  "long double",
  "size_t"
]);

const CXX_PASSTHROUGH_TOKENS = new Set([
  "const",
  "volatile",
  "unsigned",
  "signed",
  "short",
  "long",
  "int",
  "float",
  "double",
  "char",
  "bool",
  "void",
  "size_t",
  "std",
  "string",
  "vector",
  "shared_ptr",
  "unique_ptr",
  "uintptr_t",
  CLASS_NAME,
  "SGPath"
]);

function stripComments(src) {
  let out = "";
  let i = 0;
  let state = "code";
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (state === "code") {
      if (c === '"') {
        state = "string";
        out += c;
        i += 1;
      } else if (c === "'") {
        state = "char";
        out += c;
        i += 1;
      } else if (c === "/" && n === "/") {
        state = "line_comment";
        i += 2;
      } else if (c === "/" && n === "*") {
        state = "block_comment";
        i += 2;
      } else {
        out += c;
        i += 1;
      }
    } else if (state === "line_comment") {
      if (c === "\n") {
        out += "\n";
        state = "code";
      }
      i += 1;
    } else if (state === "block_comment") {
      if (c === "*" && n === "/") {
        state = "code";
        i += 2;
      } else {
        if (c === "\n") out += "\n";
        i += 1;
      }
    } else if (state === "string") {
      out += c;
      if (c === "\\") {
        out += n || "";
        i += 2;
      } else {
        if (c === '"') state = "code";
        i += 1;
      }
    } else {
      out += c;
      if (c === "\\") {
        out += n || "";
        i += 2;
      } else {
        if (c === "'") state = "code";
        i += 1;
      }
    }
  }
  return out;
}

function findClassBody(src, className) {
  const classIdx = src.indexOf(`class JSBSIM_API ${className}`);
  if (classIdx < 0) {
    throw new Error(`Could not find class ${className} in ${HEADER_PATH}`);
  }

  const openBrace = src.indexOf("{", classIdx);
  if (openBrace < 0) {
    throw new Error(`Could not locate opening brace for ${className}`);
  }

  let depth = 0;
  for (let i = openBrace; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return src.slice(openBrace + 1, i);
      }
    }
  }

  throw new Error(`Could not locate closing brace for ${className}`);
}

function collectPublicStatements(classBody) {
  const statements = [];
  let access = "private";
  let depth = 1;
  let parenDepth = 0;
  let collecting = false;
  let inMethodBody = false;
  let statement = "";

  const flush = () => {
    const trimmed = statement.trim();
    if (trimmed) {
      statements.push(trimmed);
    }
    statement = "";
    collecting = false;
    inMethodBody = false;
  };

  for (let i = 0; i < classBody.length; i++) {
    const ch = classBody[i];

    if (depth === 1) {
      if (classBody.startsWith("public:", i)) {
        access = "public";
        if (collecting) flush();
        i += "public:".length - 1;
        continue;
      }
      if (classBody.startsWith("private:", i)) {
        access = "private";
        if (collecting) flush();
        i += "private:".length - 1;
        continue;
      }
      if (classBody.startsWith("protected:", i)) {
        access = "protected";
        if (collecting) flush();
        i += "protected:".length - 1;
        continue;
      }
    }

    if (access === "public") {
      if (!collecting) {
        if (!/\s/.test(ch)) {
          collecting = true;
          statement += ch;
        }
      } else {
        statement += ch;
      }
    }

    if (ch === "(") parenDepth += 1;
    if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);

    if (ch === "{") {
      if (depth === 1 && collecting && statement.includes("(") && !statement.trimStart().startsWith("enum") && !statement.trimStart().startsWith("struct")) {
        inMethodBody = true;
      }
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 1 && collecting && inMethodBody) {
        flush();
      }
    }

    if (ch === ";" && depth === 1 && parenDepth === 0 && collecting && !inMethodBody) {
      flush();
    }
  }

  return statements;
}

function splitTopLevel(value, delimiter) {
  const parts = [];
  let current = "";
  let paren = 0;
  let angle = 0;
  let brace = 0;
  let bracket = 0;
  let inString = false;
  let quote = "";

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    const next = value[i + 1];

    if (inString) {
      current += ch;
      if (ch === "\\") {
        current += next || "";
        i += 1;
      } else if (ch === quote) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === "(") paren += 1;
    if (ch === ")") paren = Math.max(0, paren - 1);
    if (ch === "<") angle += 1;
    if (ch === ">") angle = Math.max(0, angle - 1);
    if (ch === "{") brace += 1;
    if (ch === "}") brace = Math.max(0, brace - 1);
    if (ch === "[") bracket += 1;
    if (ch === "]") bracket = Math.max(0, bracket - 1);

    if (ch === delimiter && paren === 0 && angle === 0 && brace === 0 && bracket === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  parts.push(current);
  return parts;
}

function stripTrailingName(paramTypeWithName) {
  const value = paramTypeWithName.trim();
  const match = value.match(/^(.*?)(?:\s+([A-Za-z_][A-Za-z0-9_]*))$/);
  if (!match) {
    return value;
  }

  const [, maybeType, maybeName] = match;
  const keepAsType = new Set(["int", "double", "float", "bool", "void", "size_t"]);

  if (!maybeType || keepAsType.has(value)) {
    return value;
  }

  if (!maybeName) {
    return value;
  }

  return maybeType.trim();
}

function normalizeType(type) {
  return type
    .replace(/\s+/g, " ")
    .replace(/\s*([*&<>,])\s*/g, "$1")
    .replace(/\bconst\b\s*/g, "const ")
    .trim();
}

function parseParams(paramString) {
  const trimmed = paramString.trim();
  if (!trimmed || trimmed === "void") {
    return [];
  }

  const rawParams = splitTopLevel(trimmed, ",").map((item) => item.trim()).filter(Boolean);
  return rawParams.map((rawParam, index) => {
    const noDefault = splitTopLevel(rawParam, "=")[0].trim();
    const type = normalizeType(stripTrailingName(noDefault));
    return {
      raw: rawParam,
      type,
      name: `arg${index}`
    };
  });
}

function parseMethod(statement) {
  if (!statement.includes("(")) {
    return null;
  }

  const compact = statement.replace(/\s+/g, " ").trim();
  const signatureOnly = compact.replace(/\{.*$/s, "").replace(/;$/, "").trim();

  if (!signatureOnly.includes("(")) {
    return null;
  }

  const openParen = signatureOnly.indexOf("(");
  let depth = 0;
  let closeParen = -1;
  for (let i = openParen; i < signatureOnly.length; i++) {
    const ch = signatureOnly[i];
    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        closeParen = i;
        break;
      }
    }
  }

  if (closeParen < 0) {
    return null;
  }

  const before = signatureOnly.slice(0, openParen).trim();
  const params = signatureOnly.slice(openParen + 1, closeParen);
  const after = signatureOnly.slice(closeParen + 1).trim();

  if (/^(if|for|while|switch)\b/.test(before)) {
    return null;
  }

  const beforeParts = before.split(/\s+/);
  const name = beforeParts[beforeParts.length - 1];
  const returnType = normalizeType(before.slice(0, before.length - name.length).trim());
  const isConst = /(^|\s)const(\s|$)/.test(after);

  return {
    name,
    returnType,
    params: parseParams(params),
    isConst,
    signature: signatureOnly
  };
}

function getMethods(classBody) {
  const statements = collectPublicStatements(classBody);
  return statements
    .map(parseMethod)
    .filter((method) => method)
    .filter((method) => method.name !== CLASS_NAME && method.name !== `~${CLASS_NAME}` && method.returnType !== "")
    .filter((method) => !method.signature.startsWith("enum "));
}

function stripConstVolatile(type) {
  return type.replace(/\b(const|volatile)\b/g, "").replace(/\s+/g, " ").trim();
}

function isBoolType(type) {
  return stripConstVolatile(type).replace(/[&*]/g, "").trim() === "bool";
}

function isStringType(type) {
  const normalized = stripConstVolatile(type).replace(/[&*]/g, "").trim();
  return normalized === "std::string";
}

function isSGPathType(type) {
  const normalized = stripConstVolatile(type).replace(/[&*]/g, "").trim();
  return normalized === "SGPath";
}

function isVectorOfStringType(type) {
  const normalized = stripConstVolatile(type).replace(/[&*]/g, "").replace(/\s+/g, "").trim();
  return normalized === "std::vector<std::string>";
}

function isNumericType(type) {
  const normalized = stripConstVolatile(type).replace(/[&*]/g, "").replace(/\s+/g, " ").trim();
  return NUMERIC_TYPES.has(normalized);
}

function isPointerType(type) {
  return /\*/.test(type);
}

function isReferenceType(type) {
  return /&/.test(type);
}

function baseTypeForPointerCast(type) {
  return normalizeType(type.replace(/[&*]/g, "").trim());
}

function qualifyCppType(type) {
  const withoutStructClass = type.replace(/\b(struct|class)\s+/g, "");
  return withoutStructClass.replace(/\b([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)\b/g, (token) => {
    if (token.includes("::")) {
      return token;
    }

    if (CXX_PASSTHROUGH_TOKENS.has(token) || NUMERIC_TYPES.has(token)) {
      return token;
    }

    if (token === "PropertyCatalogStructure") {
      return `${CLASS_NAME}::PropertyCatalogStructure`;
    }

    return `JSBSim::${token}`;
  });
}

function toCppParamType(paramType) {
  if (isBoolType(paramType)) return "bool";
  if (isNumericType(paramType)) return stripConstVolatile(paramType).replace(/[&*]/g, "").trim();
  if (isStringType(paramType) || isSGPathType(paramType)) return "const std::string&";
  return "uintptr_t";
}

function convertCppArg(paramType, argName) {
  if (isBoolType(paramType) || isNumericType(paramType) || isStringType(paramType)) {
    return argName;
  }

  if (isSGPathType(paramType)) {
    return `SGPath(${argName})`;
  }

  if (isPointerType(paramType)) {
    const castType = qualifyCppType(normalizeType(paramType));
    return `reinterpret_cast<${castType}>(${argName})`;
  }

  if (isReferenceType(paramType)) {
    const baseType = qualifyCppType(baseTypeForPointerCast(paramType));
    if (/\bconst\b/.test(paramType)) {
      return `*reinterpret_cast<const ${baseType}*>(${argName})`;
    }
    return `*reinterpret_cast<${baseType}*>(${argName})`;
  }

  const baseType = qualifyCppType(baseTypeForPointerCast(paramType));
  return `*reinterpret_cast<${baseType}*>(${argName})`;
}

function toTsType(type, { isReturn = false } = {}) {
  const normalized = normalizeType(type);
  if (normalized === "void") return "void";
  if (isBoolType(normalized)) return "boolean";
  if (isNumericType(normalized)) return "number";
  if (isStringType(normalized) || isSGPathType(normalized)) return "string";
  if (isReturn && isVectorOfStringType(normalized)) return "string[]";
  return "number";
}

function renderWrapperFunctions(methods) {
  return methods
    .map((method, methodIndex) => {
      const wrapperName = `wrap_${CLASS_NAME}_${method.name}_${methodIndex}`;
      const params = method.params
        .map((param) => `${toCppParamType(param.type)} ${param.name}`)
        .join(", ");

      const convertedArgs = method.params.map((param) => convertCppArg(param.type, param.name)).join(", ");
      const invoke = `self.${method.name}(${convertedArgs})`;
      const returnType = method.returnType === "void" ? "void" : "auto";

      const callLine = method.returnType === "void"
        ? `  ${invoke};`
        : `  return toJsValue(${invoke});`;

      return `static ${returnType} ${wrapperName}(FGFDMExec& self${params ? `, ${params}` : ""}) {\n${callLine}\n}`;
    })
    .join("\n\n");
}

function renderBindingRegistration(methods) {
  const lines = [
    "EMSCRIPTEN_BINDINGS(jsbsim_fgfmdexec_bindings) {",
    "  emscripten::class_<FGFDMExec>(\"FGFDMExec\")",
    "    .constructor<>()"
  ];

  methods.forEach((method, methodIndex) => {
    const wrapperName = `wrap_${CLASS_NAME}_${method.name}_${methodIndex}`;
    lines.push(`    .function(\"${method.name}\", &${wrapperName})`);
  });

  lines[lines.length - 1] += ";";
  lines.push("}");
  return lines.join("\n");
}

function renderCppOutput(methods, sourceHeaderRelPath) {
  const wrappers = renderWrapperFunctions(methods);
  const bindings = renderBindingRegistration(methods);

  return `// Generated by scripts/generate-fgfdmexec-bindings.mjs.\n// Do not edit manually.\n\n#include <cstdint>\n#include <memory>\n#include <string>\n#include <type_traits>\n#include <vector>\n\n#include <emscripten/bind.h>\n#include <emscripten/val.h>\n\n#include \"${sourceHeaderRelPath}\"\n\nnamespace {\n\nusing JSBSim::FGFDMExec;\nusing ::SGPath;\n\ntemplate <typename T>\nstd::enable_if_t<std::is_arithmetic_v<T>, T> toJsValue(T value) {\n  return value;\n}\n\ninline std::string toJsValue(const std::string& value) {\n  return value;\n}\n\ninline std::string toJsValue(std::string&& value) {\n  return std::move(value);\n}\n\ninline std::string toJsValue(const SGPath& path) {\n  return path.utf8Str();\n}\n\ninline emscripten::val toJsValue(const std::vector<std::string>& values) {\n  emscripten::val out = emscripten::val::array();\n  for (std::size_t i = 0; i < values.size(); ++i) {\n    out.set(i, values[i]);\n  }\n  return out;\n}\n\ninline emscripten::val toJsValue(std::vector<std::string>& values) {\n  return toJsValue(static_cast<const std::vector<std::string>&>(values));\n}\n\ntemplate <typename T>\nuintptr_t toJsValue(T* value) {\n  return reinterpret_cast<uintptr_t>(value);\n}\n\ntemplate <typename T>\nuintptr_t toJsValue(const std::shared_ptr<T>& value) {\n  return reinterpret_cast<uintptr_t>(value.get());\n}\n\ntemplate <typename T>\nuintptr_t toJsValue(const std::unique_ptr<T>& value) {\n  return reinterpret_cast<uintptr_t>(value.get());\n}\n\ntemplate <typename T>\nuintptr_t toJsValue(T& value) {\n  return reinterpret_cast<uintptr_t>(&value);\n}\n\n${wrappers}\n\n}  // namespace\n\n${bindings}\n`;
}

function renderTsInterface(methods) {
  const lines = [
    "// Generated by scripts/generate-fgfdmexec-bindings.mjs.",
    "// Do not edit manually.",
    "",
    "export type OpaqueHandle = number;",
    "",
    "export interface FGFDMExecApi {"
  ];

  for (const method of methods) {
    const params = method.params
      .map((param, index) => `arg${index}: ${toTsType(param.type)}`)
      .join(", ");
    const returnType = toTsType(method.returnType, { isReturn: true });
    lines.push(`  ${method.name}(${params}): ${returnType};`);
  }

  lines.push("}", "");
  return lines.join("\n");
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function main() {
  if (!fs.existsSync(HEADER_PATH)) {
    throw new Error(`Missing JSBSim header: ${HEADER_PATH}. Run scripts/prepare-jsbsim.sh first.`);
  }

  const rawHeader = fs.readFileSync(HEADER_PATH, "utf8");
  const noComments = stripComments(rawHeader);
  const classBody = findClassBody(noComments, CLASS_NAME);
  const methods = getMethods(classBody);

  const cppOut = renderCppOutput(methods, "FGFDMExec.h");
  const tsOut = renderTsInterface(methods);

  ensureParentDir(CPP_OUT_PATH);
  ensureParentDir(TS_OUT_PATH);

  fs.writeFileSync(CPP_OUT_PATH, cppOut, "utf8");
  fs.writeFileSync(TS_OUT_PATH, tsOut, "utf8");

  process.stdout.write(`Generated ${methods.length} method bindings.\n`);
  process.stdout.write(`- ${path.relative(ROOT_DIR, CPP_OUT_PATH)}\n`);
  process.stdout.write(`- ${path.relative(ROOT_DIR, TS_OUT_PATH)}\n`);
}

main();
