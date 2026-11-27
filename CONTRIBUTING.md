# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Setup

You need Node 24 (`.node-version`) and pnpm, which corepack provides from
`packageManager`. `nix develop` gives you all of it.

```sh
corepack enable
pnpm install
pnpm build      # the runtime and the plugin
pnpm typecheck
pnpm test
pnpm lint       # biome; `pnpm format` fixes what it can
```

## Layout

| Path                                    | What                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/runtime`                      | `@talaagent/proto-domain`: converters, codec types, the validated and domain clients |
| `packages/protoc-gen-domain`            | `@talaagent/protoc-gen-domain`: the plugin                                           |
| `packages/protoc-gen-domain/test/proto` | fixture protos; `test/gen` is their checked-in output                                |
| `proto`                                 | `buf.build/talaagent/domain`: the field options and `CalendarDuration`               |
| `examples/basic`                        | an end-to-end project, run in CI                                                     |

## Generated code

`pnpm generate` builds the plugin and regenerates the fixtures
(`packages/protoc-gen-domain/test/gen`, `test/fixtures.binpb`) and the example.
Commit the result: CI fails when the generated code is stale. The plugin
tests compare the in-process output with `test/gen`, so a change to the
emitted code shows up as a diff in review.

A new mapping needs:

- a fixture field in `test/proto`,
- a round-trip test in `packages/protoc-gen-domain/test/roundtrip.test.ts`,
- converter tests in the runtime,
- a row in the README's mapping table.

## Protos

`pnpm exec buf lint` and `pnpm exec buf format --diff` must be clean. `proto/`
is published to the BSR and must not break: CI runs `buf breaking` against
`main`. The fixtures and the example may change freely.

## Changesets

A PR that changes a published package adds a changeset (`pnpm changeset`).
Merging to `main` updates the "Version packages" PR; merging that one releases.

## Rules

- TypeScript strict, no `any`, no one-letter names.
- No private data in fixtures or examples.
- By contributing you agree that your contribution is licensed under
  Apache-2.0.
