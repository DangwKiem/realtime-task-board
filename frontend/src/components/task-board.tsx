"use client";

import { useCallback, useEffect, useState } from "react";

import type { FormEvent } from "react";

import { createTask, deleteTask, listTasks, updateTask } from "@/lib/api";

import type { ListTaskParams, Task, TaskStatus } from "@/types/task";

import { useTaskRealtime } from "@/hooks/use-task-realtime";

import type { RealtimeEvent } from "@/types/realtime";

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Cần làm",
  in_progress: "Đang làm",
  done: "Hoàn thành",
};

interface EditState {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
}

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Đã xảy ra lỗi không xác định";
}

function taskMatchesFilters(
  task: Task,
  filters: ListTaskParams,
): boolean {
  if (
    filters.status &&
    task.status !== filters.status
  ) {
    return false;
  }

  const query =
    filters.q?.trim().toLowerCase();

  if (query) {
    const searchableText = [
      task.title,
      task.description ?? "",
    ]
      .join(" ")
      .toLowerCase();

    if (
      !searchableText.includes(query)
    ) {
      return false;
    }
  }

  return true;
}


function upsertTask(
  currentTasks: Task[],
  task: Task,
  filters: ListTaskParams,
): Task[] {
  const withoutCurrentTask =
    currentTasks.filter(
      (currentTask) =>
        currentTask.id !== task.id,
    );

  if (
    !taskMatchesFilters(
      task,
      filters,
    )
  ) {
    return withoutCurrentTask;
  }

  const limit =
    filters.limit ?? 100;

  return [
    task,
    ...withoutCurrentTask,
  ]
    .sort(
      (left, right) =>
        right.id - left.id,
    )
    .slice(0, limit);
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);

  const [workingTaskId, setWorkingTaskId] = useState<number | null>(null);

  const [createTitle, setCreateTitle] = useState("");

  const [createDescription, setCreateDescription] = useState("");

  const [createStatus, setCreateStatus] = useState<TaskStatus>("todo");

  const [queryInput, setQueryInput] = useState("");

  const [statusInput, setStatusInput] = useState<"" | TaskStatus>("");

  const [filters, setFilters] = useState<ListTaskParams>({
    limit: 100,
    offset: 0,
  });

  const handleRealtimeEvent =
  useCallback(
    (event: RealtimeEvent) => {
      switch (event.type) {
        case "task.created":
        case "task.updated": {
          const realtimeTask =
            event.data.task;

          setTasks((currentTasks) =>
            upsertTask(
              currentTasks,
              realtimeTask,
              filters,
            )
          );

          break;
        }

        case "task.deleted": {
          const deletedTaskId =
            event.data.task_id;

          setTasks((currentTasks) =>
            currentTasks.filter(
              (task) =>
                task.id
                !== deletedTaskId,
            )
          );

          break;
        }

        case "connection.ready":
          console.info(
            "WebSocket ready",
            event.data,
          );
          break;

        case "error":
          console.error(
            "Realtime error",
            event.data,
          );
          break;

        case "server.ping":
        case "server.pong":
          break;
      }
    },
    [filters],
  );


const {
  status: realtimeStatus,
} = useTaskRealtime(
  handleRealtimeEvent
);

  const [editing, setEditing] = useState<EditState | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listTasks(filters);
      setTasks(data);
    } catch (loadError) {
      setError(getMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    let ignore = false;

    async function fetchTasks() {
      try {
        const data = await listTasks(filters);

        if (!ignore) {
          setTasks(data);
          setError(null);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(getMessage(loadError));
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void fetchTasks();

    return () => {
      ignore = true;
    };
  }, [filters]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedTitle = createTitle.trim();

    if (!normalizedTitle) {
      setError("Tiêu đề không được để trống");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const createdTask =
        await createTask({
          title: normalizedTitle,
          description:
            createDescription.trim() || null,
          status: createStatus,
        });

      setTasks((currentTasks) =>
        upsertTask(
          currentTasks,
          createdTask,
          filters,
        )
      );

      setCreateTitle("");
      setCreateDescription("");
      setCreateStatus("todo");
    } catch (createError) {
      setError(getMessage(createError));
    } finally {
      setCreating(false);
    }
  }

  function handleFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError(null);

    setFilters({
      q: queryInput.trim() || undefined,
      status: statusInput || undefined,
      limit: 100,
      offset: 0,
    });
  }

  function clearFilters() {
    setQueryInput("");
    setStatusInput("");

    setLoading(true);
    setError(null);

    setFilters({
      limit: 100,
      offset: 0,
    });
  }

  function startEditing(task: Task) {
    setEditing({
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      status: task.status,
    });
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editing) {
      return;
    }

    const normalizedTitle = editing.title.trim();

    if (!normalizedTitle) {
      setError("Tiêu đề không được để trống");
      return;
    }

    setWorkingTaskId(editing.id);
    setError(null);

    try {
      const updatedTask =
        await updateTask(
          editing.id,
          {
            title: normalizedTitle,
            description:
              editing.description.trim()
              || null,
            status: editing.status,
          },
        );

      setTasks((currentTasks) =>
        upsertTask(
          currentTasks,
          updatedTask,
          filters,
        )
      );

      setEditing(null);
    } catch (updateError) {
      setError(getMessage(updateError));
    } finally {
      setWorkingTaskId(null);
    }
  }

  async function handleDelete(task: Task) {
    const accepted = window.confirm(`Xóa task "${task.title}"?`);

    if (!accepted) {
      return;
    }

    setWorkingTaskId(task.id);
    setError(null);

    try {
      await deleteTask(task.id);

      setTasks((currentTasks) =>
        currentTasks.filter(
          (currentTask) =>
            currentTask.id !== task.id,
        )
      );

      if (editing?.id === task.id) {
        setEditing(null);
      }
    } catch (deleteError) {
      setError(getMessage(deleteError));
    } finally {
      setWorkingTaskId(null);
    }
  }

  return (
    <section className="task-board">
      <div className="panel">
        <h2>Tạo task</h2>

        <form className="task-form" onSubmit={handleCreate}>
          <label>
            Tiêu đề
            <input
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
              minLength={1}
              maxLength={200}
              placeholder="Ví dụ: Học HTTP"
              required
            />
          </label>

          <label>
            Mô tả
            <textarea
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              maxLength={2000}
              placeholder="Nội dung cần thực hiện"
              rows={4}
            />
          </label>

          <label>
            Trạng thái
            <select
              value={createStatus}
              onChange={(event) =>
                setCreateStatus(event.target.value as TaskStatus)
              }
            >
              <option value="todo">Cần làm</option>

              <option value="in_progress">Đang làm</option>

              <option value="done">Hoàn thành</option>
            </select>
          </label>

          <button type="submit" disabled={creating}>
            {creating ? "Đang tạo..." : "Tạo task"}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Tìm kiếm và lọc</h2>

        <form className="filter-form" onSubmit={handleFilter}>
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Tìm theo tiêu đề hoặc mô tả"
          />

          <select
            value={statusInput}
            onChange={(event) =>
              setStatusInput(event.target.value as "" | TaskStatus)
            }
          >
            <option value="">Mọi trạng thái</option>

            <option value="todo">Cần làm</option>

            <option value="in_progress">Đang làm</option>

            <option value="done">Hoàn thành</option>
          </select>

          <button type="submit">Áp dụng</button>

          <button
            type="button"
            className="secondary-button"
            onClick={clearFilters}
          >
            Xóa bộ lọc
          </button>
        </form>
      </div>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      <div
        className={
          `realtime-indicator ` +
          `realtime-${realtimeStatus}`
        }
      >
        <span
          className="realtime-dot"
          aria-hidden="true"
        />

        {REALTIME_LABELS[realtimeStatus]}
      </div>

      <div className="task-list-header">
        <h2>Danh sách task</h2>

        <button
          type="button"
          className="secondary-button"
          onClick={() => void loadTasks()}
          disabled={loading}
        >
          Tải lại
        </button>
      </div>

      {loading ? (
        <p>Đang tải dữ liệu...</p>
      ) : tasks.length === 0 ? (
        <div className="empty-state">Chưa có task phù hợp.</div>
      ) : (
        <div className="task-list">
          {tasks.map((task) => {
            const isEditing = editing?.id === task.id;

            const isWorking = workingTaskId === task.id;

            return (
              <article className="task-card" key={task.id}>
                {isEditing && editing ? (
                  <form className="task-form" onSubmit={handleSaveEdit}>
                    <label>
                      Tiêu đề
                      <input
                        value={editing.title}
                        onChange={(event) =>
                          setEditing({
                            ...editing,
                            title: event.target.value,
                          })
                        }
                        minLength={1}
                        maxLength={200}
                        required
                      />
                    </label>

                    <label>
                      Mô tả
                      <textarea
                        value={editing.description}
                        onChange={(event) =>
                          setEditing({
                            ...editing,
                            description: event.target.value,
                          })
                        }
                        maxLength={2000}
                        rows={4}
                      />
                    </label>

                    <label>
                      Trạng thái
                      <select
                        value={editing.status}
                        onChange={(event) =>
                          setEditing({
                            ...editing,
                            status: event.target.value as TaskStatus,
                          })
                        }
                      >
                        <option value="todo">Cần làm</option>

                        <option value="in_progress">Đang làm</option>

                        <option value="done">Hoàn thành</option>
                      </select>
                    </label>

                    <div className="button-row">
                      <button type="submit" disabled={isWorking}>
                        {isWorking ? "Đang lưu..." : "Lưu"}
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setEditing(null)}
                        disabled={isWorking}
                      >
                        Hủy
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="task-card-header">
                      <div>
                        <h3>{task.title}</h3>

                        <span
                          className={
                            `task-status ` + `task-status-${task.status}`
                          }
                        >
                          {STATUS_LABELS[task.status]}
                        </span>
                      </div>

                      <span className="task-id">#{task.id}</span>
                    </div>

                    <p className="task-description">
                      {task.description || "Không có mô tả"}
                    </p>

                    <dl className="task-metadata">
                      <div>
                        <dt>Ngày tạo</dt>
                        <dd>
                          {new Date(task.created_at).toLocaleString("vi-VN")}
                        </dd>
                      </div>

                      <div>
                        <dt>Cập nhật</dt>
                        <dd>
                          {new Date(task.updated_at).toLocaleString("vi-VN")}
                        </dd>
                      </div>
                    </dl>

                    <div className="button-row">
                      <button
                        type="button"
                        onClick={() => startEditing(task)}
                        disabled={isWorking}
                      >
                        Sửa
                      </button>

                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => void handleDelete(task)}
                        disabled={isWorking}
                      >
                        {isWorking ? "Đang xử lý..." : "Xóa"}
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

const REALTIME_LABELS = {
  connecting: "Đang kết nối realtime",
  open: "Realtime đã kết nối",
  closed: "Realtime đã ngắt",
  error: "Realtime gặp lỗi",
} as const;