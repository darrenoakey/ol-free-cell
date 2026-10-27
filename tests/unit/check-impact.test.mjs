import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { changesFromGit, requiredSuites } from "../../scripts/check-impact.mjs";

const cheapSuites = ["verify-core", "unit-tests", "npm-audit"];
const css = (before, after) => ({ path: "web/css/board.css", before, after });

test("leading CSS documentation edits preserve every executable byte", () => {
  assert.deepEqual(requiredSuites([css("/* old */\nbody { opacity: 1; }", "/* new\n contract */\nbody { opacity: 1; }")]), cheapSuites);
});

test("CSS behavior edits and ambiguous inputs retain both product suites", () => {
  for (const change of [
    css("/* old */body { opacity: 1; }", "/* new */body { opacity: 0; }"),
    css("/* old */a/**/b {}", "/* new */ab {}"),
    css('/* old */a { content: "/* old */"; }', '/* new */a { content: "/* new */"; }'),
    css("/* old */a { background: url(a/*old*/b); }", "/* new */a { background: url(a/*new*/b); }"),
    css("/* old */a {}", "/* new */body {}/* */a {}"),
    css("/* old */a {}", "/* unterminated a {}"),
    css("a {}", "/* new */a {}"),
    css(undefined, "/* new */a {}"),
    css("/* old */a {}", undefined),
  ]) {
    const suites = requiredSuites([change]);
    assert.ok(suites.includes("bdd-web"));
    assert.ok(suites.includes("ios-test"));
  }
  assert.ok(requiredSuites([
    css("/* old */a {}", "/* new */a {}"), { path: "web/js/app.js" },
  ]).includes("bdd-web"));
});

test("real git diff supplies CSS contents and still detects a behavior edit", () => {
  const repo = mkdtempSync(join(tmpdir(), "freecell-impact-"));
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Impact test");
    git("config", "user.email", "impact@example.test");
    mkdirSync(join(repo, "web/css"), { recursive: true });
    const path = join(repo, "web/css/board.css");
    writeFileSync(path, "/* old */\na { opacity: 1; }\n");
    git("add", ".");
    git("commit", "-m", "base");
    git("checkout", "-b", "candidate");
    writeFileSync(path, "/* new contract */\na { opacity: 1; }\n");
    git("commit", "-am", "document CSS");
    assert.deepEqual(requiredSuites(changesFromGit(repo)), cheapSuites);
    writeFileSync(path, "/* new contract */\na { opacity: 0; }\n");
    git("commit", "-am", "change CSS");
    assert.ok(requiredSuites(changesFromGit(repo)).includes("ios-test"));
    assert.ok(requiredSuites(changesFromGit(repo)).includes("bdd-web"));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

const versionPatch = `
--- a/ios/App/App.xcodeproj/project.pbxproj
+++ b/ios/App/App.xcodeproj/project.pbxproj
@@ -386 +386 @@
-				MARKETING_VERSION = 1.0.6;
+				MARKETING_VERSION = 1.0.7;
`;

test("a marketing-version bump does not run the native UI test", () => {
  const suites = requiredSuites([
    { path: ".app-publish.json" },
    { path: "ios/App/App.xcodeproj/project.pbxproj", patch: versionPatch },
  ]);
  assert.deepEqual(suites, ["verify-core", "unit-tests", "npm-audit"]);
});

test("a build-setting change in the Xcode project still runs the UI test", () => {
  const suites = requiredSuites([
    {
      path: "ios/App/App.xcodeproj/project.pbxproj",
      patch: "-IPHONEOS_DEPLOYMENT_TARGET = 15.0;\n+IPHONEOS_DEPLOYMENT_TARGET = 16.0;\n",
    },
  ]);
  assert.ok(suites.includes("ios-test"));
  assert.ok(!suites.includes("bdd-web"));
});

test("web assets run both the browser suite and the native UI test", () => {
  const suites = requiredSuites([{ path: "web/js/app.js" }]);
  assert.ok(suites.includes("bdd-web"));
  assert.ok(suites.includes("ios-test"));
  assert.ok(suites.includes("cap-sync"));
});

test("native source runs the UI test without the browser suite", () => {
  const suites = requiredSuites([{ path: "ios/App/App/SceneDelegate.swift" }]);
  assert.ok(suites.includes("ios-test"));
  assert.ok(!suites.includes("bdd-web"));
});

test("gate-script and unit-test edits do not run product suites", () => {
  const suites = requiredSuites([
    { path: "run" },
    { path: "scripts/check-impact.mjs" },
    { path: "tests/unit/check-impact.test.mjs" },
  ]);
  assert.deepEqual(suites, ["verify-core", "unit-tests", "npm-audit"]);
});

test("dependency changes resolve packages and run both product suites", () => {
  const suites = requiredSuites([{ path: "package-lock.json" }]);
  assert.ok(suites.includes("resolve-packages"));
  assert.ok(suites.includes("ios-test"));
  assert.ok(suites.includes("bdd-web"));
});

test("an unclassified file fails closed to the full suite", () => {
  const suites = requiredSuites([{ path: "mystery.bin" }]);
  assert.ok(suites.includes("ios-test"));
  assert.ok(suites.includes("bdd-web"));
  assert.ok(suites.includes("resolve-packages"));
});

test("an empty diff fails closed", () => {
  assert.ok(requiredSuites([]).includes("ios-test"));
});

test("a wedged simulator is abandoned with killpg, not pkill", () => {
  const run = readFileSync(new URL("../../run", import.meta.url), "utf8");
  assert.equal(run.includes("pkill"), false);
  assert.ok(run.includes("os.killpg"));
  assert.ok(run.includes("abandon_session"));
});
