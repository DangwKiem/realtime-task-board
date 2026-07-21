export type TaskStatus =
  | "todo"
  | "in_progress"
  | "done";


export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}


export interface TaskCreateInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
}


export interface TaskUpdateInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
}


export interface ListTaskParams {
  status?: TaskStatus;
  q?: string;
  limit?: number;
  offset?: number;
}