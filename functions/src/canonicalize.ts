/**
 * Deep-sorts object keys so that two payloads carrying the same data serialize to identical
 * bytes regardless of the key order the client happened to send.
 *
 * Do not be tempted back into `JSON.stringify(value, Object.keys(value).sort())`. The second
 * argument is a replacer *array*, which JSON.stringify applies as a key whitelist at every
 * depth — not just the top level. Nested objects therefore keep only those keys that happen to
 * collide with the top-level key list, and everything else is dropped without an error:
 *
 *   {a: 1, b: {c: 2, a: 3}}  ->  {"a":1,"b":{"a":3}}     // b.c silently lost
 *   {e: [{y: 1, x: 2}]}      ->  {"e":[{}]}              // array elements emptied
 *
 * Flat payloads are unaffected by that bug, which is why it went unnoticed: the Apple Search Ads
 * records this bucket was built for have no nested values.
 *
 * @param {unknown} value any JSON-representable value.
 * @return {unknown} the same value with every object's keys in sorted order.
 */
export function canonicalize(value: unknown): unknown {
  // Arrays must be tested before objects: `typeof [] === "object"`, so the object branch would
  // rebuild them into {"0": …, "1": …}.
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  // `typeof null === "object"` too, and Object.keys(null) throws.
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonicalize(object[key])])
    );
  }

  return value;
}
