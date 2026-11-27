# examples/basic

A TaskService with a validated domain client, run end to end in CI.

- `proto/`: the service, with protovalidate rules and a brand
- `buf.gen.yaml`: protoc-gen-es and protoc-gen-domain into `src/gen`, with `brand_import=../brands.js`
- `src/brands.ts`: the `TaskId` brand
- `src/tasks.ts`: `createTaskClient(transport)`
- `test/tasks.test.ts`: an in-memory TaskService (createRouterTransport), a response that breaks its rules, and `validateThen`

```sh
pnpm --filter @talaagent/example-basic generate
pnpm --filter @talaagent/example-basic test
```
