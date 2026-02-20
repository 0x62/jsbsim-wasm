#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function run(command, args, cwd, { allowFailure = false } = {}) {
  try {
    return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    if (allowFailure) {
      return "";
    }

    const stderr = error?.stderr?.toString?.().trim?.() ?? "";
    const detail = stderr ? `: ${stderr}` : "";
    throw new Error(`${command} ${args.join(" ")} failed${detail}`);
  }
}

function parseArgs(argv) {
  const options = {
    jsbsimTag: "",
    packageName: "",
    beta: null,
    format: "json"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--jsbsim-tag") {
      options.jsbsimTag = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--package-name") {
      options.packageName = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--beta") {
      const raw = argv[index + 1] ?? "";
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`Invalid --beta value: ${raw}`);
      }
      options.beta = parsed;
      index += 1;
      continue;
    }

    if (arg === "--format") {
      const format = argv[index + 1] ?? "";
      if (format !== "json" && format !== "env") {
        throw new Error(`Invalid --format value: ${format}`);
      }
      options.format = format;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function parseStableTag(tag) {
  const match = tag.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }

  const [, major, minor, patch] = match;
  const version = `${major}.${minor}.${patch}`;

  return {
    tag: `v${version}`,
    version,
    parts: [Number.parseInt(major, 10), Number.parseInt(minor, 10), Number.parseInt(patch, 10)]
  };
}

function compareParts(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const diff = left[index] - right[index];
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function pickLatestStableTag(jsbsimDir) {
  const raw = run("git", ["-C", jsbsimDir, "tag", "--list", "v*"], jsbsimDir);
  const tags = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseStableTag)
    .filter((value) => value !== null);

  if (tags.length === 0) {
    throw new Error("Could not find any stable JSBSim tags matching v<major>.<minor>.<patch>.");
  }

  tags.sort((left, right) => compareParts(left.parts, right.parts));
  return tags.at(-1);
}

function assertTagExists(jsbsimDir, tag) {
  const exists = run("git", ["-C", jsbsimDir, "rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{}`], jsbsimDir, {
    allowFailure: true
  });

  if (!exists) {
    throw new Error(`JSBSim tag does not exist locally: ${tag}. Fetch tags first.`);
  }
}

function getPublishedVersions(rootDir, packageName) {
  const raw = run("npm", ["view", packageName, "versions", "--json"], rootDir, { allowFailure: true });
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((value) => typeof value === "string");
    }

    if (typeof parsed === "string") {
      return [parsed];
    }
  } catch {
    return [];
  }

  return [];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function computeNextBeta(packageName, baseVersion, forcedBeta, rootDir) {
  if (forcedBeta !== null) {
    return forcedBeta;
  }

  const publishedVersions = getPublishedVersions(rootDir, packageName);
  const pattern = new RegExp(`^${escapeRegExp(baseVersion)}-beta\\.(\\d+)$`);

  let maxBeta = 0;
  for (const version of publishedVersions) {
    const match = version.match(pattern);
    if (!match) {
      continue;
    }

    const value = Number.parseInt(match[1], 10);
    if (Number.isInteger(value) && value > maxBeta) {
      maxBeta = value;
    }
  }

  return maxBeta + 1;
}

function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const jsbsimDir = path.join(rootDir, "vendor", "jsbsim");
  const options = parseArgs(process.argv.slice(2));

  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  const packageName = options.packageName || packageJson.name;

  const resolvedTagInfo = options.jsbsimTag ? parseStableTag(options.jsbsimTag) : pickLatestStableTag(jsbsimDir);
  if (!resolvedTagInfo) {
    throw new Error(`Invalid JSBSim tag: ${options.jsbsimTag}`);
  }

  assertTagExists(jsbsimDir, resolvedTagInfo.tag);

  const betaNumber = computeNextBeta(packageName, resolvedTagInfo.version, options.beta, rootDir);
  const packageVersion = `${resolvedTagInfo.version}-beta.${betaNumber}`;

  const payload = {
    packageName,
    jsbsimTag: resolvedTagInfo.tag,
    jsbsimVersion: resolvedTagInfo.version,
    betaNumber,
    packageVersion
  };

  if (options.format === "env") {
    process.stdout.write(`PACKAGE_NAME=${payload.packageName}\n`);
    process.stdout.write(`JSBSIM_TAG=${payload.jsbsimTag}\n`);
    process.stdout.write(`JSBSIM_VERSION=${payload.jsbsimVersion}\n`);
    process.stdout.write(`BETA_NUMBER=${payload.betaNumber}\n`);
    process.stdout.write(`PACKAGE_VERSION=${payload.packageVersion}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main();
