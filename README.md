# proto-domain

Clean TypeScript domain types for [protobuf-es](https://github.com/bufbuild/protobuf-es).

`protoc-gen-domain` is a protoc / buf plugin that runs after `protoc-gen-es`.
For every message it writes a plain domain interface and a pair of codecs
(`fromProto` / `toProto`). For every service it writes a `<Service>Codecs` map.
The domain types use:

- **Temporal**: `Temporal.Instant` for a Timestamp, `Temporal.PlainDate` for a
  Date, `Temporal.Duration` for a Duration, and so on.
- **`null` for absent**, never `undefined`. Nullability follows proto3
  `optional`, message presence and `(buf.validate.field).required`.
- **string-literal unions** for enums, without the `UNSPECIFIED` value.
- **flat discriminated unions** for oneofs.
- **brands**, opt in per field: `TaskId` instead of `string`.

The runtime, `@talaagent/proto-domain`, holds the converters. It also gives you
a ConnectRPC client that validates responses with protovalidate and speaks domain
types, plus `validateThen` for query `select`s.

| Package                                                      | What it is                                |
| ------------------------------------------------------------ | ----------------------------------------- |
| [`@talaagent/protoc-gen-domain`](packages/protoc-gen-domain) | The plugin. A dev dependency.             |
| [`@talaagent/proto-domain`](packages/runtime)                | The runtime the generated code imports.   |
| [`buf.build/talaagent/domain`](proto)                        | The field options and `CalendarDuration`. |

## Why

protobuf-es mirrors the wire format faithfully, which makes it a poor fit for
application code:

- An unset message field is `undefined`, but an unset `string` is `""`.
- A Timestamp is `{ seconds: bigint, nanos: number }`.
- An enum is a number with an `UNSPECIFIED` member that every `switch` has to
  handle.
- A oneof is `{ case, value }`.
- A field that protovalidate requires is still typed optional.

Code that uses these types directly ends up converting and checking them at every
use. proto-domain does that once, at the edge, in generated code.

## Before and after

```proto
message Task {
  string id = 1 [(buf.validate.field).required = true, (talaagent.domain.v1.field).brand = "TaskId"];
  string title = 2 [(buf.validate.field).string.min_len = 1];
  string notes = 3;
  TaskStatus status = 4 [(buf.validate.field).required = true];
  google.type.Date due_date = 5;
  google.protobuf.Timestamp create_time = 6 [(buf.validate.field).required = true];
  google.protobuf.Duration estimate = 7;
  talaagent.domain.v1.CalendarDuration recurrence = 8;
  oneof assignee {
    string user_id = 9;
    string team_name = 10;
  }
}
```

protobuf-es (`tasks_pb.ts`):

```ts
type Task = Message<"example.tasks.v1.Task"> & {
  id: string;
  title: string;
  notes: string; // "" when unset
  status: TaskStatus; // a number, 0 = UNSPECIFIED
  dueDate?: Date; // { year, month, day }
  createTime?: Timestamp; // required, but still optional here
  estimate?: Duration; // { seconds: bigint, nanos }
  recurrence?: CalendarDuration;
  assignee:
    | { case: "userId"; value: string }
    | { case: "teamName"; value: string }
    | { case: undefined; value?: undefined };
};
```

proto-domain (`tasks_domain.ts`):

```ts
interface Task {
  readonly id: TaskId;
  readonly title: string;
  readonly notes: string | null;
  readonly status: "todo" | "in_progress" | "done";
  readonly dueDate: Temporal.PlainDate | null;
  readonly createTime: Temporal.Instant;
  readonly estimate: Temporal.Duration | null;
  readonly recurrence: Temporal.Duration | null;
  readonly assignee:
    | { readonly case: "userId"; readonly userId: string }
    | { readonly case: "teamName"; readonly teamName: string }
    | null;
}
function taskFromProto(input: Task$1): Task;
function taskToProto(value: DomainInit<Task>): Task$1;
const TaskServiceCodecs: { createTask: {...}; listTasks: {...} };
```

The client:

```ts
import { createDomainClient, createValidatedClient } from "@talaagent/proto-domain/connect";

const tasks = createDomainClient(createValidatedClient(TaskService, transport), TaskServiceCodecs);
const { task } = await tasks.createTask({
  title: "Write the docs",
  dueDate: Temporal.PlainDate.from("2026-02-27"),
});
task.createTime.toString(); // "2026-01-01T00:00:00Z", validated as present
```

[examples/basic](examples/basic) is the whole thing as a project, and CI runs
it end to end.

## Install

```sh
pnpm add @talaagent/proto-domain @bufbuild/protobuf temporal-polyfill
pnpm add -D @talaagent/protoc-gen-domain @bufbuild/protoc-gen-es @bufbuild/buf
# for the validated client and validateThen:
pnpm add @bufbuild/protovalidate @connectrpc/connect
```

`temporal-polyfill` is optional where `Temporal` is native. Otherwise, load it once
in one of two ways:

- globally, with `import "temporal-polyfill/global"`;
- explicitly, with `configureTemporal(Temporal)` from `@talaagent/proto-domain`.

The runtime never imports a Temporal implementation itself.

Add the options module to your `buf.yaml`. This step is only needed if you use
the field options or `CalendarDuration`.

```yaml
deps:
  - buf.build/talaagent/domain
  - buf.build/bufbuild/protovalidate
```

### buf.gen.yaml

```yaml
version: v2
inputs:
  - directory: proto
plugins:
  - local: protoc-gen-es
    out: src/gen
    opt: [target=ts, import_extension=js]
    include_imports: true
  - local: protoc-gen-domain
    out: src/gen
    opt: [target=ts, import_extension=js]
    include_imports: true
```

Both plugins must write to the same `out`, because each `foo_domain.ts` imports
`./foo_pb.js`. Use `include_imports` on both, so that the `_pb` files of the
imported protos (`talaagent/domain/v1`, `buf/validate`) exist.

### Plugin options

| Option                                                              | Default                   | Meaning                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enum_style`                                                        | `snake`                   | How a value name becomes its literal. With the prefix stripped, `TASK_STATUS_IN_PROGRESS` becomes `in_progress` (`snake`), `IN_PROGRESS` (`screaming`) or `inProgress` (`camel`).                         |
| `brand_import`                                                      | none                      | A module that exports one type per brand name, used instead of the runtime's `Brand<T, Name>`. A relative path is relative to `out`: with `out: src/gen`, `brand_import=../brands.js` is `src/brands.ts`. |
| `runtime_import`                                                    | `@talaagent/proto-domain` | The module the generated code imports the runtime from.                                                                                                                                                   |
| `target`, `import_extension`, `js_import_style`, `map_imports`, ... |                           | protoplugin's standard options, as for protoc-gen-es.                                                                                                                                                     |

## Mapping

### Scalars, enums, oneofs, collections

| Proto                                            | Domain type                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `string`, `bool`, `double`, `float`, 32-bit ints | as protobuf-es: `string`, `boolean`, `number`                                                                   |
| 64-bit ints                                      | `bigint`, or `string` with `[jstype = JS_STRING]`                                                               |
| `bytes`                                          | `Uint8Array`                                                                                                    |
| enum                                             | a union of string literals; an `UNSPECIFIED` zero value becomes `null`                                          |
| `oneof`                                          | `{ case: "a"; a: A } \| { case: "b"; b: B } \| null`, without `null` when it is `(buf.validate.oneof).required` |
| `repeated T`                                     | `readonly T[]`                                                                                                  |
| `map<K, V>`                                      | `{ readonly [key: string]: V }` (keys as protobuf-es gives them)                                                |
| a message of yours                               | its domain interface                                                                                            |
| wrappers (`StringValue`, ...)                    | the scalar, or `null`                                                                                           |
| `google.protobuf.Struct`                         | protobuf-es's `JsonObject`                                                                                      |

An enum whose zero value doesn't end in `UNSPECIFIED` keeps it as a literal.
A number the enum doesn't define throws a `DomainDecodeError`, and so does a
value outside a mapped type's range. The error names the field path.

### Well-known types and google.type

| Proto                                                 | Domain type                                                          | Notes                                                                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `google.protobuf.Timestamp`                           | `Temporal.Instant`                                                   |                                                                                                                                 |
| `google.protobuf.Duration`                            | `Temporal.Duration`                                                  | Time units only (`PT26H`, never `P1DT2H`). Encoding a duration with years, months, weeks or days throws.                        |
| `talaagent.domain.v1.CalendarDuration`                | `Temporal.Duration`                                                  | Every unit, unbalanced: `P1M` stays one month. Use it for "every month", "in 3 days".                                           |
| `google.type.Date`                                    | `Temporal.PlainDate`                                                 | A partial date throws unless the field says which form it is (see below).                                                       |
| `google.type.Date` with `date = DATE_FORM_YEAR_MONTH` | `Temporal.PlainYearMonth`                                            | `day` is 0 on the wire.                                                                                                         |
| `google.type.Date` with `date = DATE_FORM_MONTH_DAY`  | `Temporal.PlainMonthDay`                                             | `year` is 0 on the wire.                                                                                                        |
| `google.type.TimeOfDay`                               | `Temporal.PlainTime`                                                 | `24:00` and leap seconds throw.                                                                                                 |
| `google.type.DateTime`                                | `Temporal.ZonedDateTime \| Temporal.PlainDateTime`                   | `time_zone` gives a zoned value in that zone, `utc_offset` a zoned value in a fixed-offset zone, and neither a `PlainDateTime`. |
| `google.type.TimeZone`                                | `string`                                                             | The IANA id, checked against Temporal's database. `version` is dropped.                                                         |
| `google.type.DayOfWeek`                               | `1 \| 2 \| ... \| 7 \| null`                                         | Temporal's numbering, Monday = 1. `DAY_OF_WEEK_UNSPECIFIED` is `null`.                                                          |
| `google.type.Month`                                   | `1 \| ... \| 12 \| null`                                             | `MONTH_UNSPECIFIED` is `null`.                                                                                                  |
| `google.type.Interval`                                | `{ start: Temporal.Instant \| null; end: Temporal.Instant \| null }` |                                                                                                                                 |
| `google.type.LatLng`                                  | `{ latitude: number; longitude: number }`                            |                                                                                                                                 |
| `google.type.Decimal`                                 | `string`                                                             | The decimal string, unparsed. Use your own decimal library.                                                                     |

These are not mapped. They pass through as their protobuf-es message or enum:

- `google.type.Money`. A mapping is planned; it needs a decimal type to land on.
- `google.type.PhoneNumber`, `PostalAddress`, `LocalizedText`, `Color`,
  `Fraction`, `Expr`, `Quaternion`
- `google.type.CalendarPeriod` (the protobuf-es enum)
- `google.protobuf.Any`, `FieldMask`, `Value`, `ListValue`

A message whose fields are all mapped still gets a domain interface.

Calendar systems aren't mapped. `google.type.Date` and `DateTime` have no
calendar id, so every decoded value is in the ISO 8601 calendar. Encoding a
value in another calendar (`[u-ca=hebrew]`) throws: convert it with
`withCalendar("iso8601")` first. If the calendar matters, keep its id in a
string field of your own.

## Nullability

A field's domain type is nullable (`T | null`) when its proto value can be
absent. Each kind of field behaves as follows.

**Message fields and proto3 `optional` fields** are `T | null`. Mark one as
always set in either of these ways:

- `(buf.validate.field).required = true`
- `(talaagent.domain.v1.field).required = true`, for schemas without
  protovalidate

A required field is then plain `T`, and decoding a message without it throws.

**Implicit-presence strings.** An unset string and an empty string look the same
on the wire. By default `""` decodes to `null`, and `null` encodes as `""`. The
field stays plain `string` when:

- protovalidate rules out the empty string (`string.min_len` or `string.len`
  ≥ 1), or
- the field is `required`.

**Other implicit-presence scalars** (numbers, bools, bytes) are never null. `0`
is `0`.

**Enums** with an `UNSPECIFIED` zero value are `T | null`. A `required` enum
field is `T`, and decoding `UNSPECIFIED` throws.

**Requests.** `toProto` takes a `DomainInit<T>`: every nullable property may be
left out, and is treated as `null`. Use `DomainInit` to build requests:

```ts
tasks.createTask({ title: "Ship it" });
```

The domain client's request type is a `DomainInit`.

**Validation.** The codecs check presence and ranges but no other protovalidate
rule. Full validation happens in either of two places:

- `createValidatedClient`, for responses;
- `validateThen(schema, decode)`, for values from elsewhere (a cache, a query
  `select`).

```ts
import { validateThen } from "@talaagent/proto-domain/validate";

useQuery({
  queryKey,
  queryFn,
  select: validateThen(ListTasksResponseSchema, listTasksResponseFromProto),
});
```

## Brands

A brand turns a scalar into a nominal type. Brands are opt-in per field:

```proto
string owner_id = 1 [(talaagent.domain.v1.field).brand = "UserId"];
repeated string member_ids = 2 [(talaagent.domain.v1.field).brand = "UserId"];
google.protobuf.Int64Value limit = 3 [(talaagent.domain.v1.field).brand = "Cents"];
```

A brand is valid on a string, bytes, integer or wrapper field. On a list it
applies to each element, and on a map to each value.

By default the domain type is the runtime's `Brand<string, "UserId">`. To use
your own brand types, give the plugin `brand_import=../brands.js` and export one
type per name from that module:

```ts
// src/brands.ts
import type { Brand } from "@talaagent/proto-domain";
export type UserId = Brand<string, "UserId">;
```

Brands exist only at compile time: decoding casts the value and checks nothing.

## Deviations and design notes

- **Duration is time-only.** A `google.protobuf.Duration` is an exact number of
  seconds, and a day is not always 24 hours. Decoding never produces days, and
  encoding a value with calendar units throws. For calendar units, use
  `CalendarDuration`, or `duration.round({ largestUnit: "hours", relativeTo })`.
- **CalendarDuration** is a message of our own, because no standard type holds an
  ISO 8601 duration with calendar units. It has `years`, `months`, `weeks`,
  `days`, `hours`, `minutes`, `seconds` and `nanos`, kept unbalanced.
- **Partial dates use `google.type.Date`.** They don't use messages of their own:
  `date = DATE_FORM_YEAR_MONTH` / `DATE_FORM_MONTH_DAY` say which form a field
  holds. The enum values carry the `DATE_FORM_` prefix to satisfy buf's
  `STANDARD` lint.
- **Codecs maps cover unary methods only.** Streaming methods are left out, and so
  is a method whose request or response is a foreign message
  (`google.protobuf.Empty`). Call those on the validated client.
- **Proto2 and editions** fields with explicit presence that protobuf-es types as
  non-optional decode like implicit-presence fields. The same goes for every
  field with a default.
- **`DomainInit` is shallow.** Nested messages are domain values, built as a
  `DomainInit` of their own type if you like, and the codecs encode them.
- **Readonly.** Interface properties are `readonly` and lists are
  `readonly T[]`.
- **No barrel file.** Import from each `_domain.js` file.
- **The runtime depends on `@bufbuild/protobuf`.** The generated code calls
  protobuf-es's `create`, and the runtime reads its types.
- **buf's `directory` strategy.** buf runs the plugin once per directory, so
  every file outside the `google.*`, `buf.validate` and `talaagent.domain.v1`
  packages is assumed to have a `_domain.ts`, exactly as protoc-gen-es assumes for
  `_pb.ts`. Generate all of your protos with both plugins.
- **Requirements.** Built and tested with TypeScript 6 (strict,
  `exactOptionalPropertyTypes`, `isolatedDeclarations`) on Node 24; the
  packages need Node ≥ 22.18.

## FAQ

**Why not just use protobuf-es types?** Use them on the wire. Use the domain
types where the code is about tasks rather than about messages.

**Does it replace protoc-gen-es?** No. It needs the `_pb.ts` files: the codecs
read and write protobuf-es messages, and the client sends them.

**Can I use it without ConnectRPC or protovalidate?** Yes. Both are optional peer
dependencies. Only `@talaagent/proto-domain/connect` and `/validate` need them,
and the codecs work without either.

**Why `null` and not `undefined`?** `null` is a value you write on purpose. It
survives JSON. With `exactOptionalPropertyTypes` it is also distinct from a
property you forgot to set.

**Which Temporal?** Any implementation of the spec: native, `temporal-polyfill`,
or `@js-temporal/polyfill`. The types come from `temporal-spec`.

**What happens to an enum value added later on the server?** Decoding throws a
`DomainDecodeError`, because a string-literal union can't hold an unknown value.
Regenerate the client before the server sends the new value.

**Why does `brand_import` resolve against `out`?** protoplugin rewrites relative
imports per generated file, from the output root. The same option therefore works
for every file, however deep it sits.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)
