import { Temporal } from "temporal-polyfill";
import { Temporal as FullTemporal } from "temporal-polyfill/full";
import { describe, expect, test } from "vitest";
import {
  dateFromProto,
  dateTimeFromProto,
  dateTimeToProto,
  dateToProto,
  dayOfWeekFromProto,
  dayOfWeekToProto,
  monthDayFromProto,
  monthDayToProto,
  monthFromProto,
  monthToProto,
  timeOfDayFromProto,
  timeOfDayToProto,
  timeZoneFromProto,
  timeZoneToProto,
  yearMonthFromProto,
  yearMonthToProto,
} from "./calendar.js";
import { DomainDecodeError, DomainEncodeError } from "./errors.js";
import type { WireDateTime } from "./wire.js";

const path = "test.v1.Event.field";

describe("Date forms", () => {
  test("FULL ↔ PlainDate", () => {
    const date = Temporal.PlainDate.from("2024-02-29");
    expect(dateToProto(date)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(dateFromProto(dateToProto(date), path).equals(date)).toBe(true);
  });

  test("FULL rejects a partial date with a descriptive error", () => {
    expect(() => dateFromProto({ year: 2024, month: 2, day: 0 }, path)).toThrow(
      /test\.v1\.Event\.field: Date \{year: 2024, month: 2, day: 0\} is partial/,
    );
    expect(() => dateFromProto({ year: 0, month: 12, day: 25 }, path)).toThrow(DomainDecodeError);
  });

  test("FULL rejects an impossible date", () => {
    expect(() => dateFromProto({ year: 2023, month: 2, day: 29 }, path)).toThrow(DomainDecodeError);
  });

  test("YEAR_MONTH ↔ PlainYearMonth, writing day 0", () => {
    const yearMonth = Temporal.PlainYearMonth.from("2025-11");
    expect(yearMonthToProto(yearMonth)).toEqual({ year: 2025, month: 11, day: 0 });
    expect(yearMonthFromProto({ year: 2025, month: 11, day: 0 }, path).equals(yearMonth)).toBe(
      true,
    );
  });

  test("YEAR_MONTH rejects a day", () => {
    expect(() => yearMonthFromProto({ year: 2025, month: 11, day: 3 }, path)).toThrow(
      /DATE_FORM_YEAR_MONTH, which needs a year, a month and day 0/,
    );
    expect(() => yearMonthFromProto({ year: 0, month: 11, day: 0 }, path)).toThrow(
      DomainDecodeError,
    );
  });

  test("MONTH_DAY ↔ PlainMonthDay, writing year 0", () => {
    const leapDay = Temporal.PlainMonthDay.from({ month: 2, day: 29 });
    expect(monthDayToProto(leapDay)).toEqual({ year: 0, month: 2, day: 29 });
    expect(monthDayFromProto({ year: 0, month: 2, day: 29 }, path).equals(leapDay)).toBe(true);
  });

  test("MONTH_DAY rejects a year", () => {
    expect(() => monthDayFromProto({ year: 2024, month: 12, day: 25 }, path)).toThrow(
      /DATE_FORM_MONTH_DAY, which needs year 0/,
    );
    expect(() => monthDayFromProto({ year: 0, month: 2, day: 30 }, path)).toThrow(
      DomainDecodeError,
    );
  });

  test("encode rejects non-ISO calendars and years outside 1..9999", () => {
    // temporal-polyfill's default build is ISO-only; its full build has the other calendars.
    const japanese = FullTemporal.PlainDate.from("2024-01-01").withCalendar("japanese");
    expect(() => dateToProto(japanese)).toThrow(/calendar "japanese"/);
    expect(() => dateToProto(Temporal.PlainDate.from("+010000-01-01"))).toThrow(DomainEncodeError);
  });
});

describe("TimeOfDay ↔ PlainTime", () => {
  test("round-trips nanosecond precision", () => {
    const time = Temporal.PlainTime.from("23:59:58.123456789");
    expect(timeOfDayToProto(time)).toEqual({
      hours: 23,
      minutes: 59,
      seconds: 58,
      nanos: 123_456_789,
    });
    expect(timeOfDayFromProto(timeOfDayToProto(time), path).equals(time)).toBe(true);
  });

  test("rejects 24:00 and leap seconds, which PlainTime can't hold", () => {
    expect(() => timeOfDayFromProto({ hours: 24, minutes: 0, seconds: 0, nanos: 0 }, path)).toThrow(
      DomainDecodeError,
    );
    expect(() =>
      timeOfDayFromProto({ hours: 23, minutes: 59, seconds: 60, nanos: 0 }, path),
    ).toThrow(DomainDecodeError);
  });
});

describe("DateTime", () => {
  const fields = { year: 2024, month: 3, day: 10, hours: 14, minutes: 30, seconds: 5, nanos: 7 };

  test("time_zone ↔ ZonedDateTime", () => {
    const wire: WireDateTime = {
      ...fields,
      timeOffset: { case: "timeZone", value: { id: "Europe/Paris", version: "" } },
    };
    const decoded = dateTimeFromProto(wire, path);
    expect(decoded.toString()).toBe("2024-03-10T14:30:05.000000007+01:00[Europe/Paris]");
    expect(dateTimeToProto(decoded)).toEqual({
      ...fields,
      timeOffset: { case: "timeZone", value: { id: "Europe/Paris" } },
    });
  });

  test("utc_offset ↔ ZonedDateTime in a fixed-offset zone", () => {
    const wire: WireDateTime = {
      ...fields,
      timeOffset: { case: "utcOffset", value: { seconds: -(3n * 3_600n + 30n * 60n), nanos: 0 } },
    };
    const decoded = dateTimeFromProto(wire, path);
    expect(decoded.toString()).toBe("2024-03-10T14:30:05.000000007-03:30[-03:30]");
    expect(dateTimeToProto(decoded)).toEqual(wire);
  });

  test("neither ↔ PlainDateTime", () => {
    const wire: WireDateTime = { ...fields, timeOffset: { case: undefined } };
    const decoded = dateTimeFromProto(wire, path);
    expect(decoded).toBeInstanceOf(Temporal.PlainDateTime);
    expect(decoded.toString()).toBe("2024-03-10T14:30:05.000000007");
    expect(dateTimeToProto(decoded)).toEqual(wire);
  });

  test("a skipped wall-clock time resolves compatibly", () => {
    const wire: WireDateTime = {
      ...fields,
      hours: 2,
      timeOffset: { case: "timeZone", value: { id: "America/New_York", version: "" } },
    };
    expect(dateTimeFromProto(wire, path).toString()).toBe(
      "2024-03-10T03:30:05.000000007-04:00[America/New_York]",
    );
  });

  test("rejects year 0, sub-minute offsets and unknown zones", () => {
    expect(() =>
      dateTimeFromProto({ ...fields, year: 0, timeOffset: { case: undefined } }, path),
    ).toThrow(/no year/);
    expect(() =>
      dateTimeFromProto(
        { ...fields, timeOffset: { case: "utcOffset", value: { seconds: 30n, nanos: 0 } } },
        path,
      ),
    ).toThrow(/whole minutes/);
    expect(() =>
      dateTimeFromProto(
        {
          ...fields,
          timeOffset: { case: "timeZone", value: { id: "Mars/Olympus_Mons", version: "" } },
        },
        path,
      ),
    ).toThrow(`${path}.time_zone`);
  });
});

describe("TimeZone ↔ IANA id", () => {
  test("round-trips a known zone and drops version", () => {
    expect(timeZoneFromProto({ id: "Asia/Kolkata", version: "2024a" }, path)).toBe("Asia/Kolkata");
    expect(timeZoneToProto("Asia/Kolkata")).toEqual({ id: "Asia/Kolkata" });
  });

  test("rejects unknown and empty ids", () => {
    expect(() => timeZoneFromProto({ id: "Nowhere/Town", version: "" }, path)).toThrow(
      DomainDecodeError,
    );
    expect(() => timeZoneFromProto({ id: "", version: "" }, path)).toThrow(/empty/);
    expect(() => timeZoneToProto("Nowhere/Town")).toThrow(DomainEncodeError);
  });
});

describe("DayOfWeek and Month", () => {
  test("DayOfWeek is 1 (Monday) to 7, matching Temporal's dayOfWeek", () => {
    const monday = Temporal.PlainDate.from("2024-01-01");
    expect(dayOfWeekFromProto(1, path)).toBe(monday.dayOfWeek);
    expect(dayOfWeekFromProto(7, path)).toBe(7);
    expect(dayOfWeekFromProto(0, path)).toBeNull();
    expect(dayOfWeekToProto(null)).toBe(0);
    expect(dayOfWeekToProto(3)).toBe(3);
    expect(() => dayOfWeekFromProto(8, path)).toThrow(DomainDecodeError);
  });

  test("Month is 1 (January) to 12", () => {
    expect(monthFromProto(12, path)).toBe(12);
    expect(monthFromProto(0, path)).toBeNull();
    expect(monthToProto(null)).toBe(0);
    expect(monthToProto(1)).toBe(1);
    expect(() => monthFromProto(13, path)).toThrow(DomainDecodeError);
  });
});
