// google.type value messages with a domain shape: Interval, LatLng, Decimal.
// The other google.type messages (Money, PhoneNumber, PostalAddress,
// LocalizedText, Color, Fraction) pass through as their generated types.

import { DomainDecodeError, DomainEncodeError } from "./errors.js";
import type { Temporal } from "./temporal.js";
import { type TimestampInit, timestampFromProto, timestampToProto } from "./time.js";
import type { WireDecimal, WireInterval, WireLatLng } from "./wire.js";

/** A google.type.Interval: null `start` or `end` is unbounded on that side. */
export interface Interval {
  readonly start: Temporal.Instant | null;
  readonly end: Temporal.Instant | null;
}

/** A plain object for the wire Interval. */
export interface IntervalInit {
  startTime?: TimestampInit;
  endTime?: TimestampInit;
}

/** A google.type.LatLng: WGS84 degrees. */
export interface LatLng {
  readonly latitude: number;
  readonly longitude: number;
}

/** A plain object for the wire LatLng. */
export interface LatLngInit {
  latitude: number;
  longitude: number;
}

/** A plain object for the wire Decimal. */
export interface DecimalInit {
  value: string;
}

// google.type.Decimal's grammar: sign, digits with an optional point, optional exponent.
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** A google.type.Interval as `{start, end}`; throws when `end` is before `start`. */
export function intervalFromProto(interval: WireInterval, path: string): Interval {
  const start =
    interval.startTime === undefined
      ? null
      : timestampFromProto(interval.startTime, `${path}.start_time`);
  const end =
    interval.endTime === undefined
      ? null
      : timestampFromProto(interval.endTime, `${path}.end_time`);
  if (start !== null && end !== null && end.epochNanoseconds < start.epochNanoseconds) {
    throw new DomainDecodeError(
      path,
      `Interval ends (${end.toString()}) before it starts (${start.toString()})`,
    );
  }
  return { start, end };
}

/** `{start, end}` as a google.type.Interval; throws when `end` is before `start`. */
export function intervalToProto(interval: Interval): IntervalInit {
  const { start, end } = interval;
  if (start !== null && end !== null && end.epochNanoseconds < start.epochNanoseconds) {
    throw new DomainEncodeError(
      "Interval",
      `end ${end.toString()} is before start ${start.toString()}`,
    );
  }
  const init: IntervalInit = {};
  if (start !== null) {
    init.startTime = timestampToProto(start);
  }
  if (end !== null) {
    init.endTime = timestampToProto(end);
  }
  return init;
}

/** A google.type.LatLng as `{latitude, longitude}`; throws outside ±90 / ±180 degrees. */
export function latLngFromProto(latLng: WireLatLng, path: string): LatLng {
  const reason = checkLatLng(latLng);
  if (reason !== null) {
    throw new DomainDecodeError(path, reason);
  }
  return { latitude: latLng.latitude, longitude: latLng.longitude };
}

/** `{latitude, longitude}` as a google.type.LatLng; throws outside ±90 / ±180 degrees. */
export function latLngToProto(latLng: LatLng): LatLngInit {
  const reason = checkLatLng(latLng);
  if (reason !== null) {
    throw new DomainEncodeError("LatLng", reason);
  }
  return { latitude: latLng.latitude, longitude: latLng.longitude };
}

/**
 * A google.type.Decimal as its decimal string (`"-12.50"`, `"1e3"`), unchanged:
 * never a float, so no precision is lost. Parse it with a decimal library.
 */
export function decimalFromProto(decimal: WireDecimal, path: string): string {
  if (!DECIMAL.test(decimal.value)) {
    throw new DomainDecodeError(path, `Decimal "${decimal.value}" is not a decimal number`);
  }
  return decimal.value;
}

/** A decimal string as a google.type.Decimal; throws when it isn't one. */
export function decimalToProto(value: string): DecimalInit {
  if (!DECIMAL.test(value)) {
    throw new DomainEncodeError("Decimal", `"${value}" is not a decimal number`);
  }
  return { value };
}

function checkLatLng(latLng: LatLng): string | null {
  const { latitude, longitude } = latLng;
  if (!(latitude >= -90 && latitude <= 90)) {
    return `latitude ${latitude} is outside -90..90`;
  }
  if (!(longitude >= -180 && longitude <= 180)) {
    return `longitude ${longitude} is outside -180..180`;
  }
  return null;
}
