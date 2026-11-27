import { readFileSync } from "node:fs";
import { create, setExtension } from "@bufbuild/protobuf";
import {
  FieldDescriptorProto_Type,
  FieldOptionsSchema,
  FileDescriptorProtoSchema,
} from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";

import {
  FieldOptionsSchema as DomainFieldOptionsSchema,
  field as domainField,
} from "./gen/talaagent/domain/v1/options_pb.js";
import { fixtureFiles, runPlugin } from "./request.js";

const DEFAULT = "target=ts,import_extension=js";

describe("protoc-gen-domain", () => {
  it("matches the checked-in output of buf generate", () => {
    const files = runPlugin(DEFAULT);
    expect([...files.keys()].sort()).toMatchInlineSnapshot(`
      [
        "fixtures/shared/v1/shared_domain.ts",
        "fixtures/v1/brands_domain.ts",
        "fixtures/v1/enums_domain.ts",
        "fixtures/v1/extras_domain.ts",
        "fixtures/v1/legacy_domain.ts",
        "fixtures/v1/messages_domain.ts",
        "fixtures/v1/scalars_domain.ts",
        "fixtures/v1/service_domain.ts",
        "fixtures/v1/well_known_domain.ts",
      ]
    `);
    for (const [name, content] of files) {
      const checkedIn = readFileSync(new URL(`gen/${name}`, import.meta.url), "utf8");
      expect(content, name).toBe(checkedIn);
    }
  });

  it("skips the well-known, google.type, protovalidate and option files", () => {
    const all = fixtureFiles();
    const files = runPlugin(
      DEFAULT,
      all,
      all.map((file) => file.name),
    );
    expect([...files.keys()].every((name) => name.startsWith("fixtures/"))).toBe(true);
  });

  it("writes camelCase literals with enum_style=camel", async () => {
    const files = runPlugin(`${DEFAULT},enum_style=camel`);
    await expect(files.get("fixtures/v1/enums_domain.ts")).toMatchFileSnapshot(
      "__snapshots__/enums_camel.ts.snap",
    );
  });

  it("keeps the proto names with enum_style=screaming", () => {
    const content =
      runPlugin(`${DEFAULT},enum_style=screaming`).get("fixtures/v1/enums_domain.ts") ?? "";
    expect(content).toContain('| "ON_HOLD"');
    expect(content).toContain('| "LIGHT"');
  });

  it("imports brands from brand_import", async () => {
    const files = runPlugin(`${DEFAULT},brand_import=./brands.js`);
    const content = files.get("fixtures/v1/brands_domain.ts") ?? "";
    expect(content).toContain(
      'import type { AccountId, Cents, Fingerprint } from "../../brands.js";',
    );
    expect(content).not.toContain("Brand<");
    await expect(content).toMatchFileSnapshot("__snapshots__/brands_import.ts.snap");
  });

  it("imports the runtime from runtime_import", () => {
    const content =
      runPlugin(`${DEFAULT},runtime_import=@example/domain-runtime`).get(
        "fixtures/v1/well_known_domain.ts",
      ) ?? "";
    expect(content).toContain('from "@example/domain-runtime"');
    expect(content).not.toContain("@talaagent/proto-domain");
  });

  it("rejects unknown and empty options", () => {
    expect(() => runPlugin(`${DEFAULT},enum_style=kebab`)).toThrow(
      'enum_style must be one of snake, screaming, camel, not "kebab"',
    );
    expect(() => runPlugin(`${DEFAULT},runtime_import=`)).toThrow("runtime_import needs a module");
    expect(() => runPlugin(`${DEFAULT},brand_import=`)).toThrow("brand_import needs a module");
    expect(() => runPlugin(`${DEFAULT},wire_import=./x.js`)).toThrow(
      'unknown option "wire_import"',
    );
  });
});

/** A one-message file with one field and the given domain field options. */
function optionFile(
  type: FieldDescriptorProto_Type,
  typeName: string,
  label: number,
  options: Partial<{ brand: string; date: number }>,
) {
  const fieldOptions = create(FieldOptionsSchema);
  setExtension(fieldOptions, domainField, create(DomainFieldOptionsSchema, options));
  return create(FileDescriptorProtoSchema, {
    name: "invalid/v1/invalid.proto",
    package: "invalid.v1",
    syntax: "proto3",
    dependency: [
      "talaagent/domain/v1/options.proto",
      "google/type/date.proto",
      "google/protobuf/timestamp.proto",
    ],
    messageType: [
      {
        name: "Invalid",
        field: [
          {
            name: "subject",
            number: 1,
            type,
            typeName,
            label,
            jsonName: "subject",
            options: fieldOptions,
          },
        ],
      },
    ],
  });
}

describe("field option checks", () => {
  const LABEL_OPTIONAL = 1;
  const run = (file: ReturnType<typeof optionFile>) => () =>
    runPlugin(DEFAULT, [...fixtureFiles(), file], [file.name]);

  it("rejects a date form on a field that isn't a google.type.Date", () => {
    const file = optionFile(
      FieldDescriptorProto_Type.MESSAGE,
      ".google.protobuf.Timestamp",
      LABEL_OPTIONAL,
      { date: 2 },
    );
    expect(run(file)).toThrow(
      "invalid.v1.Invalid.subject: (talaagent.domain.v1.field).date is only valid on a google.type.Date field",
    );
  });

  it("rejects a brand on a message", () => {
    const file = optionFile(
      FieldDescriptorProto_Type.MESSAGE,
      ".google.type.Date",
      LABEL_OPTIONAL,
      { brand: "Day" },
    );
    expect(run(file)).toThrow("brand is only valid on a scalar or wrapper field");
  });

  it("rejects a brand on a bool", () => {
    const file = optionFile(FieldDescriptorProto_Type.BOOL, "", LABEL_OPTIONAL, { brand: "Flag" });
    expect(run(file)).toThrow("invalid.v1.Invalid.subject");
  });

  it("rejects a brand that isn't an identifier", () => {
    const file = optionFile(FieldDescriptorProto_Type.STRING, "", LABEL_OPTIONAL, {
      brand: "Account-Id",
    });
    expect(run(file)).toThrow("invalid.v1.Invalid.subject");
  });
});
