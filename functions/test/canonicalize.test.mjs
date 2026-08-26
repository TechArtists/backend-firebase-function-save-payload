// Run with `npm test` (builds first). Uses the Node 22 built-in test runner, so there is no
// test framework to install. `canonicalize` lives in its own module precisely so it can be
// imported here without index.ts's top-level side effects (admin.initializeApp, the
// TARGET_BUCKET check) running.
import {test} from "node:test";
import assert from "node:assert/strict";

import {canonicalize} from "../lib/canonicalize.js";

const canon = (value) => JSON.stringify(canonicalize(value));

test("flat payloads are unchanged from the previous implementation", () => {
  // The guarantee that makes this deployable: every adservices object already in the bucket
  // stays byte-compatible with everything written after the fix.
  const payload = {orgId: 40669820, attribution: true, campaignId: 542370539, claimType: "Click"};
  const previousImplementation = JSON.stringify(
    JSON.parse(JSON.stringify(payload, Object.keys(payload).sort()))
  );

  assert.equal(canon(payload), previousImplementation);
  assert.equal(canon(payload), '{"attribution":true,"campaignId":542370539,"claimType":"Click","orgId":40669820}');
});

test("nested objects keep every key", () => {
  assert.equal(
    canon({userId: "abc", campaign: {name: "spring_sale", id: 99}}),
    '{"campaign":{"id":99,"name":"spring_sale"},"userId":"abc"}'
  );
});

test("nested keys survive even when they collide with a top-level key", () => {
  // The replacer-array bug kept exactly the colliding key and dropped the rest, which produced a
  // plausible-looking object meaning something else entirely.
  assert.equal(
    canon({userId: "abc", campaign: {userId: "SHADOWED", name: "spring_sale"}}),
    '{"campaign":{"name":"spring_sale","userId":"SHADOWED"},"userId":"abc"}'
  );
});

test("arrays stay arrays and their elements are canonicalized", () => {
  assert.equal(canon({events: [{b: 2, a: 1}, {d: 4, c: 3}]}), '{"events":[{"a":1,"b":2},{"c":3,"d":4}]}');
  assert.equal(canon({tags: ["z", "a"]}), '{"tags":["z","a"]}', "array order is data, not to be sorted");
});

test("null, empty objects and deep nesting round-trip", () => {
  assert.equal(canon({z: null, a: {}, m: {q: {r: {s: 1}}}}), '{"a":{},"m":{"q":{"r":{"s":1}}},"z":null}');
  assert.equal(canon(null), "null");
});

test("scalar types are preserved, not reformatted", () => {
  // Large campaign/ad-group identifiers must not come back in exponential notation.
  assert.equal(canon({campaignId: 542370539, ratio: 1.5, ok: true, name: "x"}),
    '{"campaignId":542370539,"name":"x","ok":true,"ratio":1.5}');
});

test("output is stable across client key order", () => {
  assert.equal(
    canon({b: {y: 2, x: 1}, a: 1}),
    canon({a: 1, b: {x: 1, y: 2}})
  );
});
