/**
 * Composable hooks for Clipper API (upload, list, delete, edit video, job status).
 * Uses fetch-based client in @/lib/clipper-api.
 */

import { useState, useCallback, useRef } from "react";
import {
  uploadFile as apiUploadFile,
  listFiles as apiListFiles,
  deleteFile as apiDeleteFile,
  editVideo as apiEditVideo,
  listEdits as apiListEdits,
  getEdit as apiGetEdit,
  updateEdit as apiUpdateEdit,
  retryEdit as apiRetryEdit,
  cancelEdit as apiCancelEdit,
  listWorkflows as apiListWorkflows,
  getWorkflow as apiGetWorkflow,
  createWorkflow as apiCreateWorkflow,
  updateWorkflow as apiUpdateWorkflow,
  executeWorkflow as apiExecuteWorkflow,
  retryWorkflow as apiRetryWorkflow,
  deleteWorkflow as apiDeleteWorkflow,
  listWorkflowExecutions as apiListWorkflowExecutions,
  listAllExecutions as apiListAllExecutions,
  listExecutionJobs as apiListExecutionJobs,
  CLIPPER_API_BASE,
} from "@/lib/clipper-api";
import { useToast } from "@/components/ui/toast";

// Helper to show error toast
function useErrorToast() {
  const { addToast } = useToast();
  return useCallback((title: string, description: string) => {
    addToast({ variant: "error", title, description });
  }, [addToast]);
}
import type {
  UploadedFile,
  FileListItem,
  FileListResult,
  EditVideoResult,
  EditItem,
  EditListResult,
  EditUpdateBody,
  WorkflowItem,
  WorkflowListResult,
  WorkflowCreateBody,
  WorkflowUpdateBody,
  WorkflowRetryBody,
  WorkflowExecutionResult,
} from "@/lib/clipper-api";
import type { VideoEditRequest } from "@/types/edit-session";

export type {
  UploadedFile,
  FileListItem,
  FileListResult,
  VideoEditRequest,
  EditItem,
  EditListResult,
  EditUpdateBody,
  WorkflowItem,
  WorkflowListResult,
  WorkflowCreateBody,
  WorkflowUpdateBody,
  WorkflowRetryBody,
  WorkflowExecutionResult,
};

/** Job record from SSE (backend sends Job.model_dump_json()) */
export interface JobUpdate {
  id?: number;
  uid?: string;
  input?: string;
  action?: unknown;
  status?: string;
  progress?: number;
  percent?: number;
  updated_at?: string;
  output?: { filename?: string; url?: string; [k: string]: unknown };
}

export function useUploadFile() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<UploadedFile | null>(null);
  const showError = useErrorToast();

  const upload = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const out = await apiUploadFile(file);
      setData(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Upload failed", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { upload, loading, error, data };
}

export function useListFiles() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<FileListResult | null>(null);
  const showError = useErrorToast();

  const list = useCallback(async (page = 1, limit = 50) => {
    setLoading(true);
    setError(null);
    try {
      const out = await apiListFiles(page, limit);
      setData(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to load files", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { list, loading, error, data };
}

export function useDeleteFile() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const showError = useErrorToast();

  const deleteFile = useCallback(async (fileId: number) => {
    setLoading(true);
    setError(null);
    try {
      await apiDeleteFile(fileId);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to delete file", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { deleteFile, loading, error };
}

export function useEditVideo() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<EditVideoResult | null>(null);
  const showError = useErrorToast();

  const edit = useCallback(async (payload: VideoEditRequest) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const out = await apiEditVideo(payload);
      setData(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to submit edit", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { edit, loading, error, data };
}

/**
 * Poll job status via EventSource (SSE), same pattern as index.html.
 */
export function useJobStatus() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [job, setJob] = useState<JobUpdate | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const start = useCallback((uid: string) => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setLoading(true);
    setError(null);
    setJob(null);

    const url = `${CLIPPER_API_BASE}/edits/status?uid=${encodeURIComponent(uid)}`;
    const source = new EventSource(url);
    sourceRef.current = source;

    source.addEventListener("job_update", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as JobUpdate;
        setJob(data);
        setLoading(false);
      } catch {
        // ignore parse errors
      }
    });

    source.onerror = () => {
      setError(new Error("SSE connection error"));
      source.close();
      sourceRef.current = null;
      setLoading(false);
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setLoading(false);
  }, []);

  return { start, stop, loading, error, job };
}

// --- Edits (list, get, update, retry, cancel) ---

export function useListEdits() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<EditListResult | null>(null);
  const showError = useErrorToast();

  const list = useCallback(
    async (params?: { uid?: string; status?: string; limit?: number; last_id?: number }) => {
      setLoading(true);
      setError(null);
      try {
        const out = await apiListEdits(params);
        setData(out);
        return out;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        showError("Failed to load edits", err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [showError]
  );

  return { list, loading, error, data };
}

export function useGetEdit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<EditItem | null>(null);
  const showError = useErrorToast();

  const get = useCallback(async (editId: number) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const out = await apiGetEdit(editId);
      setData(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to load edit", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { get, loading, error, data };
}

export function useUpdateEdit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<EditItem | null>(null);
  const showError = useErrorToast();

  const update = useCallback(async (editId: number, body: EditUpdateBody) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const out = await apiUpdateEdit(editId, body);
      setData(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to update edit", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { update, loading, error, data };
}

export function useRetryEdit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<EditItem | null>(null);
  const showError = useErrorToast();

  const retry = useCallback(async (editId: number) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const out = await apiRetryEdit(editId);
      setData(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to retry edit", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { retry, loading, error, data };
}

export function useCancelEdit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<EditItem | null>(null);
  const showError = useErrorToast();

  const cancel = useCallback(async (editId: number) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const out = await apiCancelEdit(editId);
      setData(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to cancel edit", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { cancel, loading, error, data };
}

// --- Workflows ---

export function useListWorkflows() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<WorkflowListResult | null>(null);
  const showError = useErrorToast();

  const list = useCallback(async (params?: { limit?: number; last_id?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const out = await apiListWorkflows(params);
      setData(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to load workflows", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { list, loading, error, data };
}

export function useGetWorkflow() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<WorkflowItem | null>(null);
  const showError = useErrorToast();

  const get = useCallback(async (workflowId: number) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const out = await apiGetWorkflow(workflowId);
      setData(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to load workflow", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { get, loading, error, data };
}

export function useCreateWorkflow() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<(WorkflowItem & { id: number }) | null>(null);
  const showError = useErrorToast();

  const create = useCallback(async (body: WorkflowCreateBody) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const out = await apiCreateWorkflow(body);
      setData(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to create workflow", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { create, loading, error, data };
}

export function useUpdateWorkflow() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<WorkflowItem | null>(null);
  const showError = useErrorToast();

  const update = useCallback(async (workflowId: number, body: WorkflowUpdateBody) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const out = await apiUpdateWorkflow(workflowId, body);
      setData(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to update workflow", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { update, loading, error, data };
}

export function useExecuteWorkflow() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<WorkflowExecutionResult | null>(null);
  const showError = useErrorToast();

  const execute = useCallback(
    async (params: { media: string; id?: string; name?: string; search?: string }) => {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const out = await apiExecuteWorkflow(params);
        setData(out);
        return out;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        showError("Failed to execute workflow", err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [showError]
  );

  return { execute, loading, error, data };
}

export function useRetryWorkflow() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const showError = useErrorToast();

  const retry = useCallback(async (workflowId: number, body: WorkflowRetryBody) => {
    setLoading(true);
    setError(null);
    try {
      const out = await apiRetryWorkflow(workflowId, body);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to retry workflow", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { retry, loading, error };
}

export function useDeleteWorkflow() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const showError = useErrorToast();

  const deleteWorkflow = useCallback(async (workflowId: number) => {
    setLoading(true);
    setError(null);
    try {
      const out = await apiDeleteWorkflow(workflowId);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to delete workflow", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { deleteWorkflow, loading, error };
}

export function useListWorkflowExecutions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<{ executions: Array<{ id: number; workflow_id: number; progress?: number; created_at?: string; updated_at?: string }>; total: number } | null>(null);
  const showError = useErrorToast();

  const list = useCallback(async (workflowId: number, params?: { limit?: number; last_id?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const out = await apiListWorkflowExecutions(workflowId, params);
      setData(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to load executions", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { list, loading, error, data };
}

export function useListAllExecutions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<{ executions: Array<{ id: number; workflow_id: number; progress?: number; created_at?: string; updated_at?: string; workflow_name?: string }>; total: number } | null>(null);
  const showError = useErrorToast();

  const list = useCallback(async (params?: { limit?: number; last_id?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const out = await apiListAllExecutions(params);
      setData(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to load executions", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { list, loading, error, data };
}

export function useExecutionJobs() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<{ uid: string; jobs: unknown[] } | null>(null);
  const showError = useErrorToast();

  const fetchJobs = useCallback(async (executionId: number) => {
    setLoading(true);
    setError(null);
    try {
      const out = await apiListExecutionJobs(executionId);
      setData(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      showError("Failed to load execution jobs", err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  return { fetchJobs, loading, error, data };
}
