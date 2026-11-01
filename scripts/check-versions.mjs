import fs from "node:fs";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

const pkg = readJson("package.json").version;
const lock = readJson("package-lock.json").version;
const conf = readJson("src-tauri/tauri.conf.json").version;
const cargo = fs
  .readFileSync("src-tauri/Cargo.toml", "utf8")
  .match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const ref = process.env.GITHUB_REF_NAME ?? "";
const tag = ref.startsWith("v") ? ref.slice(1) : null;
const fallback = fs
  .readFileSync("src/useAppVersion.ts", "utf8")
  .match(/cached\s*=\s*"([^"]+)"/)?.[1];

const values = { pkg, lock, conf, cargo, fallback, tag: tag ?? "n/a" };
const unique = new Set(
  [pkg, lock, conf, cargo, fallback, tag].filter((value) => value != null),
);

if (unique.size !== 1) {
  console.error("Version mismatch:", values);
  process.exit(1);
}

console.log("versions ok:", pkg);
