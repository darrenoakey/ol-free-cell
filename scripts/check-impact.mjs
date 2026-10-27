// Selects greenline check suites from the candidate diff. Unknown files fail
// closed to the full suite. A MARKETING_VERSION bump does not run the native
// UI test; the App Store preflight still builds that exact archive.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ALL_SUITES = [
  "verify-core",
  "unit-tests",
  "npm-audit",
  "bdd-web",
  "cap-sync",
  "ios-test",
  "resolve-packages",
];

const METADATA = new Set([
  "run",
  "greenline.toml",
  ".app-publish.json",
  ".gitignore",
  "PRIVACY_POLICY.md",
  "AGENTS.md",
  "CLAUDE.md",
]);

function isMetadata(path) {
  return METADATA.has(path)
    || path.startsWith("docs/")
    || path.startsWith("fastlane/")
    || path.startsWith(".github/")
    || path.startsWith("scripts/")
    || path.startsWith("tests/unit/")
    || path.endsWith(".md");
}

export function isVersionOnlyPbxproj(patch) {
  const lines = patch.split(/\r?\n/).filter((line) =>
    (line.startsWith("+") || line.startsWith("-"))
    && !line.startsWith("+++")
    && !line.startsWith("---"));
  return lines.length > 0 && lines.every((line) =>
    /^[+-]\s*(MARKETING_VERSION|CURRENT_PROJECT_VERSION)\s*=/.test(line));
}

// Only an existing leading block comment may change. Compare every byte after
// its first closing delimiter (and the leading whitespace), not a regex-stripped
// stylesheet: comment-like text in strings/URLs and token boundaries are CSS.
export function isLeadingCssCommentOnly(before, after) {
  if (typeof before !== "string" || typeof after !== "string" || before === after) return false;
  const leadingComment = /^(\s*)\/\*[\s\S]*?\*\//;
  const oldComment = leadingComment.exec(before);
  const newComment = leadingComment.exec(after);
  return Boolean(oldComment && newComment
    && oldComment[1] === newComment[1]
    && before.slice(oldComment[0].length) === after.slice(newComment[0].length));
}

export function requiredSuites(changes) {
  if (!Array.isArray(changes) || changes.length === 0) return [...ALL_SUITES];
  let web = false;
  let ios = false;
  let resolvePackages = false;
  for (const change of changes) {
    const path = change?.path;
    const patch = change?.patch ?? "";
    if (!path) return [...ALL_SUITES];
    if (path === "package.json" || path === "package-lock.json" || path.endsWith("Package.swift") || path.endsWith("Package.resolved")) {
      resolvePackages = true;
      web = true;
      ios = true;
      continue;
    }
    if (path === "capacitor.config.json") {
      web = true;
      ios = true;
      continue;
    }
    if (path === "ios/App/App.xcodeproj/project.pbxproj") {
      if (!isVersionOnlyPbxproj(patch)) ios = true;
      continue;
    }
    if (isMetadata(path)) continue;
    if (path.startsWith("web/") && path.endsWith(".css")
      && isLeadingCssCommentOnly(change.before, change.after)) continue;
    if (path.startsWith("web/") || path.startsWith("tests/bdd/") || path.startsWith("assets/")) {
      web = true;
      ios = true;
      continue;
    }
    if (path.startsWith("ios/")) {
      ios = true;
      continue;
    }
    return [...ALL_SUITES];
  }
  const suites = ["verify-core", "unit-tests", "npm-audit"];
  if (web) suites.push("bdd-web");
  if (ios) suites.push("cap-sync", "ios-test");
  if (resolvePackages) suites.push("resolve-packages");
  return suites;
}

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
}

export function changesFromGit(repo) {
  const base = git(repo, ["merge-base", "HEAD", "main"]).trim();
  const names = git(repo, ["diff", "--name-only", base, "HEAD"]).split("\n").filter(Boolean);
  return names.map((path) => ({
    path,
    ...(path.startsWith("web/") && path.endsWith(".css") ? {
      before: git(repo, ["show", `${base}:${path}`]),
      after: git(repo, ["show", `HEAD:${path}`]),
    } : {}),
    patch: path.endsWith("project.pbxproj")
      ? git(repo, ["diff", "--unified=0", base, "HEAD", "--", path])
      : "",
  }));
}

function main() {
  const repo = process.argv[2] || process.cwd();
  let suites;
  try {
    suites = requiredSuites(changesFromGit(repo));
  } catch (error) {
    console.error(`check-impact: git diff failed, running the full suite (${error.message})`);
    suites = [...ALL_SUITES];
  }
  process.stdout.write(`${suites.join("\n")}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
