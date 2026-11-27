// The wire shapes the converters read, written structurally so the runtime
// needs no generated code: protobuf-es's google.protobuf types and the
// google.type types protoc-gen-es generates from googleapis all match them.

/** google.protobuf.Timestamp */
export interface WireTimestamp {
  readonly seconds: bigint;
  readonly nanos: number;
}

/** google.protobuf.Duration */
export interface WireDuration {
  readonly seconds: bigint;
  readonly nanos: number;
}

/** google.type.Date */
export interface WireDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** google.type.TimeOfDay */
export interface WireTimeOfDay {
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly nanos: number;
}

/** google.type.TimeZone */
export interface WireTimeZone {
  readonly id: string;
  readonly version: string;
}

/** google.type.DateTime */
export interface WireDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly nanos: number;
  readonly timeOffset:
    | { readonly case: "utcOffset"; readonly value: WireDuration }
    | { readonly case: "timeZone"; readonly value: WireTimeZone }
    | { readonly case: undefined; readonly value?: undefined };
}

/** google.type.Interval */
export interface WireInterval {
  readonly startTime?: WireTimestamp | undefined;
  readonly endTime?: WireTimestamp | undefined;
}

/** google.type.LatLng */
export interface WireLatLng {
  readonly latitude: number;
  readonly longitude: number;
}

/** google.type.Decimal */
export interface WireDecimal {
  readonly value: string;
}

/** talaagent.domain.v1.CalendarDuration */
export interface WireCalendarDuration {
  readonly years: bigint;
  readonly months: bigint;
  readonly weeks: bigint;
  readonly days: bigint;
  readonly hours: bigint;
  readonly minutes: bigint;
  readonly seconds: bigint;
  readonly nanos: number;
}
