import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { requiredSuites } from "../../scripts/check-impact.mjs";

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
