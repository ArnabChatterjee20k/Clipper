/**
 * Clipper backend API client (fetch-based). Base URL for all requests.
 * Override with VITE_CLIPPER_API_BASE in .env.
 */
export const CLIPPER_API_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_CLIPPER_API_BASE) ||
  "http://localhost:8000";

const API = CLIPPER_API_BASE;

export async function uploadFile(file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/bucket/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `Upload failed: ${res.status}`));
  return res.json();
}

export async function listFiles(page = 1, limit = 50): Promise<FileListResult> {
  const res = await fetch(
    `${API}/bucket/?page=${page}&limit=${limit}`
  );
  if (!res.ok) throw new Error(await res.text().catch(() => `List failed: ${res.status}`));
  return res.json();
}

export async function deleteFile(fileId: number): Promise<void> {
  const res = await fetch(`${API}/bucket/files/${fileId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `Delete failed: ${res.status}`));
}

export async function editVideo(payload: { media: string; operations: unknown[] }): Promise<EditVideoResult> {
  const res = await fetch(`${API}/edits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `Edit failed: ${res.status}`));
  return res.json();
}

/** Response from upload (FileResponse) */
export interface UploadedFile {
  type: string;
  filename: string;
  id: number;
  url: string;
}

/** Item from list (FileResponse) */
export interface FileListItem {
  type: string;
  filename: string;
  id: number;
  url: string;
}

export interface FileListResult {
  files: FileListItem[];
  total: number;
}

/** Request body for POST /edits - media must be presigned URL */
export interface VideoEditRequest {
  media: string;
  operations: VideoOperation[];
}

/** Response from POST /edits */
export interface EditVideoResult {
  id: string;
  media: string;
  operations: VideoEditRequest["operations"];
}

/** Operation steps (discriminated by op) - minimal for API */
export type VideoOperation =
  | { op: "trim"; start_sec?: number; end_sec?: number; duration?: number }
  | { op: "text"; segment: Array<{ start_sec?: number; end_sec?: number; text: string }> }
  | { op: "speed"; segment: Array<{ start_sec?: number; end_sec?: number; speed: number }> }
  | { op: string; [k: string]: unknown };

// --- Edits (list, get, update, retry, cancel) ---

export interface EditItem {
  id: number;
  uid: string;
  input?: string | null;
  action?: unknown;
  status?: string;
  output?: unknown;
  created_at?: string;
  updated_at?: string;
  output_version?: number;
  retries?: number;
  progress?: number;
  error?: string | null;
}

export interface EditListResult {
  edits: EditItem[];
  total: number;
}

export interface EditUpdateBody {
  status?: string;
  progress?: number;
  error?: string;
}

export async function listEdits(params?: {
  uid?: string;
  status?: string;
  limit?: number;
  last_id?: number;
}): Promise<EditListResult> {
  const sp = new URLSearchParams();
  if (params?.uid != null) sp.set("uid", params.uid);
  if (params?.status != null) sp.set("status", params.status);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.last_id != null) sp.set("last_id", String(params.last_id));
  const q = sp.toString();
  const res = await fetch(`${API}/edits${q ? `?${q}` : ""}`);
  if (!res.ok) throw new Error(await res.text().catch(() => `List edits failed: ${res.status}`));
  return res.json();
}

export async function getEdit(editId: number): Promise<EditItem> {
  const res = await fetch(`${API}/edits/${editId}`);
  if (!res.ok) throw new Error(await res.text().catch(() => `Get edit failed: ${res.status}`));
  return res.json();
}

export async function updateEdit(editId: number, body: EditUpdateBody): Promise<EditItem> {
  const res = await fetch(`${API}/edits/${editId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `Update edit failed: ${res.status}`));
  return res.json();
}

export async function retryEdit(editId: number): Promise<EditItem> {
  const res = await fetch(`${API}/edits/${editId}/retry`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text().catch(() => `Retry edit failed: ${res.status}`));
  return res.json();
}

export async function cancelEdit(editId: number): Promise<EditItem> {
  const res = await fetch(`${API}/edits/${editId}/cancel`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text().catch(() => `Cancel edit failed: ${res.status}`));
  return res.json();
}

// --- Workflows (list, get, create, update, execute, retry) ---

export interface WorkflowItem {
  id?: number;
  name?: string;
  search?: string | null;
  steps?: unknown;
  created_at?: string;
  updated_at?: string;
}

export interface WorkflowListResult {
  workflows: WorkflowItem[];
  total: number;
}

/** Backend expects name + steps (each step = array of operations). */
export interface WorkflowCreateBody {
  name: string;
  search?: string;
  steps: VideoOperation[][];
}

export interface WorkflowUpdateBody {
  name?: string;
  search?: string;
  steps?: unknown[][];
}

export interface WorkflowRetryBody {
  uid: string;
}

export interface WorkflowExecutionResult {
  workflows: { uid: string; operations?: unknown; media?: string }[];
}

export async function listWorkflows(params?: { limit?: number; last_id?: number }): Promise<WorkflowListResult> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.last_id != null) sp.set("last_id", String(params.last_id));
  const q = sp.toString();
  const res = await fetch(`${API}/workflows${q ? `?${q}` : ""}`);
  if (!res.ok) throw new Error(await res.text().catch(() => `List workflows failed: ${res.status}`));
  return res.json();
}

export async function getWorkflow(workflowId: number): Promise<WorkflowItem> {
  const res = await fetch(`${API}/workflows/${workflowId}`);
  if (!res.ok) throw new Error(await res.text().catch(() => `Get workflow failed: ${res.status}`));
  return res.json();
}

export async function createWorkflow(body: WorkflowCreateBody): Promise<WorkflowItem & { id: number }> {
  const res = await fetch(`${API}/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `Create workflow failed: ${res.status}`));
  return res.json();
}

export async function updateWorkflow(workflowId: number, body: WorkflowUpdateBody): Promise<WorkflowItem> {
  const res = await fetch(`${API}/workflows/${workflowId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `Update workflow failed: ${res.status}`));
  return res.json();
}

export async function executeWorkflow(params: {
  media: string;
  id?: string;
  name?: string;
  search?: string;
}): Promise<WorkflowExecutionResult> {
  const sp = new URLSearchParams();
  sp.set("media", params.media);
  if (params.id != null) sp.set("id", params.id);
  if (params.name != null) sp.set("name", params.name);
  if (params.search != null) sp.set("search", params.search);
  const res = await fetch(`${API}/workflows/execute?${sp.toString()}`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text().catch(() => `Execute workflow failed: ${res.status}`));
  return res.json();
}

export async function deleteWorkflow(workflowId: number): Promise<{ id: number; deleted: boolean }> {
  const res = await fetch(`${API}/workflows/${workflowId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `Delete workflow failed: ${res.status}`));
  return res.json();
}

export async function listWorkflowExecutions(workflowId: number, params?: { limit?: number; last_id?: number }): Promise<{ executions: Array<{ id: number; workflow_id: number; progress?: number; created_at?: string; updated_at?: string }>; total: number }> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.last_id != null) sp.set("last_id", String(params.last_id));
  const q = sp.toString();
  const res = await fetch(`${API}/workflows/${workflowId}/executions${q ? `?${q}` : ""}`);
  if (!res.ok) throw new Error(await res.text().catch(() => `List workflow executions failed: ${res.status}`));
  return res.json();
}

export async function listAllExecutions(params?: { limit?: number; last_id?: number }): Promise<{ executions: Array<{ id: number; workflow_id: number; progress?: number; created_at?: string; updated_at?: string; workflow_name?: string }>; total: number }> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.last_id != null) sp.set("last_id", String(params.last_id));
  const q = sp.toString();
  const res = await fetch(`${API}/workflows/executions${q ? `?${q}` : ""}`);
  if (!res.ok) throw new Error(await res.text().catch(() => `List all executions failed: ${res.status}`));
  return res.json();
}

export async function listExecutionJobs(executionId: number): Promise<{ uid: string; jobs: unknown[] }> {
  const res = await fetch(`${API}/workflows/executions/${executionId}/jobs`);
  if (!res.ok) throw new Error(await res.text().catch(() => `List execution jobs failed: ${res.status}`));
  return res.json();
}

export async function retryWorkflow(workflowId: number, body: WorkflowRetryBody): Promise<{ uid: string; workflow_id: number; requeued: number; jobs: unknown[] }> {
  const res = await fetch(`${API}/workflows/${workflowId}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `Retry workflow failed: ${res.status}`));
  return res.json();
}
