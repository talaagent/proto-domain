// google.type calendar messages ↔ Temporal plain types:
// Date ↔ PlainDate / PlainYearMonth / PlainMonthDay (by the field's declared
// form), TimeOfDay ↔ PlainTime, DateTime ↔ ZonedDateTime / PlainDateTime,
// TimeZone ↔ IANA id string, DayOfWeek ↔ 1–7, Month ↔ 1–12.

import { DomainDecodeError, DomainEncodeError, errorMessage } from "./errors.js";
import { type Temporal, temporal } from "./temporal.js";
import type { DurationInit } from "./time.js";
import type { WireDate, WireDateTime, WireTimeOfDay, WireTimeZone } from "./wire.js";

const ISO_CALENDAR = "iso8601";
const OFFSET_ZONE = /^([+-])(\d{2}):(\d{2})$/;

/** A plain object for the wire Date. */
export interface DateInit {
  year: number;
  month: number;
  day: number;
}

/** A plain object for the wire TimeOfDay. */
export interface TimeOfDayInit {
  hours: number;
  minutes: number;
  seconds: number;
  nanos: number;
}

/** A plain object for the wire TimeZone. */
export interface TimeZoneInit {
  id: string;
}

/** A plain object for the wire DateTime. */
export interface DateTimeInit {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  nanos: number;
  timeOffset:
    | { case: "utcOffset"; value: DurationInit }
    | { case: "timeZone"; value: TimeZoneInit }
    | { case: undefined };
}

/** An ISO weekday as Temporal numbers it: Monday is 1, Sunday is 7. */
export type DayOfWeekNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** A month as Temporal numbers it in the ISO calendar: January is 1. */
export type MonthNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * A full google.type.Date (year, month and day all set) as a PlainDate. A
 * partial date throws: annotate the field with
 * `(talaagent.domain.v1.field).date = DATE_FORM_YEAR_MONTH` or `DATE_FORM_MONTH_DAY`
 * to accept one.
 */
export function dateFromProto(date: WireDate, path: string): Temporal.PlainDate {
  const { year, month, day } = date;
  if (year === 0 || month === 0 || day === 0) {
    throw new DomainDecodeError(
      path,
      `Date ${describeDate(date)} is partial (a zero year, month or day), but the field takes a full date; declare (talaagent.domain.v1.field).date to accept a partial form`,
    );
  }
  return decodeDate(path, () =>
    temporal().PlainDate.from({ year, month, day }, { overflow: "reject" }),
  );
}

/** A PlainDate as a google.type.Date; throws outside years 1..9999 or for a non-ISO calendar. */
export function dateToProto(date: Temporal.PlainDate): DateInit {
  isoOnly("Temporal.PlainDate", date.calendarId);
  checkYear("Temporal.PlainDate", date.year, date.toString());
  return { year: date.year, month: date.month, day: date.day };
}

/** A google.type.Date with a year and month and day 0 as a PlainYearMonth. */
export function yearMonthFromProto(date: WireDate, path: string): Temporal.PlainYearMonth {
  const { year, month, day } = date;
  if (year === 0 || month === 0 || day !== 0) {
    throw new DomainDecodeError(
      path,
      `Date ${describeDate(date)} is not a year and month: the field is declared DATE_FORM_YEAR_MONTH, which needs a year, a month and day 0`,
    );
  }
  return decodeDate(path, () =>
    temporal().PlainYearMonth.from({ year, month }, { overflow: "reject" }),
  );
}

/** A PlainYearMonth as a google.type.Date with day 0. */
export function yearMonthToProto(yearMonth: Temporal.PlainYearMonth): DateInit {
  isoOnly("Temporal.PlainYearMonth", yearMonth.calendarId);
  checkYear("Temporal.PlainYearMonth", yearMonth.year, yearMonth.toString());
  return { year: yearMonth.year, month: yearMonth.month, day: 0 };
}

/** A google.type.Date with year 0 and a month and day as a PlainMonthDay. */
export function monthDayFromProto(date: WireDate, path: string): Temporal.PlainMonthDay {
  const { year, month, day } = date;
  if (year !== 0 || month === 0 || day === 0) {
    throw new DomainDecodeError(
      path,
      `Date ${describeDate(date)} is not a month and day: the field is declared DATE_FORM_MONTH_DAY, which needs year 0, a month and a day`,
    );
  }
  return decodeDate(path, () =>
    temporal().PlainMonthDay.from({ month, day }, { overflow: "reject" }),
  );
}

/** A PlainMonthDay as a google.type.Date with year 0. */
export function monthDayToProto(monthDay: Temporal.PlainMonthDay): DateInit {
  isoOnly("Temporal.PlainMonthDay", monthDay.calendarId);
  // In the ISO calendar the month codes are M01..M12.
  return { year: 0, month: Number(monthDay.monthCode.slice(1)), day: monthDay.day };
}

/**
 * A google.type.TimeOfDay as a PlainTime. Throws on hours 24 and seconds 60,
 * which TimeOfDay allows (for closing times and leap seconds) and PlainTime
 * can't hold.
 */
export function timeOfDayFromProto(time: WireTimeOfDay, path: string): Temporal.PlainTime {
  const { hours, minutes, seconds, nanos } = time;
  if (!Number.isInteger(nanos) || nanos < 0 || nanos > 999_999_999) {
    throw new DomainDecodeError(path, `TimeOfDay nanos ${nanos} is outside 0..999999999`);
  }
  try {
    return temporal().PlainTime.from(
      { hour: hours, minute: minutes, second: seconds, ...subsecond(nanos) },
      { overflow: "reject" },
    );
  } catch (error) {
    throw new DomainDecodeError(
      path,
      `TimeOfDay ${hours}:${minutes}:${seconds}.${nanos} is not a valid time: ${errorMessage(error)}`,
    );
  }
}

/** A PlainTime as a google.type.TimeOfDay. */
export function timeOfDayToProto(time: Temporal.PlainTime): TimeOfDayInit {
  return {
    hours: time.hour,
    minutes: time.minute,
    seconds: time.second,
    nanos: time.millisecond * 1_000_000 + time.microsecond * 1_000 + time.nanosecond,
  };
}

/**
 * A google.type.DateTime as a Temporal type:
 * - with `time_zone`, a ZonedDateTime in that zone; a wall-clock time that the
 *   zone skips or repeats resolves as Temporal's `"compatible"` does (the
 *   earlier of a repeated hour, the later side of a gap);
 * - with `utc_offset`, a ZonedDateTime in the fixed-offset zone (`+05:30`);
 *   the offset must be whole minutes;
 * - with neither, a PlainDateTime (local time).
 *
 * Throws on year 0 (DateTime's "no year"), hours 24 and seconds 60.
 */
export function dateTimeFromProto(
  dateTime: WireDateTime,
  path: string,
): Temporal.ZonedDateTime | Temporal.PlainDateTime {
  const { year, month, day, hours, minutes, seconds, nanos } = dateTime;
  if (year === 0) {
    throw new DomainDecodeError(path, "DateTime has no year (year 0), which Temporal can't hold");
  }
  if (!Number.isInteger(nanos) || nanos < 0 || nanos > 999_999_999) {
    throw new DomainDecodeError(path, `DateTime nanos ${nanos} is outside 0..999999999`);
  }
  let local: Temporal.PlainDateTime;
  try {
    local = temporal().PlainDateTime.from(
      { year, month, day, hour: hours, minute: minutes, second: seconds, ...subsecond(nanos) },
      { overflow: "reject" },
    );
  } catch (error) {
    throw new DomainDecodeError(
      path,
      `DateTime is not a valid date and time: ${errorMessage(error)}`,
    );
  }
  const offset = dateTime.timeOffset;
  switch (offset.case) {
    case undefined:
      return local;
    case "timeZone":
      return local.toZonedDateTime(timeZoneFromProto(offset.value, `${path}.time_zone`), {
        disambiguation: "compatible",
      });
    case "utcOffset":
      return local.toZonedDateTime(
        offsetZone(offset.value.seconds, offset.value.nanos, `${path}.utc_offset`),
      );
  }
}

/**
 * A ZonedDateTime or PlainDateTime as a google.type.DateTime: a fixed-offset
 * zone (`+05:30`) becomes `utc_offset`, a named zone (`Europe/Paris`, `UTC`)
 * `time_zone`, and a PlainDateTime neither.
 */
export function dateTimeToProto(
  dateTime: Temporal.ZonedDateTime | Temporal.PlainDateTime,
): DateTimeInit {
  isoOnly(
    isZoned(dateTime) ? "Temporal.ZonedDateTime" : "Temporal.PlainDateTime",
    dateTime.calendarId,
  );
  checkYear("DateTime", dateTime.year, dateTime.toString());
  const fields = {
    year: dateTime.year,
    month: dateTime.month,
    day: dateTime.day,
    hours: dateTime.hour,
    minutes: dateTime.minute,
    seconds: dateTime.second,
    nanos: dateTime.millisecond * 1_000_000 + dateTime.microsecond * 1_000 + dateTime.nanosecond,
  };
  if (!isZoned(dateTime)) {
    return { ...fields, timeOffset: { case: undefined } };
  }
  const zone = dateTime.timeZoneId;
  const match = OFFSET_ZONE.exec(zone);
  if (match === null) {
    return { ...fields, timeOffset: { case: "timeZone", value: { id: zone } } };
  }
  const [, sign, hourDigits, minuteDigits] = match;
  const offsetSeconds = BigInt(Number(hourDigits) * 3_600 + Number(minuteDigits) * 60);
  return {
    ...fields,
    timeOffset: {
      case: "utcOffset",
      value: { seconds: sign === "-" ? -offsetSeconds : offsetSeconds, nanos: 0 },
    },
  };
}

/**
 * A google.type.TimeZone as its IANA id (`America/New_York`), checked against
 * the Temporal implementation's time zone database. `version` is dropped: Temporal
 * always uses the database it ships with.
 */
export function timeZoneFromProto(timeZone: WireTimeZone, path: string): string {
  checkTimeZone(timeZone.id, (reason) => new DomainDecodeError(path, reason));
  return timeZone.id;
}

/** An IANA time zone id as a google.type.TimeZone; throws on an id Temporal doesn't know. */
export function timeZoneToProto(id: string): TimeZoneInit {
  checkTimeZone(id, (reason) => new DomainEncodeError("time zone", reason));
  return { id };
}

/** A google.type.DayOfWeek as 1 (Monday) to 7 (Sunday); DAY_OF_WEEK_UNSPECIFIED is null. */
export function dayOfWeekFromProto(day: number, path: string): DayOfWeekNumber | null {
  if (day === 0) {
    return null;
  }
  if (isDayOfWeek(day)) {
    return day;
  }
  throw new DomainDecodeError(path, `DayOfWeek ${day} is not 1 (Monday) to 7 (Sunday)`);
}

/** 1 (Monday) to 7 (Sunday) as a google.type.DayOfWeek; null is DAY_OF_WEEK_UNSPECIFIED. */
export function dayOfWeekToProto(day: DayOfWeekNumber | null): number {
  return day ?? 0;
}

/** A google.type.Month as 1 (January) to 12; MONTH_UNSPECIFIED is null. */
export function monthFromProto(month: number, path: string): MonthNumber | null {
  if (month === 0) {
    return null;
  }
  if (isMonth(month)) {
    return month;
  }
  throw new DomainDecodeError(path, `Month ${month} is not 1 (January) to 12 (December)`);
}

/** 1 (January) to 12 as a google.type.Month; null is MONTH_UNSPECIFIED. */
export function monthToProto(month: MonthNumber | null): number {
  return month ?? 0;
}

function isDayOfWeek(day: number): day is DayOfWeekNumber {
  return Number.isInteger(day) && day >= 1 && day <= 7;
}

function isMonth(month: number): month is MonthNumber {
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

function isZoned(
  dateTime: Temporal.ZonedDateTime | Temporal.PlainDateTime,
): dateTime is Temporal.ZonedDateTime {
  return "timeZoneId" in dateTime;
}

function offsetZone(seconds: bigint, nanos: number, path: string): string {
  if (nanos !== 0 || seconds % 60n !== 0n) {
    throw new DomainDecodeError(path, `UTC offset ${seconds}s ${nanos}ns is not whole minutes`);
  }
  const magnitude = seconds < 0n ? -seconds : seconds;
  if (magnitude >= 86_400n) {
    throw new DomainDecodeError(path, `UTC offset ${seconds}s is not within ±24 hours`);
  }
  const totalMinutes = Number(magnitude / 60n);
  const hours = String(Math.trunc(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${seconds < 0n ? "-" : "+"}${hours}:${minutes}`;
}

function checkTimeZone(id: string, fail: (reason: string) => Error): void {
  if (id === "") {
    throw fail("time zone id is empty");
  }
  try {
    new (temporal().ZonedDateTime)(0n, id);
  } catch (error) {
    throw fail(`"${id}" is not a time zone this Temporal knows: ${errorMessage(error)}`);
  }
}

function decodeDate<T>(path: string, build: () => T): T {
  try {
    return build();
  } catch (error) {
    throw new DomainDecodeError(path, `Date is not a valid date: ${errorMessage(error)}`);
  }
}

function isoOnly(what: string, calendarId: string): void {
  if (calendarId !== ISO_CALENDAR) {
    throw new DomainEncodeError(
      what,
      `calendar "${calendarId}" can't be encoded; google.type values are ISO 8601 (convert with withCalendar("iso8601"))`,
    );
  }
}

function checkYear(what: string, year: number, shown: string): void {
  if (year < 1 || year > 9999) {
    throw new DomainEncodeError(what, `${shown} is outside years 1..9999`);
  }
}

function describeDate(date: WireDate): string {
  return `{year: ${date.year}, month: ${date.month}, day: ${date.day}}`;
}

function subsecond(nanos: number): {
  millisecond: number;
  microsecond: number;
  nanosecond: number;
} {
  return {
    millisecond: Math.trunc(nanos / 1_000_000),
    microsecond: Math.trunc((nanos % 1_000_000) / 1_000),
    nanosecond: nanos % 1_000,
  };
}
