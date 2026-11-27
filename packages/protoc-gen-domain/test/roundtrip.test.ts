// The generated codecs on real values: decode a protobuf-es message, encode
// the domain value back, and compare over the binary encoding.

import { create, type DescMessage, type MessageShape, toBinary } from "@bufbuild/protobuf";
import { DomainDecodeError, type Temporal } from "@talaagent/proto-domain";
import { Temporal as Polyfill } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import {
  AuditStampSchema,
  Visibility as WireVisibility,
} from "./gen/fixtures/shared/v1/shared_pb.js";
import { type Account, accountFromProto, accountToProto } from "./gen/fixtures/v1/brands_domain.js";
import { AccountSchema } from "./gen/fixtures/v1/brands_pb.js";
import {
  enumFieldsFromProto,
  enumFieldsToProto,
  levelToProto,
  statusFromProto,
} from "./gen/fixtures/v1/enums_domain.js";
import {
  EnumFieldsSchema,
  Level as WireLevel,
  Priority as WirePriority,
  Status as WireStatus,
} from "./gen/fixtures/v1/enums_pb.js";
import { extrasFromProto, extrasToProto } from "./gen/fixtures/v1/extras_domain.js";
import { ExtrasSchema } from "./gen/fixtures/v1/extras_pb.js";
import { legacyFromProto } from "./gen/fixtures/v1/legacy_domain.js";
import { LegacySchema } from "./gen/fixtures/v1/legacy_pb.js";
import {
  containerFromProto,
  containerToProto,
  shapeFromProto,
  shapeToProto,
} from "./gen/fixtures/v1/messages_domain.js";
import {
  Container_ItemSchema,
  ContainerSchema,
  ShapeSchema,
} from "./gen/fixtures/v1/messages_pb.js";
import { scalarsFromProto, scalarsToProto } from "./gen/fixtures/v1/scalars_domain.js";
import { ScalarsSchema } from "./gen/fixtures/v1/scalars_pb.js";
import { AccountServiceCodecs } from "./gen/fixtures/v1/service_domain.js";
import { GetAccountResponseSchema } from "./gen/fixtures/v1/service_pb.js";
import {
  calendarTypesFromProto,
  calendarTypesToProto,
  protobufTypesFromProto,
  protobufTypesToProto,
  valueTypesFromProto,
  valueTypesToProto,
} from "./gen/fixtures/v1/well_known_domain.js";
import {
  CalendarTypesSchema,
  ProtobufTypesSchema,
  ValueTypesSchema,
} from "./gen/fixtures/v1/well_known_pb.js";
import type { DayOfWeek } from "./gen/google/type/dayofweek_pb.js";

/** Two messages are equal on the wire. */
function expectSameWire<Desc extends DescMessage>(
  schema: Desc,
  actual: MessageShape<Desc>,
  expected: MessageShape<Desc>,
): void {
  expect(toBinary(schema, actual)).toEqual(toBinary(schema, expected));
}

const timestamp = { seconds: 1_767_225_600n, nanos: 5_000 };

function scalarsWire() {
  return create(ScalarsSchema, {
    int64Value: -9_007_199_254_740_993n,
    uint64Value: 18_446_744_073_709_551_615n,
    doubleValue: 0.5,
    bytesValue: new Uint8Array([1, 2]),
    displayName: "",
    handle: "river",
    countryCode: "NZ",
    version: 7n,
    locale: "en-NZ",
  });
}

describe("presence and strings", () => {
  it("reads an implicit empty string as null and writes null back as empty", () => {
    const domain = scalarsFromProto(scalarsWire());
    expect(domain.nickname).toBeNull();
    // Required: "" stays "".
    expect(domain.displayName).toBe("");
    expect(domain.middleName).toBeNull();
    expect(domain.luckyNumber).toBeNull();
    expect(domain.int64Value).toBe(-9_007_199_254_740_993n);
    expectSameWire(ScalarsSchema, scalarsToProto(domain), scalarsWire());
  });

  it("keeps set optional values, zero included", () => {
    const wire = create(ScalarsSchema, {
      ...scalarsWire(),
      nickname: "Kea",
      luckyNumber: 0,
      subscribed: false,
      middleName: "",
    });
    const domain = scalarsFromProto(wire);
    expect(domain).toMatchObject({
      nickname: "Kea",
      luckyNumber: 0,
      subscribed: false,
      middleName: "",
    });
    expectSameWire(ScalarsSchema, scalarsToProto(domain), wire);
  });

  it("throws on an unset required optional field", () => {
    const wire = create(ScalarsSchema, { ...scalarsWire(), version: undefined });
    expect(() => scalarsFromProto(wire)).toThrow(DomainDecodeError);
    expect(() => scalarsFromProto(wire)).toThrow("fixtures.v1.Scalars.version");
  });

  it("lets nullable properties be left out when encoding", () => {
    const wire = scalarsToProto({
      ...scalarsFromProto(scalarsWire()),
      nickname: undefined,
      middleName: undefined,
    });
    expect(wire.nickname).toBe("");
    expect(wire.middleName).toBeUndefined();
  });

  it("reads proto2 fields as their defaults", () => {
    const domain = legacyFromProto(create(LegacySchema, { count: 3 }));
    expect(domain).toEqual({ name: "", count: 3, label: "none", parent: null });
  });
});

describe("enums", () => {
  it("maps values to literals and UNSPECIFIED to null", () => {
    const wire = create(EnumFieldsSchema, {
      status: WireStatus.UNSPECIFIED,
      requiredStatus: WireStatus.ON_HOLD,
      priority: WirePriority.NORMAL,
      level: WireLevel.LOW,
      history: [WireStatus.ACTIVE, WireStatus.ARCHIVED],
      priorities: { triage: WirePriority.URGENT },
    });
    const domain = enumFieldsFromProto(wire);
    expect(domain).toMatchObject({
      status: null,
      requiredStatus: "on_hold",
      optionalStatus: null,
      priority: "normal",
      level: "low",
      history: ["active", "archived"],
      priorities: { triage: "urgent" },
      shade: null,
      kind: null,
    });
    expectSameWire(EnumFieldsSchema, enumFieldsToProto(domain), wire);
  });

  it("throws on an unset required enum, an UNSPECIFIED list entry and an unknown number", () => {
    expect(() => enumFieldsFromProto(create(EnumFieldsSchema))).toThrow(
      "fixtures.v1.EnumFields.required_status",
    );
    expect(() =>
      enumFieldsFromProto(
        create(EnumFieldsSchema, {
          requiredStatus: WireStatus.ACTIVE,
          history: [WireStatus.UNSPECIFIED],
        }),
      ),
    ).toThrow("fixtures.v1.EnumFields.history[]");
    expect(() => statusFromProto(42 as WireStatus, "somewhere")).toThrow(
      "unknown fixtures.v1.Status value 42",
    );
  });

  it("decodes an alias to its first name and encodes either", () => {
    expect(levelToProto("low")).toBe(WireLevel.LOW);
    expect(levelToProto("minimal")).toBe(WireLevel.LOW);
  });
});

describe("messages, lists, maps and oneofs", () => {
  function containerWire() {
    return create(ContainerSchema, {
      primary: { label: "first", quantity: 2 },
      items: [{ label: "second" }],
      tags: ["red"],
      checkpoints: [timestamp],
      itemsById: { first: { label: "first" } },
      namesByNumber: { 7: "seven" },
      timesById: { "9007199254740993": timestamp },
      flags: { true: "yes" },
      created: { actor: "reviewer", at: timestamp },
      visibility: WireVisibility.PUBLIC,
      edits: [create(AuditStampSchema, { actor: "editor" })],
    });
  }

  it("round-trips nested, repeated, mapped and cross-package values", () => {
    const domain = containerFromProto(containerWire());
    expect(domain.featured).toBeNull();
    expect(domain.primary).toEqual({ label: "first", quantity: 2 });
    expect(domain.checkpoints[0]?.toString()).toBe("2026-01-01T00:00:00.000005Z");
    expect(domain.timesById["9007199254740993"]?.epochNanoseconds).toBe(1_767_225_600_000_005_000n);
    expect(domain.created).toMatchObject({ actor: "reviewer" });
    expect(domain.created?.at?.toString()).toBe("2026-01-01T00:00:00.000005Z");
    expect(domain.edits[0]).toEqual({ actor: "editor", at: null });
    expect(domain.visibility).toBe("public");
    expectSameWire(ContainerSchema, containerToProto(domain), containerWire());
  });

  it("throws on an unset required message with its path", () => {
    expect(() => containerFromProto(create(ContainerSchema))).toThrow(
      "fixtures.v1.Container.primary",
    );
    expect(() =>
      containerFromProto(
        create(ContainerSchema, {
          primary: create(Container_ItemSchema, { label: "x" }),
          checkpoints: [{ nanos: -1 }],
        }),
      ),
    ).toThrow("fixtures.v1.Container.checkpoints[]");
  });

  it("flattens oneofs to discriminated unions", () => {
    const wire = create(ShapeSchema, {
      kind: { case: "rect", value: { width: 2, height: 3 } },
      stamp: { case: "drawnAt", value: timestamp },
    });
    const domain = shapeFromProto(wire);
    expect(domain.kind).toEqual({ case: "rect", rect: { width: 2, height: 3 } });
    expect(domain.stamp.case === "drawnAt" && domain.stamp.drawnAt.toString()).toBe(
      "2026-01-01T00:00:00.000005Z",
    );
    expectSameWire(ShapeSchema, shapeToProto(domain), wire);

    const empty = shapeFromProto(create(ShapeSchema, { stamp: { case: "frame", value: 12n } }));
    expect(empty).toEqual({ kind: null, stamp: { case: "frame", frame: 12n } });
    expect(shapeToProto({ stamp: { case: "frame", frame: 12n } }).kind).toEqual({
      case: undefined,
    });
  });

  it("throws on an unset required oneof", () => {
    expect(() => shapeFromProto(create(ShapeSchema))).toThrow(
      "fixtures.v1.Shape.stamp: required field is not set",
    );
  });
});

describe("well-known and google.type values", () => {
  it("maps Timestamp, Duration, wrappers and Struct", () => {
    const wire = create(ProtobufTypesSchema, {
      createdAt: timestamp,
      timeout: { seconds: 90n, nanos: 500_000_000 },
      label: "",
      count: 0n,
      metadata: { owner: "team", tags: ["a", "b"], nested: { depth: 2 } },
      laps: [{ seconds: 1n }],
    });
    const domain = protobufTypesFromProto(wire);
    expect(domain.createdAt.toString()).toBe("2026-01-01T00:00:00.000005Z");
    expect(domain.deletedAt).toBeNull();
    expect(domain.timeout?.total("milliseconds")).toBe(90_500);
    // A set wrapper keeps its zero value.
    expect(domain.label).toBe("");
    expect(domain.count).toBe(0n);
    expect(domain.enabled).toBeNull();
    expect(domain.metadata).toEqual({ owner: "team", tags: ["a", "b"], nested: { depth: 2 } });
    expectSameWire(ProtobufTypesSchema, protobufTypesToProto(domain), wire);
  });

  it("maps the calendar types and the Date forms", () => {
    const wire = create(CalendarTypesSchema, {
      birthDate: { year: 1990, month: 2, day: 28 },
      cardExpiry: { year: 2029, month: 11, day: 0 },
      anniversary: { year: 0, month: 2, day: 29 },
      startDate: { year: 2026, month: 3, day: 1 },
      opensAt: { hours: 9, minutes: 30 },
      startsAt: {
        year: 2026,
        month: 3,
        day: 29,
        hours: 2,
        minutes: 30,
        timeOffset: { case: "timeZone", value: { id: "Pacific/Auckland" } },
      },
      timeZone: { id: "Europe/Lisbon" },
      weekday: 1,
      month: 12,
      workdays: [1, 2, 3],
      window: { startTime: timestamp, endTime: { seconds: timestamp.seconds + 60n } },
      every: { months: 1n, days: 2n },
      holidays: [{ month: 12, day: 25 }],
    });
    const domain = calendarTypesFromProto(wire);
    expect(domain.birthDate?.toString()).toBe("1990-02-28");
    expect(domain.cardExpiry?.toString()).toBe("2029-11");
    expect(domain.anniversary?.toString()).toBe("02-29");
    expect(domain.opensAt?.toString()).toBe("09:30:00");
    expect(domain.startsAt?.toString()).toBe("2026-03-29T02:30:00+13:00[Pacific/Auckland]");
    expect(domain.timeZone).toBe("Europe/Lisbon");
    expect(domain.weekday).toBe(1);
    expect(domain.month).toBe(12);
    expect(domain.window?.end?.toString()).toBe("2026-01-01T00:01:00Z");
    expect(domain.every?.toString()).toBe("P1M2D");
    expect(domain.holidays.map((day) => day.toString())).toEqual(["12-25"]);
    expectSameWire(CalendarTypesSchema, calendarTypesToProto(domain), wire);
  });

  it("enforces the Date form on decode", () => {
    const base = { startDate: { year: 2026, month: 3, day: 1 } };
    expect(() =>
      calendarTypesFromProto(
        create(CalendarTypesSchema, { ...base, cardExpiry: { year: 2029, month: 11, day: 3 } }),
      ),
    ).toThrow("fixtures.v1.CalendarTypes.card_expiry");
    expect(() =>
      calendarTypesFromProto(
        create(CalendarTypesSchema, { ...base, anniversary: { year: 2020, month: 2, day: 29 } }),
      ),
    ).toThrow("fixtures.v1.CalendarTypes.anniversary");
    expect(() =>
      calendarTypesFromProto(create(CalendarTypesSchema, { ...base, weekday: 9 as DayOfWeek })),
    ).toThrow("fixtures.v1.CalendarTypes.weekday");
  });

  it("writes fixed-offset and plain date-times", () => {
    const base = calendarTypesFromProto(
      create(CalendarTypesSchema, { startDate: { year: 2026, month: 3, day: 1 } }),
    );
    const fixed: Temporal.ZonedDateTime = Polyfill.ZonedDateTime.from(
      "2026-05-01T08:00:00+05:30[+05:30]",
    );
    expect(calendarTypesToProto({ ...base, startsAt: fixed }).startsAt?.timeOffset).toMatchObject({
      case: "utcOffset",
      value: { seconds: 19_800n },
    });
    const plain = Polyfill.PlainDateTime.from("2026-05-01T08:00:00");
    const wire = calendarTypesToProto({ ...base, startsAt: plain });
    expect(wire.startsAt?.timeOffset.case).toBeUndefined();
    expect(calendarTypesFromProto(wire).startsAt?.toString()).toBe("2026-05-01T08:00:00");
  });

  it("maps LatLng and Decimal, and passes the other value types through", () => {
    const wire = create(ValueTypesSchema, {
      location: { latitude: -36.85, longitude: 174.76 },
      amount: { value: "12.50" },
      amounts: [{ value: "0.1" }, { value: "-3" }],
      price: { currencyCode: "NZD", units: 12n, nanos: 500_000_000 },
      tint: { red: 0.5, green: 0.25, blue: 1 },
    });
    const domain = valueTypesFromProto(wire);
    expect(domain.location).toEqual({ latitude: -36.85, longitude: 174.76 });
    expect(domain.amount).toBe("12.50");
    expect(domain.amounts).toEqual(["0.1", "-3"]);
    expect(domain.price).toBe(wire.price);
    expect(domain.phone).toBeNull();
    expectSameWire(ValueTypesSchema, valueTypesToProto(domain), wire);
  });
});

describe("brands, extras and services", () => {
  it("brands scalars without changing their values", () => {
    const wire = create(AccountSchema, {
      id: "acct-1",
      balance: 1250n,
      memberIds: ["acct-2"],
      balances: { nzd: 5n },
    });
    const domain: Account = accountFromProto(wire);
    expect(domain).toMatchObject({
      id: "acct-1",
      referrerId: null,
      balance: 1250n,
      creditLimit: null,
      memberIds: ["acct-2"],
    });
    expectSameWire(AccountSchema, accountToProto(domain), wire);
  });

  it("handles required wrappers, Struct and DateTime, and duration maps", () => {
    const wire = create(ExtrasSchema, {
      requiredCount: 0,
      requiredAttributes: {},
      ownerId: "acct-1",
      timeouts: { read: { seconds: 5n } },
      requiredMeeting: { year: 2026, month: 1, day: 2, hours: 10 },
      requiredDay: 5,
      bigTotal: "9007199254740993",
    });
    const domain = extrasFromProto(wire);
    expect(domain).toMatchObject({
      requiredCount: 0,
      requiredAttributes: {},
      parentId: null,
      requiredDay: 5,
      bigTotal: "9007199254740993",
    });
    expect(domain.timeouts.read?.toString()).toBe("PT5S");
    expectSameWire(ExtrasSchema, extrasToProto(domain), wire);
    expect(() =>
      extrasFromProto(create(ExtrasSchema, { ...wire, requiredCount: undefined })),
    ).toThrow("fixtures.v1.Extras.required_count");
    expect(() => extrasFromProto(create(ExtrasSchema, { ...wire, requiredDay: 0 }))).toThrow(
      "fixtures.v1.Extras.required_day",
    );
  });

  it("exposes the unary codecs of a service", () => {
    expect(Object.keys(AccountServiceCodecs)).toEqual(["getAccount"]);
    const request = AccountServiceCodecs.getAccount.requestToProto({ id: "acct-1" });
    expect(request.id).toBe("acct-1");
    const response = AccountServiceCodecs.getAccount.responseFromProto(
      create(GetAccountResponseSchema),
    );
    expect(response.account).toBeNull();
  });
});
