import { Temporal } from "temporal-polyfill";
import { afterEach, expect, test, vi } from "vitest";
import { configureTemporal, temporal } from "./temporal.js";

afterEach(() => {
  configureTemporal(Temporal);
  Reflect.deleteProperty(globalThis, "Temporal");
});

test("uses the configured implementation", () => {
  expect(temporal()).toBe(Temporal);
});

test("falls back to globalThis.Temporal (native Temporal or the polyfill's global)", async () => {
  // A fresh module instance, which has no configured implementation.
  vi.resetModules();
  const fresh = await import("./temporal.js");
  Reflect.set(globalThis, "Temporal", Temporal);
  expect(fresh.temporal()).toBe(Temporal);
});

test("throws a helpful error with neither", async () => {
  vi.resetModules();
  const fresh = await import("./temporal.js");
  const existing: unknown = Reflect.get(globalThis, "Temporal");
  if (existing !== undefined) {
    // This runtime has native Temporal; the error path can't be reached.
    return;
  }
  expect(() => fresh.temporal()).toThrow(/configureTemporal/);
});
