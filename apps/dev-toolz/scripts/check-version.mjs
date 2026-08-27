import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [packageJson, manifest, packageLock, changelog] = await Promise.all([
  readJson("package.json"),
  readJson("manifest.json"),
  readJson("../../package-lock.json"),
  readFile(resolve(appRoot, "CHANGELOG.md"), "utf8"),
]);

const version = packageJson.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Dev Toolz version must use numeric major.minor.patch: ${version}`);
}
if (manifest.version !== version) {
  throw new Error(`Version mismatch: package ${version}, manifest ${manifest.version}`);
}
const lockVersion = packageLock.packages?.["apps/dev-toolz"]?.version;
if (lockVersion !== version) {
  throw new Error(`Version mismatch: package ${version}, lockfile ${lockVersion ?? "none"}`);
}

const latestRelease = changelog.match(/^## \[(?!Unreleased\])([^\]]+)\] - \d{4}-\d{2}-\d{2}$/m)?.[1];
if (latestRelease !== version) {
  throw new Error(`CHANGELOG latest release must be ${version}; found ${latestRelease ?? "none"}`);
}

console.log(`Dev Toolz version ${version} is synchronized`);

async function readJson(fileName) {
  return JSON.parse(await readFile(resolve(appRoot, fileName), "utf8"));
}
