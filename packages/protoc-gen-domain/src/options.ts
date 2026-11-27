// The plugin's own options. protoplugin parses its standard ones (target,
// import_extension, js_import_style, map_imports, ...) and hands us the rest.

/** How an enum value's name becomes its string literal. */
export type EnumStyle = "snake" | "screaming" | "camel";

export interface Options {
  /** The module the generated code imports the runtime from. */
  readonly runtimeImport: string;
  /**
   * A module that exports one type per brand name, instead of the runtime's
   * `Brand<T, Name>`. A relative path is relative to the output directory.
   */
  readonly brandImport: string | undefined;
  readonly enumStyle: EnumStyle;
}

export const DEFAULT_RUNTIME_IMPORT = "@talaagent/proto-domain";

const ENUM_STYLES: readonly EnumStyle[] = ["snake", "screaming", "camel"];

function isEnumStyle(value: string): value is EnumStyle {
  return (ENUM_STYLES as readonly string[]).includes(value);
}

export function parseOptions(raw: readonly { key: string; value: string }[]): Options {
  let runtimeImport = DEFAULT_RUNTIME_IMPORT;
  let brandImport: string | undefined;
  let enumStyle: EnumStyle = "snake";
  for (const { key, value } of raw) {
    switch (key) {
      case "runtime_import":
        if (value === "") {
          throw new Error(
            "runtime_import needs a module, e.g. runtime_import=@talaagent/proto-domain",
          );
        }
        runtimeImport = value;
        break;
      case "brand_import":
        if (value === "") {
          throw new Error("brand_import needs a module, e.g. brand_import=./brands.js");
        }
        brandImport = value;
        break;
      case "enum_style":
        if (!isEnumStyle(value)) {
          throw new Error(`enum_style must be one of ${ENUM_STYLES.join(", ")}, not "${value}"`);
        }
        enumStyle = value;
        break;
      default:
        throw new Error(`unknown option "${key}"`);
    }
  }
  return { runtimeImport, brandImport, enumStyle };
}
