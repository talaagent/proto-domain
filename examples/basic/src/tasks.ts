// What application code looks like: domain types in, domain types out.

import type { Transport } from "@connectrpc/connect";
import {
  createDomainClient,
  createValidatedClient,
  type DomainClient,
} from "@talaagent/proto-domain/connect";

import { TaskServiceCodecs } from "./gen/example/tasks/v1/tasks_domain.js";
import { TaskService } from "./gen/example/tasks/v1/tasks_pb.js";

export type TaskClient = DomainClient<typeof TaskServiceCodecs>;

/** A TaskService client that validates responses and speaks domain types. */
export function createTaskClient(transport: Transport): TaskClient {
  return createDomainClient(createValidatedClient(TaskService, transport), TaskServiceCodecs);
}
