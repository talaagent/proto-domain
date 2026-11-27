import { Temporal } from "temporal-polyfill";
import { describe, expect, test } from "vitest";
import { DomainDecodeError, DomainEncodeError } from "./errors.js";
import {
  decimalFromProto,
  decimalToProto,
  intervalFromProto,
  intervalToProto,
  latLngFromProto,
  latLngToProto,
} from "./values.js";

const path = "test.v1.Place.field";

describe("Interval", () => {
  test("round-trips bounded and unbounded intervals", () => {
    const start = Temporal.Instant.from("2024-01-01T00:00:00Z");
    const end = Temporal.Instant.from("2024-01-02T00:00:00Z");
    for (const interval of [
      { start, end },
      { start, end: null },
      { start: null, end },
      { start: null, end: null },
    ]) {
      const decoded = intervalFromProto(intervalToProto(interval), path);
      expect(decoded.start?.toString() ?? null).toBe(interval.start?.toString() ?? null);
      expect(decoded.end?.toString() ?? null).toBe(interval.end?.toString() ?? null);
    }
    expect(intervalToProto({ start: null, end: null })).toEqual({});
  });

  test("rejects an end before the start", () => {
    const later = { seconds: 100n, nanos: 0 };
    const earlier = { seconds: 50n, nanos: 0 };
    expect(() => intervalFromProto({ startTime: later, endTime: earlier }, path)).toThrow(
      DomainDecodeError,
    );
    expect(() =>
      intervalToProto({
        start: Temporal.Instant.fromEpochMilliseconds(100),
        end: Temporal.Instant.fromEpochMilliseconds(50),
      }),
    ).toThrow(DomainEncodeError);
  });
});

describe("LatLng", () => {
  test("round-trips", () => {
    const point = { latitude: -33.8688, longitude: 151.2093 };
    expect(latLngFromProto(latLngToProto(point), path)).toEqual(point);
  });

  test("rejects out-of-range and NaN coordinates", () => {
    expect(() => latLngFromProto({ latitude: 91, longitude: 0 }, path)).toThrow(/latitude 91/);
    expect(() => latLngToProto({ latitude: 0, longitude: Number.NaN })).toThrow(DomainEncodeError);
  });
});

describe("Decimal", () => {
  test.each(["0", "-12.50", "+.5", "1e3", "2.5E-10", "123."])("keeps %s as a string", (value) => {
    expect(decimalFromProto(decimalToProto(value), path)).toBe(value);
  });

  test.each(["", "1,5", "abc", "1e", "--1", " 1"])("rejects %j", (value) => {
    expect(() => decimalFromProto({ value }, path)).toThrow(DomainDecodeError);
    expect(() => decimalToProto(value)).toThrow(DomainEncodeError);
  });
});
