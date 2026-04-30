import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProviderError, ProviderError } from "../src/core/provider-errors.js";

test("provider errors are normalized", () => {
  assert.equal(normalizeProviderError(new Error("429 rate limit")).code, "ProviderRateLimited");
  assert.equal(normalizeProviderError(new Error("401 invalid api key")).code, "ProviderAuthFailed");
  assert.equal(normalizeProviderError(new Error("network down")).code, "ProviderUnavailable");
});

test("existing provider errors are preserved", () => {
  const error = new ProviderError("MissingProvider", "missing");
  assert.equal(normalizeProviderError(error), error);
});
