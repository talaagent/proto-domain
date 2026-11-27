import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

import { version } from "../src/version.js";

it("matches package.json", () => {
  const pkg: unknown = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  expect(pkg).toMatchObject({ version });
});
