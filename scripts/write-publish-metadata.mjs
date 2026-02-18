#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function run(command, cwd) {
  return execSync(command, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fileSha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function parseArgs(argv) {
  const out = {
    version: "",
    npmTag: "latest",
    output: "release/publish-metadata.json"
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--version") {
      out.version = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    if (arg === "--npm-tag") {
      out.npmTag = argv[i + 1] ?? "latest";
      i += 1;
      continue;
    }

    if (arg === "--output") {
      out.output = argv[i + 1] ?? out.output;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!out.version) {
    throw new Error("Missing required --version argument");
  }

  return out;
}

function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = parseArgs(process.argv.slice(2));
  const pkgPath = path.join(rootDir, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  const packageVersion = packageJson.version;
  if (packageVersion !== args.version) {
    throw new Error(`package.json version (${packageVersion}) does not match --version (${args.version})`);
  }

  const gitCommit = run("git rev-parse HEAD", rootDir);
  const gitShortCommit = run("git rev-parse --short HEAD", rootDir);
  const gitBranch = run("git branch --show-current", rootDir);
  const jsbsimCommit = run("git -C vendor/jsbsim rev-parse HEAD", rootDir);
  const jsbsimShortCommit = run("git -C vendor/jsbsim rev-parse --short HEAD", rootDir);
  const jsbsimDescribe = run("git -C vendor/jsbsim describe --tags --always", rootDir);

  const packJsonRaw = run("npm pack --json --dry-run", rootDir);
  const packEntries = JSON.parse(packJsonRaw);
  if (!Array.isArray(packEntries) || packEntries.length === 0) {
    throw new Error("npm pack --json --dry-run did not return package data");
  }

  const packEntry = packEntries[0];
  const files = Array.isArray(packEntry.files) ? packEntry.files : [];

  const artifactDigests = files.map((fileEntry) => {
    const relPath = fileEntry.path;
    const absPath = path.join(rootDir, relPath);
    const exists = fs.existsSync(absPath);
    return {
      path: relPath,
      size: Number(fileEntry.size) || 0,
      sha256: exists ? fileSha256(absPath) : null
    };
  });

  const metadata = {
    generatedAt: new Date().toISOString(),
    package: {
      name: packageJson.name,
      version: packageVersion,
      npmTag: args.npmTag,
      tarballName: packEntry.filename,
      unpackedSize: Number(packEntry.unpackedSize) || 0
    },
    release: {
      gitTag: `v${packageVersion}`,
      gitCommit,
      gitShortCommit,
      gitBranch
    },
    jsbsim: {
      submodulePath: "vendor/jsbsim",
      commit: jsbsimCommit,
      shortCommit: jsbsimShortCommit,
      describe: jsbsimDescribe
    },
    artifacts: artifactDigests
  };

  const outPath = path.join(rootDir, args.output);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  process.stdout.write(`Wrote publish metadata to ${path.relative(rootDir, outPath)}\n`);
}

main();
