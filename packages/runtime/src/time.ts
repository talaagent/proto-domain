// google.protobuf.Timestamp ↔ Temporal.Instant,
// google.protobuf.Duration ↔ Temporal.Duration (time units only),
// talaagent.domain.v1.CalendarDuration ↔ Temporal.Duration (any units).

import { DomainDecodeError, DomainEncodeError, errorMessage } from "./errors.js";
import { type Temporal, temporal } from "./temporal.js";
import type { WireCalendarDuration, WireDuration, WireTimestamp } from "./wire.js";

const NANOS_PER_SECOND = 1_000_000_000n;
// 0001-01-01T00:00:00Z and 9999-12-31T23:59:59Z: the range google.protobuf.Timestamp allows.
const MIN_TIMESTAMP_SECONDS = -62_135_596_800n;
const MAX_TIMESTAMP_SECONDS = 253_402_300_799n;
// About 10,000 years: the range google.protobuf.Duration allows.
const MAX_DURATION_SECONDS = 315_576_000_000n;
const MAX_NANOS = 999_999_999;

/** A plain object for the wire Timestamp, which `create()` and generated init shapes accept. */
export interface TimestampInit {
  seconds: bigint;
  nanos: number;
}

/** A plain object for the wire Duration. */
export interface DurationInit {
  seconds: bigint;
  nanos: number;
}

/** A plain object for the wire CalendarDuration. */
export interface CalendarDurationInit {
  years: bigint;
  months: bigint;
  weeks: bigint;
  days: bigint;
  hours: bigint;
  minutes: bigint;
  seconds: bigint;
  nanos: number;
}

/** A google.protobuf.Timestamp as a Temporal.Instant; throws on an out-of-range value. */
export function timestampFromProto(timestamp: WireTimestamp, path: string): Temporal.Instant {
  const { seconds, nanos } = timestamp;
  if (seconds < MIN_TIMESTAMP_SECONDS || seconds > MAX_TIMESTAMP_SECONDS) {
    throw new DomainDecodeError(
      path,
      `Timestamp seconds ${seconds} is outside 0001-01-01..9999-12-31`,
    );
  }
  if (!Number.isInteger(nanos) || nanos < 0 || nanos > MAX_NANOS) {
    throw new DomainDecodeError(path, `Timestamp nanos ${nanos} is outside 0..999999999`);
  }
  return temporal().Instant.fromEpochNanoseconds(seconds * NANOS_PER_SECOND + BigInt(nanos));
}

/** A Temporal.Instant as a google.protobuf.Timestamp; throws outside the Timestamp range. */
export function timestampToProto(instant: Temporal.Instant): TimestampInit {
  const epochNanoseconds = instant.epochNanoseconds;
  let seconds = epochNanoseconds / NANOS_PER_SECOND;
  let nanos = epochNanoseconds % NANOS_PER_SECOND;
  if (nanos < 0n) {
    seconds -= 1n;
    nanos += NANOS_PER_SECOND;
  }
  if (seconds < MIN_TIMESTAMP_SECONDS || seconds > MAX_TIMESTAMP_SECONDS) {
    throw new DomainEncodeError(
      "Temporal.Instant",
      `${instant.toString()} is outside the Timestamp range 0001-01-01..9999-12-31`,
    );
  }
  return { seconds, nanos: Number(nanos) };
}

/**
 * A google.protobuf.Duration as a Temporal.Duration in hours and smaller units
 * (`PT26H3.5S`, never `P1DT2H`): a Duration is an exact length of time, and a
 * day is not always 24 hours.
 */
export function durationFromProto(duration: WireDuration, path: string): Temporal.Duration {
  const { seconds, nanos } = duration;
  if (seconds < -MAX_DURATION_SECONDS || seconds > MAX_DURATION_SECONDS) {
    throw new DomainDecodeError(path, `Duration seconds ${seconds} is outside ±315576000000`);
  }
  if (!Number.isInteger(nanos) || nanos < -MAX_NANOS || nanos > MAX_NANOS) {
    throw new DomainDecodeError(path, `Duration nanos ${nanos} is outside ±999999999`);
  }
  if ((seconds > 0n && nanos < 0) || (seconds < 0n && nanos > 0)) {
    throw new DomainDecodeError(
      path,
      `Duration seconds ${seconds} and nanos ${nanos} differ in sign`,
    );
  }
  return temporal().Duration.from(timeFields(seconds, nanos));
}

/**
 * A Temporal.Duration as a google.protobuf.Duration. Throws when it has years,
 * months, weeks or days (use a CalendarDuration field for those, or
 * `duration.round({ largestUnit: "hours", relativeTo })` first), or when it
 * is outside the Duration range.
 */
export function durationToProto(duration: Temporal.Duration): DurationInit {
  if (
    duration.years !== 0 ||
    duration.months !== 0 ||
    duration.weeks !== 0 ||
    duration.days !== 0
  ) {
    throw new DomainEncodeError(
      "Temporal.Duration",
      `${duration.toString()} has calendar units (years, months, weeks or days), which google.protobuf.Duration can't hold; use talaagent.domain.v1.CalendarDuration or round to hours`,
    );
  }
  const total =
    BigInt(duration.hours) * 3_600n * NANOS_PER_SECOND +
    BigInt(duration.minutes) * 60n * NANOS_PER_SECOND +
    BigInt(duration.seconds) * NANOS_PER_SECOND +
    BigInt(duration.milliseconds) * 1_000_000n +
    BigInt(duration.microseconds) * 1_000n +
    BigInt(duration.nanoseconds);
  // BigInt division and remainder truncate toward zero, so both parts share the sign.
  const seconds = total / NANOS_PER_SECOND;
  const nanos = Number(total % NANOS_PER_SECOND);
  if (seconds < -MAX_DURATION_SECONDS || seconds > MAX_DURATION_SECONDS) {
    throw new DomainEncodeError(
      "Temporal.Duration",
      `${duration.toString()} is outside the Duration range of ±315576000000 seconds`,
    );
  }
  return { seconds, nanos };
}

/**
 * A talaagent.domain.v1.CalendarDuration as a Temporal.Duration with the same
 * units, unbalanced: `P1M` stays one month, `PT90M` stays 90 minutes.
 */
export function calendarDurationFromProto(
  duration: WireCalendarDuration,
  path: string,
): Temporal.Duration {
  const { nanos } = duration;
  if (!Number.isInteger(nanos) || nanos < -MAX_NANOS || nanos > MAX_NANOS) {
    throw new DomainDecodeError(path, `CalendarDuration nanos ${nanos} is outside ±999999999`);
  }
  const fields = {
    years: safeNumber(duration.years, "years", path),
    months: safeNumber(duration.months, "months", path),
    weeks: safeNumber(duration.weeks, "weeks", path),
    days: safeNumber(duration.days, "days", path),
    hours: safeNumber(duration.hours, "hours", path),
    minutes: safeNumber(duration.minutes, "minutes", path),
    seconds: safeNumber(duration.seconds, "seconds", path),
    ...subsecondFields(nanos),
  };
  try {
    return temporal().Duration.from(fields);
  } catch (error) {
    throw new DomainDecodeError(
      path,
      `CalendarDuration is not a valid duration: ${errorMessage(error)}`,
    );
  }
}

/**
 * A Temporal.Duration as a talaagent.domain.v1.CalendarDuration, keeping its
 * units. Milliseconds, microseconds and nanoseconds fold into `seconds` and
 * `nanos`, the only sub-second precision the message has.
 */
export function calendarDurationToProto(duration: Temporal.Duration): CalendarDurationInit {
  const subsecond =
    BigInt(duration.milliseconds) * 1_000_000n +
    BigInt(duration.microseconds) * 1_000n +
    BigInt(duration.nanoseconds);
  return {
    years: BigInt(duration.years),
    months: BigInt(duration.months),
    weeks: BigInt(duration.weeks),
    days: BigInt(duration.days),
    hours: BigInt(duration.hours),
    minutes: BigInt(duration.minutes),
    seconds: BigInt(duration.seconds) + subsecond / NANOS_PER_SECOND,
    nanos: Number(subsecond % NANOS_PER_SECOND),
  };
}

interface TimeFields {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  microseconds: number;
  nanoseconds: number;
}

function timeFields(totalSeconds: bigint, nanos: number): TimeFields {
  const hours = totalSeconds / 3_600n;
  const minutes = (totalSeconds % 3_600n) / 60n;
  const seconds = totalSeconds % 60n;
  return {
    hours: Number(hours),
    minutes: Number(minutes),
    seconds: Number(seconds),
    ...subsecondFields(nanos),
  };
}

function subsecondFields(
  nanos: number,
): Pick<TimeFields, "milliseconds" | "microseconds" | "nanoseconds"> {
  return {
    milliseconds: Math.trunc(nanos / 1_000_000),
    microseconds: Math.trunc((nanos % 1_000_000) / 1_000),
    nanoseconds: nanos % 1_000,
  };
}

function safeNumber(value: bigint, unit: string, path: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new DomainDecodeError(
      path,
      `CalendarDuration ${unit} ${value} is too large for Temporal`,
    );
  }
  return Number(value);
}
