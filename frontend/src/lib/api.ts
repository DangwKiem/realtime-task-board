import type {
  AuthResponse,
  LoginInput,
  RegisterInput,
} from "@/types/auth";

import type {
  ListTaskParams,
  Task,
  TaskCreateInput,
  TaskUpdateInput,
} from "@/types/task";


const API_URL =
  process.env.NEXT_PUBLIC_API_URL;


if (!API_URL) {
  throw new Error(
    "Thiếu NEXT_PUBLIC_API_URL " +
      "trong frontend/.env.local",
  );
}


let csrfToken: string | null = null;


export function setCsrfToken(
  token: string | null,
): void {
  csrfToken = token;
}


interface FastApiValidationItem {
  loc?: Array<string | number>;
  msg?: string;
  type?: string;
}


interface FastApiErrorBody {
  detail?:
    | string
    | FastApiValidationItem[];
}


export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(
    message: string,
    status: number,
    body: unknown,
  ) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}


function getErrorMessage(
  body: unknown,
  status: number,
): string {
  if (
    typeof body !== "object" ||
    body === null ||
    !("detail" in body)
  ) {
    return (
      `Request thất bại với HTTP ${status}`
    );
  }

  const detail = (
    body as FastApiErrorBody
  ).detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const location =
          item.loc?.join(".") ??
          "request";

        const message =
          item.msg ??
          "Dữ liệu không hợp lệ";

        return `${location}: ${message}`;
      })
      .join("; ");
  }

  return (
    `Request thất bại với HTTP ${status}`
  );
}


async function parseResponseBody(
  response: Response,
): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}


function isUnsafeMethod(
  method: string | undefined,
): boolean {
  const normalizedMethod = (
    method ?? "GET"
  ).toUpperCase();

  return [
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ].includes(normalizedMethod);
}


async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = new URL(path, API_URL);

  const headers = new Headers(
    options.headers
  );

  headers.set(
    "Accept",
    "application/json",
  );

  if (
    options.body !== undefined &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  if (
    csrfToken &&
    isUnsafeMethod(options.method)
  ) {
    headers.set(
      "X-CSRF-Token",
      csrfToken,
    );
  }

  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers,

      // Bắt buộc để browser gửi cookie
      // cho FastAPI ở port khác.
      credentials: "include",

      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      "Không kết nối được FastAPI. " +
        "Kiểm tra backend, Redis, " +
        "API URL và CORS.",
      {
        cause: error,
      },
    );
  }

  const body =
    await parseResponseBody(response);

  if (!response.ok) {
    throw new ApiError(
      getErrorMessage(
        body,
        response.status,
      ),
      response.status,
      body,
    );
  }

  return body as T;
}


// Authentication

export async function register(
  input: RegisterInput,
): Promise<AuthResponse> {
  const result = await request<AuthResponse>(
    "/api/auth/register",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  setCsrfToken(result.csrf_token);

  return result;
}


export async function login(
  input: LoginInput,
): Promise<AuthResponse> {
  const result = await request<AuthResponse>(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  setCsrfToken(result.csrf_token);

  return result;
}


export async function getMe():
Promise<AuthResponse> {
  const result = await request<AuthResponse>(
    "/api/auth/me",
  );

  setCsrfToken(result.csrf_token);

  return result;
}


export async function logout():
Promise<void> {
  await request<void>(
    "/api/auth/logout",
    {
      method: "POST",
    },
  );

  setCsrfToken(null);
}


// Tasks

export async function listTasks(
  params: ListTaskParams = {},
): Promise<Task[]> {
  const searchParams =
    new URLSearchParams();

  if (params.status) {
    searchParams.set(
      "status",
      params.status,
    );
  }

  if (params.q) {
    searchParams.set(
      "q",
      params.q,
    );
  }

  if (params.limit !== undefined) {
    searchParams.set(
      "limit",
      String(params.limit),
    );
  }

  if (params.offset !== undefined) {
    searchParams.set(
      "offset",
      String(params.offset),
    );
  }

  const query = searchParams.toString();

  const path = query
    ? `/api/tasks?${query}`
    : "/api/tasks";

  return request<Task[]>(path);
}


export async function getTask(
  taskId: number,
): Promise<Task> {
  return request<Task>(
    `/api/tasks/${taskId}`,
  );
}


export async function createTask(
  input: TaskCreateInput,
): Promise<Task> {
  return request<Task>(
    "/api/tasks",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}


export async function updateTask(
  taskId: number,
  input: TaskUpdateInput,
): Promise<Task> {
  return request<Task>(
    `/api/tasks/${taskId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}


export async function deleteTask(
  taskId: number,
): Promise<void> {
  await request<void>(
    `/api/tasks/${taskId}`,
    {
      method: "DELETE",
    },
  );
}