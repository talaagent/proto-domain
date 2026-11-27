// End to end: an in-memory TaskService, a validated domain client over it,
// and validateThen for a query `select`.

import { create } from "@bufbuild/protobuf";
import { ValidationError } from "@bufbuild/protovalidate";
import { createRouterTransport } from "@connectrpc/connect";
import { validateThen } from "@talaagent/proto-domain/validate";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import type { TaskId } from "../src/brands.js";
import {
  listTasksResponseFromProto,
  type Task,
  taskToProto,
} from "../src/gen/example/tasks/v1/tasks_domain.js";
import {
  ListTasksResponseSchema,
  TaskSchema,
  TaskService,
  TaskStatus,
  type Task as WireTask,
} from "../src/gen/example/tasks/v1/tasks_pb.js";
import { createTaskClient } from "../src/tasks.js";

const created = { seconds: 1_767_225_600n, nanos: 0 };

/** A TaskService that keeps tasks in memory; `broken` answers without a create_time. */
function transport(options: { broken?: boolean } = {}) {
  const tasks: WireTask[] = [];
  return createRouterTransport(({ service }) => {
    service(TaskService, {
      createTask(request) {
        const task = create(TaskSchema, {
          id: `task-${tasks.length + 1}`,
          title: request.title,
          notes: request.notes,
          status: TaskStatus.TODO,
          ...(request.dueDate === undefined ? {} : { dueDate: request.dueDate }),
          ...(request.estimate === undefined ? {} : { estimate: request.estimate }),
          ...(request.recurrence === undefined ? {} : { recurrence: request.recurrence }),
          ...(options.broken === true ? {} : { createTime: created }),
          assignee: { case: "teamName", value: "platform" },
        });
        tasks.push(task);
        return { task };
      },
      listTasks(request) {
        return {
          tasks: tasks.filter(
            (task) => request.status === TaskStatus.UNSPECIFIED || task.status === request.status,
          ),
        };
      },
    });
  });
}

describe("a domain TaskService client", () => {
  it("sends domain requests and returns domain responses", async () => {
    const client = createTaskClient(transport());
    const { task } = await client.createTask({
      title: "Write the docs",
      dueDate: Temporal.PlainDate.from("2026-02-27"),
      estimate: Temporal.Duration.from({ hours: 2, minutes: 30 }),
      recurrence: Temporal.Duration.from({ weeks: 1 }),
    });
    const id: TaskId = task.id;
    expect(id).toBe("task-1");
    expect(task.notes).toBeNull();
    expect(task.status).toBe("todo");
    expect(task.dueDate?.toString()).toBe("2026-02-27");
    expect(task.estimate?.toString()).toBe("PT2H30M");
    expect(task.recurrence?.toString()).toBe("P1W");
    expect(task.createTime.toString()).toBe("2026-01-01T00:00:00Z");
    expect(task.assignee).toEqual({ case: "teamName", teamName: "platform" });

    const { tasks } = await client.listTasks({ status: "todo" });
    expect(tasks.map((listed) => listed.title)).toEqual(["Write the docs"]);
    expect((await client.listTasks({ status: "done" })).tasks).toEqual([]);
    expect((await client.listTasks({})).tasks).toHaveLength(1);
  });

  it("rejects a response that breaks its protovalidate rules", async () => {
    const client = createTaskClient(transport({ broken: true }));
    await expect(client.createTask({ title: "No timestamp" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("validateThen", () => {
  it("validates and decodes a response for a query select", () => {
    const select = validateThen(ListTasksResponseSchema, listTasksResponseFromProto);
    const task: Task = {
      id: "task-7" as TaskId,
      title: "Ship it",
      notes: "after review",
      status: "in_progress",
      dueDate: null,
      createTime: Temporal.Instant.from("2026-01-02T03:04:05Z"),
      estimate: null,
      recurrence: null,
      assignee: { case: "userId", userId: "user-3" },
    };
    const decoded = select(create(ListTasksResponseSchema, { tasks: [taskToProto(task)] }));
    expect(decoded.tasks[0]?.status).toBe("in_progress");
    expect(decoded.tasks[0]?.createTime.equals(task.createTime)).toBe(true);
    expect(() =>
      select(
        create(ListTasksResponseSchema, {
          tasks: [create(TaskSchema, { id: "task-8", title: "" })],
        }),
      ),
    ).toThrow(ValidationError);
  });
});
