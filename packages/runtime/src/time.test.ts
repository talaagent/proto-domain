import { Temporal } from "temporal-polyfill";
import { describe, expect, test } from "vitest";
import { DomainDecodeError, DomainEncodeError } from "./errors.js";
import {
  calendarDurationFromProto,
  calendarDurationToProto,
  durationFromProto,
  durationToProto,
  timestampFromProto,
  timestampToProto,
} from "./time.js";

const path = "test.v1.Event.field";

describe("Timestamp ↔ Instant", () => {
  test.each([
    "1970-01-01T00:00:00Z",
    "2024-02-29T12:34:56.789012345Z",
    "1969-12-31T23:59:59.999999999Z",
    "0001-01-01T00:00:00Z",
    "9999-12-31T23:59:59.999999999Z",
  ])("round-trips %s", (text) => {
    const instant = Temporal.Instant.from(text);
    const wire = timestampToProto(instant);
    expect(wire.nanos).toBeGreaterThanOrEqual(0);
    expect(timestampFromProto(wire, path).equals(instant)).toBe(true);
  });

  test("normalizes a pre-epoch instant to positive nanos", () => {
    expect(timestampToProto(Temporal.Instant.from("1969-12-31T23:59:59.5Z"))).toEqual({
      seconds: -1n,
      nanos: 500_000_000,
    });
  });

  test("rejects out-of-range wire values", () => {
    expect(() => timestampFromProto({ seconds: 253_402_300_800n, nanos: 0 }, path)).toThrow(
      DomainDecodeError,
    );
    expect(() => timestampFromProto({ seconds: 0n, nanos: -1 }, path)).toThrow(/nanos -1/);
    expect(() => timestampFromProto({ seconds: 0n, nanos: 1_000_000_000 }, path)).toThrow(path);
  });

  test("rejects an instant outside 0001..9999", () => {
    expect(() => timestampToProto(Temporal.Instant.from("+010000-01-01T00:00:00Z"))).toThrow(
      DomainEncodeError,
    );
  });
});

describe("Duration ↔ Temporal.Duration (time units)", () => {
  test.each(["PT0S", "PT1.5S", "PT26H3M4.000000005S", "-PT90M", "-PT0.000001S", "PT87660H"])(
    "round-trips %s",
    (text) => {
      const duration = Temporal.Duration.from(text);
      const decoded = durationFromProto(durationToProto(duration), path);
      expect(Temporal.Duration.compare(decoded, duration)).toBe(0);
    },
  );

  test("decodes balanced to hours, never days", () => {
    expect(durationFromProto({ seconds: 93_784n, nanos: 5 }, path).toString()).toBe(
      "PT26H3M4.000000005S",
    );
    expect(durationFromProto({ seconds: -5_400n, nanos: -500_000_000 }, path).toString()).toBe(
      "-PT1H30M0.5S",
    );
  });

  test("encodes unbalanced units", () => {
    expect(durationToProto(Temporal.Duration.from({ milliseconds: 90_500 }))).toEqual({
      seconds: 90n,
      nanos: 500_000_000,
    });
    expect(durationToProto(Temporal.Duration.from("-PT1.25S"))).toEqual({
      seconds: -1n,
      nanos: -250_000_000,
    });
  });

  test("rejects calendar units", () => {
    expect(() => durationToProto(Temporal.Duration.from("P1D"))).toThrow(/CalendarDuration/);
    expect(() => durationToProto(Temporal.Duration.from("P1M"))).toThrow(DomainEncodeError);
  });

  test("rejects invalid wire values", () => {
    expect(() => durationFromProto({ seconds: 1n, nanos: -1 }, path)).toThrow(/differ in sign/);
    expect(() => durationFromProto({ seconds: 315_576_000_001n, nanos: 0 }, path)).toThrow(
      DomainDecodeError,
    );
    expect(() => durationToProto(Temporal.Duration.from({ hours: 87_661_000 }))).toThrow(
      DomainEncodeError,
    );
  });
});

describe("CalendarDuration ↔ Temporal.Duration (any units)", () => {
  test.each(["P1Y2M3W4DT5H6M7.008009010S", "P1M", "PT90M", "-P2W", "PT0S", "-PT0.5S"])(
    "round-trips %s unbalanced",
    (text) => {
      const duration = Temporal.Duration.from(text);
      expect(calendarDurationFromProto(calendarDurationToProto(duration), path).toString()).toBe(
        duration.toString(),
      );
    },
  );

  test("folds sub-second units into seconds and nanos", () => {
    expect(
      calendarDurationToProto(Temporal.Duration.from({ days: 1, milliseconds: 2_500 })),
    ).toEqual({
      years: 0n,
      months: 0n,
      weeks: 0n,
      days: 1n,
      hours: 0n,
      minutes: 0n,
      seconds: 2n,
      nanos: 500_000_000,
    });
  });

  test("rejects mixed signs", () => {
    const wire = {
      years: 1n,
      months: -1n,
      weeks: 0n,
      days: 0n,
      hours: 0n,
      minutes: 0n,
      seconds: 0n,
      nanos: 0,
    };
    expect(() => calendarDurationFromProto(wire, path)).toThrow(DomainDecodeError);
  });
});
