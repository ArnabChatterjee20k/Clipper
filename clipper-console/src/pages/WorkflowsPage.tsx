/**
 * Workflows: list, create/edit (multi-step), run with media + job status.
 * Dashboard-style tables with filters, relative time, Load more.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  useListWorkflows,
  useGetWorkflow,
  useCreateWorkflow,
  useUpdateWorkflow,
  useExecuteWorkflow,
  useJobStatus,
  useDeleteWorkflow,
  useListWorkflowExecutions,
  useListAllExecutions,
  useExecutionJobs,
} from "@/hooks/use-clipper-api";
import type { VideoOperation } from "@/types/edit-session";
import {
  defaultTrimOp,
  defaultKaraokeOp,
  defaultTextSequenceOp,
  defaultTextSegment,
  defaultSpeedOp,
  defaultWatermarkOp,
  defaultAudioOp,
  defaultBackgroundColorOp,
  defaultTranscodeOp,
  defaultCompressOp,
  defaultConcatOp,
  defaultExtractAudioOp,
  defaultGifOp,
  defaultDownloadFromYouTubeOp,
} from "@/types/edit-session";
import { OperationList } from "@/components/video-editor";
import { VideoPlayer } from "@/components/video-editor/VideoPlayer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BucketBrowser } from "@/components/bucket/BucketBrowser";
import { TableSkeleton } from "@/components/edits";
import type { TimeFilter } from "@/components/edits";
import { Loader2, Plus, Pencil, Play, Trash2, Code, Save, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative, formatExact } from "@/lib/relative-time";
import { ChevronDown, ChevronRight } from "lucide-react";

const PAGE_SIZE = 20;
const TIME_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function filterByTime<T extends { created_at?: string }>(items: T[], timeFilter: TimeFilter): T[] {
  if (timeFilter === "all") return items;
  const now = Date.now();
  const ms: Record<TimeFilter, number> = {
    all: 0,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  const cutoff = now - ms[timeFilter];
  return items.filter((e) => new Date(e.created_at ?? 0).getTime() >= cutoff);
}

/** Normalize backend steps (may be raw JSON) to VideoOperation[][] */
function normalizeSteps(steps: unknown): VideoOperation[][] {
  if (!Array.isArray(steps)) return [];
  return steps.map((step) => {
    if (!Array.isArray(step)) return [];
    return step.map((op) => (typeof op === "object" && op !== null && "op" in op ? (op as VideoOperation) : op as VideoOperation));
  });
}

type WorkflowItem = import("@/lib/clipper-api").WorkflowItem;
type ExecutionItem = { id: number; workflow_id: number; progress?: number; created_at?: string; updated_at?: string; workflow_name?: string };
type ExecutionJobs = { uid?: string; jobs: any[] };

function getJobOutput(job: any): { url?: string; filename?: string } | undefined {
  if (!job) return undefined;
  const output = job.output ?? job.result?.output ?? job.result;
  if (!output || typeof output !== "object" || Array.isArray(output)) return undefined;
  const out = output as { filename?: string; url?: string };
  return { filename: out.filename, url: out.url };
}

export function WorkflowsPage() {
  const { list, loading, error, data } = useListWorkflows();
  const { get, data: workflowDetail } = useGetWorkflow();
  const { create, loading: creating } = useCreateWorkflow();
  const { update, loading: updating } = useUpdateWorkflow();
  const { execute, loading: executing, data: execResult } = useExecuteWorkflow();
  const { start: startJobStatus, job } = useJobStatus();
  const { deleteWorkflow, loading: deleting } = useDeleteWorkflow();
  const [executionsCountMap, setExecutionsCountMap] = useState<Map<number, number>>(new Map());
  const { list: listExecutions } = useListWorkflowExecutions();
  const { list: listAllExecutions, loading: loadingAllExecutions, data: allExecutionsData } = useListAllExecutions();

  const [workflowsMap, setWorkflowsMap] = useState<Map<number, WorkflowItem>>(new Map());
  const [workflowsLastId, setWorkflowsLastId] = useState(0);
  const [workflowsHasMore, setWorkflowsHasMore] = useState(true);
  const [executionsList, setExecutionsList] = useState<ExecutionItem[]>([]);
  const [executionsLastId, setExecutionsLastId] = useState(0);
  const [executionsHasMore, setExecutionsHasMore] = useState(true);

  const [view, setView] = useState<"list" | "form">("list");
  const [tab, setTab] = useState<"workflows" | "executions">("workflows");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [steps, setSteps] = useState<VideoOperation[][]>([[]]);
  const [runModal, setRunModal] = useState<{ workflowId: number; name: string } | null>(null);
  const [runMedia, setRunMedia] = useState("");
  const [runMediaName, setRunMediaName] = useState("");
  const { fetchJobs } = useExecutionJobs();
  const [expandedExecutionId, setExpandedExecutionId] = useState<number | null>(null);
  const [executionJobsMap, setExecutionJobsMap] = useState<Map<number, ExecutionJobs>>(new Map());
  const [loadingExecutionId, setLoadingExecutionId] = useState<number | null>(null);
  const [expandedJobMap, setExpandedJobMap] = useState<Map<number, number | null>>(new Map());
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [wfSearch, setWfSearch] = useState("");
  const [wfTimeFilter, setWfTimeFilter] = useState<TimeFilter>("all");
  const [execSearch, setExecSearch] = useState("");
  const [execTimeFilter, setExecTimeFilter] = useState<TimeFilter>("all");

  useEffect(() => {
    list({ limit: PAGE_SIZE, last_id: 0 });
  }, [list]);

  useEffect(() => {
    if (data?.workflows) {
      setWorkflowsMap((prev) => {
        const next = new Map(prev);
        data.workflows.forEach((w) => { if (w.id != null) next.set(w.id, w); });
        return next;
      });
      const ids = data.workflows.map((w) => w.id).filter((id): id is number => id != null);
      if (ids.length > 0) setWorkflowsLastId(Math.max(...ids));
      setWorkflowsHasMore((data.workflows?.length ?? 0) >= PAGE_SIZE);
    }
  }, [data]);

  useEffect(() => {
    if (workflowsMap.size > 0) {
      workflowsMap.forEach((w) => {
        if (w.id) {
          listExecutions(w.id, { limit: 1, last_id: 0 }).then((result) => {
            setExecutionsCountMap((prev) => {
              const next = new Map(prev);
              next.set(w.id!, result?.total ?? 0);
              return next;
            });
          });
        }
      });
    }
  }, [workflowsMap, listExecutions]);

  useEffect(() => {
    if (tab === "executions") {
      listAllExecutions({ limit: PAGE_SIZE, last_id: 0 });
    }
  }, [tab, listAllExecutions]);

  useEffect(() => {
    if (allExecutionsData?.executions) {
      setExecutionsList((prev) => {
        const byId = new Map(prev.map((e) => [e.id, e]));
        allExecutionsData.executions.forEach((e) => byId.set(e.id, e as ExecutionItem));
        return Array.from(byId.values()).sort((a, b) => b.id - a.id);
      });
      const ids = allExecutionsData.executions.map((e) => e.id).filter(Boolean);
      if (ids.length > 0) setExecutionsLastId(Math.max(...ids));
      setExecutionsHasMore((allExecutionsData.executions?.length ?? 0) >= PAGE_SIZE);
    }
  }, [allExecutionsData]);

  useEffect(() => {
    if (editingId != null) get(editingId);
  }, [editingId, get]);

  useEffect(() => {
    if (workflowDetail && editingId != null) {
      setName(workflowDetail.name ?? "");
      setSearch(workflowDetail.search ?? "");
      setSteps(normalizeSteps(workflowDetail.steps).length ? normalizeSteps(workflowDetail.steps) : [[]]);
    }
  }, [workflowDetail, editingId]);

  // Update JSON when workflow data changes
  useEffect(() => {
    if (showJson && view === "form") {
      try {
        const workflowData = {
          name,
          search: search || undefined,
          steps,
        };
        setJsonText(JSON.stringify(workflowData, null, 2));
        setJsonError(null);
      } catch (e) {
        setJsonError("Failed to serialize workflow data");
      }
    }
  }, [showJson, view, name, search, steps]);

  // Parse JSON when switching back to form view
  const handleJsonToForm = () => {
    if (!jsonText.trim()) {
      setShowJson(false);
      return;
    }
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed.name) setName(parsed.name);
      if (parsed.search !== undefined) setSearch(parsed.search || "");
      if (Array.isArray(parsed.steps)) {
        setSteps(normalizeSteps(parsed.steps));
      }
      setJsonError(null);
      setShowJson(false);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  useEffect(() => {
    if (execResult?.workflows?.[0]?.uid) {
      startJobStatus(execResult.workflows[0].uid);
    }
  }, [execResult?.workflows, startJobStatus]);

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setSearch("");
    setSteps([[]]);
    setView("form");
  };

  const openEdit = (id: number) => {
    setEditingId(id);
    setView("form");
  };

  const addStep = () => setSteps((s) => [...s, []]);
  const removeStep = (index: number) => setSteps((s) => s.filter((_, i) => i !== index));
  const updateStepOps = (stepIndex: number, ops: VideoOperation[]) => {
    setSteps((s) => {
      const next = [...s];
      next[stepIndex] = ops;
      return next;
    });
  };

  const handleSave = async () => {
    if (showJson) {
      // Save from JSON
      if (!jsonText.trim()) return;
      try {
        const parsed = JSON.parse(jsonText);
        if (!parsed.name?.trim()) {
          setJsonError("Name is required");
          return;
        }
        const payload = {
          name: parsed.name.trim(),
          search: parsed.search?.trim() || undefined,
          steps: parsed.steps || [],
        };
        if (editingId != null) {
          await update(editingId, { name: payload.name, search: payload.search, steps: payload.steps as unknown[][] });
        } else {
          await create(payload as import("@/lib/clipper-api").WorkflowCreateBody);
        }
        list({ limit: 50, last_id: 0 });
        setView("list");
        setEditingId(null);
        setShowJson(false);
        setJsonError(null);
      } catch (e) {
        setJsonError(e instanceof Error ? e.message : "Invalid JSON");
      }
    } else {
      // Save from form
      if (!name.trim()) return;
      const payload = { name: name.trim(), search: search.trim() || undefined, steps };
      try {
        if (editingId != null) {
          await update(editingId, { name: payload.name, search: payload.search, steps: payload.steps as unknown[][] });
        } else {
          await create(payload as import("@/lib/clipper-api").WorkflowCreateBody);
        }
        list({ limit: 50, last_id: 0 });
        setView("list");
        setEditingId(null);
      } catch {
        // error in hook
      }
    }
  };

  const openRun = (workflowId: number, workflowName: string) => {
    setRunModal({ workflowId, name: workflowName });
    setRunMedia("");
    setRunMediaName("");
  };

  const handleRun = async () => {
    if (!runModal || !runMedia.trim()) return;
    try {
      await execute({ media: runMedia.trim(), id: String(runModal.workflowId) });
      setRunModal(null);
      if (runModal.workflowId) {
        listExecutions(runModal.workflowId, { limit: 1, last_id: 0 }).then((result) => {
          setExecutionsCountMap((prev) => {
            const next = new Map(prev);
            next.set(runModal!.workflowId, result?.total ?? 0);
            return next;
          });
        });
      }
    } catch {
      // error in hook
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this workflow?")) return;
    try {
      await deleteWorkflow(id);
      list({ limit: 50, last_id: 0 });
    } catch {
      // error in hook
    }
  };

  const allWorkflows = useMemo(
    () => Array.from(workflowsMap.values()).sort((a, b) => (b.id ?? 0) - (a.id ?? 0)),
    [workflowsMap]
  );
  const filteredWorkflows = useMemo(() => {
    let out = filterByTime(allWorkflows, wfTimeFilter);
    if (wfSearch.trim()) {
      const q = wfSearch.trim().toLowerCase();
      out = out.filter((w) => {
        const name = (w.name ?? "").toLowerCase();
        const id = String(w.id ?? "").toLowerCase();
        return name.includes(q) || id.includes(q);
      });
    }
    return out;
  }, [allWorkflows, wfTimeFilter, wfSearch]);
  const filteredExecutions = useMemo(() => {
    let out = filterByTime(executionsList, execTimeFilter);
    if (execSearch.trim()) {
      const q = execSearch.trim().toLowerCase();
      out = out.filter((e) => {
        const name = (e.workflow_name ?? "").toLowerCase();
        const id = String(e.id).toLowerCase();
        const wfId = String(e.workflow_id).toLowerCase();
        return name.includes(q) || id.includes(q) || wfId.includes(q);
      });
    }
    return out;
  }, [executionsList, execTimeFilter, execSearch]);

  const loadMoreWorkflows = useCallback(() => {
    list({ limit: PAGE_SIZE, last_id: workflowsLastId }).then((res) => {
      if ((res?.workflows?.length ?? 0) < PAGE_SIZE) setWorkflowsHasMore(false);
    });
  }, [list, workflowsLastId]);
  const loadMoreExecutions = useCallback(() => {
    listAllExecutions({ limit: PAGE_SIZE, last_id: executionsLastId }).then((res) => {
      if ((res?.executions?.length ?? 0) < PAGE_SIZE) setExecutionsHasMore(false);
    });
  }, [listAllExecutions, executionsLastId]);

  const loadExecutionJobs = useCallback(async (executionId: number) => {
    setLoadingExecutionId(executionId);
    try {
      const out = await fetchJobs(executionId);
      if (out) {
        setExecutionJobsMap((prev) => {
          const next = new Map(prev);
          next.set(executionId, { uid: out.uid, jobs: (out.jobs as any[]) ?? [] });
          return next;
        });
      }
    } catch {
      // handled in hook
    } finally {
      setLoadingExecutionId(null);
    }
  }, [fetchJobs]);

  const toggleExecutionExpand = useCallback((executionId: number) => {
    setExpandedExecutionId((prev) => {
      const next = prev === executionId ? null : executionId;
      if (next != null && !executionJobsMap.has(next)) {
        loadExecutionJobs(next);
      }
      return next;
    });
  }, [executionJobsMap, loadExecutionJobs]);

  const toggleJobExpand = useCallback((executionId: number, jobId: number) => {
    setExpandedJobMap((prev) => {
      const next = new Map(prev);
      const current = next.get(executionId) ?? null;
      next.set(executionId, current === jobId ? null : jobId);
      return next;
    });
  }, []);

  const hasWfFilters = wfSearch !== "" || wfTimeFilter !== "all";
  const hasExecFilters = execSearch !== "" || execTimeFilter !== "all";
  const clearWfFilters = () => { setWfSearch(""); setWfTimeFilter("all"); };
  const clearExecFilters = () => { setExecSearch(""); setExecTimeFilter("all"); };

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-2" />
          New workflow
        </Button>
      </header>

      {error && <p className="text-sm text-destructive mb-4">{error.message}</p>}

      {view === "list" ? (
        <>
          <div className="flex items-center gap-2 border-b mb-4">
            <button
              onClick={() => setTab("workflows")}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                tab === "workflows"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Workflows
            </button>
            <button
              onClick={() => setTab("executions")}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                tab === "executions"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Executions
            </button>
          </div>
          {tab === "workflows" ? (
          <Card>
            <div className="flex flex-wrap items-center gap-2 py-2 px-4 border-b border-border">
              <Input
                placeholder="Search by name or ID…"
                value={wfSearch}
                onChange={(e) => setWfSearch(e.target.value)}
                className="h-9 max-w-xs"
              />
              <select
                value={wfTimeFilter}
                onChange={(e) => setWfTimeFilter(e.target.value as TimeFilter)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {TIME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {hasWfFilters && (
                <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={clearWfFilters}>
                  <X className="size-3.5" /> Clear filters
                </Button>
              )}
            </div>
            <CardContent className="p-0">
              {loading && workflowsMap.size === 0 ? (
                <TableSkeleton rows={8} columns={6} />
              ) : filteredWorkflows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <p className="text-muted-foreground text-sm">
                    {allWorkflows.length === 0 ? "No workflows yet" : "No workflows match your filters"}
                  </p>
                  {allWorkflows.length === 0 && (
                    <Button className="mt-4" onClick={openCreate}>Create first workflow</Button>
                  )}
                  {allWorkflows.length > 0 && hasWfFilters && (
                    <Button variant="outline" className="mt-4" onClick={clearWfFilters}>Clear filters</Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-fixed border-collapse text-left [&_th]:text-left [&_td]:text-left">
                    <colgroup>
                      <col style={{ width: "4.5rem" }} />
                      <col />
                      <col style={{ width: "6rem" }} />
                      <col style={{ width: "7rem" }} />
                      <col style={{ width: "8rem" }} />
                      <col style={{ width: "8.5rem" }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-border text-muted-foreground bg-muted/30">
                        <th className="w-10 py-3 pl-4 pr-2 font-medium text-left">ID</th>
                        <th className="py-3 px-2 font-medium text-left">Name</th>
                        <th className="py-3 px-2 font-medium text-left">Steps</th>
                        <th className="py-3 px-2 font-medium text-left">Executions</th>
                        <th className="py-3 px-2 font-medium text-left">Created</th>
                        <th className="py-3 pr-4 pl-2 font-medium text-right w-32">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWorkflows.map((w) => (
                        <tr key={w.id} className="border-b border-border hover:bg-muted/20">
                          <td className="py-2 pl-4 pr-2">
                            <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-2 py-0.5 font-mono text-xs" title={String(w.id)}>
                              {w.id}
                              <Copy className="size-3 opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(String(w.id)); }} />
                            </span>
                          </td>
                          <td className="py-2 px-2 font-medium">{w.name ?? "—"}</td>
                          <td className="py-2 px-2 text-muted-foreground">{Array.isArray(w.steps) ? w.steps.length : 0} steps</td>
                          <td className="py-2 px-2 text-muted-foreground">{executionsCountMap.get(w.id ?? 0) ?? 0} times</td>
                          <td className="py-2 px-2 text-muted-foreground text-xs whitespace-nowrap" title={formatExact(w.created_at)}>{formatRelative(w.created_at)}</td>
                          <td className="py-2 pr-4 pl-2 text-right">
                            <div className="flex items-center justify-end gap-0.5">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(w.id!)} title="Edit">
                                <Pencil className="size-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openRun(w.id!, w.name ?? "")} title="Run">
                                <Play className="size-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(w.id!)} disabled={deleting} title="Delete">
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!loading && filteredWorkflows.length > 0 && workflowsHasMore && (
                <div className="flex justify-center py-4 border-t border-border">
                  <Button variant="outline" onClick={loadMoreWorkflows} disabled={loading}>Load more</Button>
                </div>
              )}
            </CardContent>
          </Card>
          ) : (
          <Card>
            <div className="flex flex-wrap items-center gap-2 py-2 px-4 border-b border-border">
              <Input
                placeholder="Search by workflow name or ID…"
                value={execSearch}
                onChange={(e) => setExecSearch(e.target.value)}
                className="h-9 max-w-xs"
              />
              <select
                value={execTimeFilter}
                onChange={(e) => setExecTimeFilter(e.target.value as TimeFilter)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {TIME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {hasExecFilters && (
                <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={clearExecFilters}>
                  <X className="size-3.5" /> Clear filters
                </Button>
              )}
            </div>
            <CardContent className="p-0">
              {loadingAllExecutions && executionsList.length === 0 ? (
                <TableSkeleton rows={8} columns={6} />
              ) : filteredExecutions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <p className="text-muted-foreground text-sm">
                    {executionsList.length === 0 ? "No executions yet" : "No executions match your filters"}
                  </p>
                  {executionsList.length > 0 && hasExecFilters && (
                    <Button variant="outline" className="mt-4" onClick={clearExecFilters}>Clear filters</Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-fixed border-collapse text-left [&_th]:text-left [&_td]:text-left">
                    <colgroup>
                      <col style={{ width: "4.5rem" }} />
                      <col />
                      <col style={{ width: "6rem" }} />
                      <col style={{ width: "8rem" }} />
                      <col style={{ width: "7rem" }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-border text-muted-foreground bg-muted/30">
                        <th className="w-10 py-3 pl-4 pr-2 font-medium text-left">ID</th>
                        <th className="py-3 px-2 font-medium text-left">Workflow</th>
                        <th className="py-3 px-2 font-medium text-left">Progress</th>
                        <th className="py-3 px-2 font-medium text-left">Created</th>
                        <th className="py-3 pr-4 pl-2 font-medium text-right w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExecutions.map((exec) => {
                        const isExpanded = expandedExecutionId === exec.id;
                        const jobsData = executionJobsMap.get(exec.id);
                        const jobs = jobsData?.jobs ?? [];
                        const expandedJobId = expandedJobMap.get(exec.id) ?? null;
                        return (
                          <>
                            <tr
                              key={exec.id}
                              className={cn(
                                "border-b border-border hover:bg-muted/20 cursor-pointer transition-colors",
                                isExpanded && "bg-muted/20"
                              )}
                              onClick={() => toggleExecutionExpand(exec.id)}
                            >
                              <td className="py-2 pl-4 pr-2">
                                <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-2 py-0.5 font-mono text-xs" title={String(exec.id)}>
                                  {exec.id}
                                  <Copy
                                    className="size-3 opacity-60 hover:opacity-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(String(exec.id));
                                    }}
                                  />
                                </span>
                              </td>
                              <td className="py-2 px-2 text-muted-foreground">{exec.workflow_name ?? `Workflow ${exec.workflow_id}`}</td>
                              <td className="py-2 px-2 text-muted-foreground">{exec.progress ?? 0}%</td>
                              <td className="py-2 px-2 text-muted-foreground text-xs whitespace-nowrap" title={formatExact(exec.created_at)}>{formatRelative(exec.created_at)}</td>
                              <td className="py-2 pr-4 pl-2 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => toggleExecutionExpand(exec.id)}
                                    title={isExpanded ? "Collapse" : "Expand"}
                                  >
                                    {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${exec.id}-expand`}>
                                <td colSpan={5} className="p-0">
                                  <div className="px-4 py-4 border-t border-border bg-muted/10">
                                    <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                                      <span className="text-muted-foreground">Execution ID</span>
                                      <span className="font-mono">{exec.id}</span>
                                      <span className="text-muted-foreground">Workflow</span>
                                      <span className="text-muted-foreground">{exec.workflow_name ?? `Workflow ${exec.workflow_id}`}</span>
                                      <span className="text-muted-foreground">Progress</span>
                                      <span className="text-muted-foreground">{exec.progress ?? 0}%</span>
                                      <span className="text-muted-foreground">Created</span>
                                      <span>{formatExact(exec.created_at)}</span>
                                      <span className="text-muted-foreground">Updated</span>
                                      <span>{formatExact(exec.updated_at)}</span>
                                    </div>

                                    <div className="text-xs text-muted-foreground mb-2">
                                      Jobs {jobsData?.uid ? `(UID: ${jobsData.uid})` : ""}
                                    </div>
                                    {loadingExecutionId === exec.id ? (
                                      <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                                        <Loader2 className="size-4 animate-spin" />
                                        Loading jobs…
                                      </div>
                                    ) : jobs.length > 0 ? (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm table-fixed border-collapse text-left [&_th]:text-left [&_td]:text-left">
                                          <colgroup>
                                            <col style={{ width: "5rem" }} />
                                            <col style={{ width: "8rem" }} />
                                            <col />
                                            <col style={{ width: "7rem" }} />
                                          </colgroup>
                                          <thead>
                                            <tr className="border-b border-border text-muted-foreground bg-muted/30">
                                              <th className="py-2 pr-2 pl-2 font-medium text-left">Job ID</th>
                                              <th className="py-2 px-2 font-medium text-left">Status</th>
                                              <th className="py-2 px-2 font-medium text-left">Output</th>
                                              <th className="py-2 px-2 font-medium text-right">Actions</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {jobs.map((job) => {
                                              const isJobExpanded = expandedJobId === job.id;
                                              const output = getJobOutput(job);
                                              const outputLabel = output?.filename ?? output?.url ?? "—";
                                              return (
                                                <>
                                                  <tr
                                                    key={job.id}
                                                    className={cn(
                                                      "border-b border-border hover:bg-muted/20 cursor-pointer transition-colors",
                                                      isJobExpanded && "bg-muted/20"
                                                    )}
                                                    onClick={() => toggleJobExpand(exec.id, job.id)}
                                                  >
                                                    <td className="py-2 pl-2 pr-2 font-mono text-xs">{job.id}</td>
                                                    <td className="py-2 px-2 text-muted-foreground">{job.status ?? "—"}</td>
                                                    <td className="py-2 px-2 text-muted-foreground truncate" title={String(outputLabel)}>
                                                      {outputLabel}
                                                    </td>
                                                    <td className="py-2 px-2 text-right" onClick={(e) => e.stopPropagation()}>
                                                      <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7"
                                                        onClick={() => toggleJobExpand(exec.id, job.id)}
                                                        title={isJobExpanded ? "Collapse" : "Expand"}
                                                      >
                                                        {isJobExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                                      </Button>
                                                    </td>
                                                  </tr>
                                                  {isJobExpanded && (
                                                    <tr key={`${job.id}-expand`}>
                                                      <td colSpan={4} className="p-0">
                                                        <div className="px-3 py-3 bg-muted/10 border-t border-border">
                                                          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                                            <span className="text-muted-foreground">Job ID</span>
                                                            <span className="font-mono">{job.id}</span>
                                                            <span className="text-muted-foreground">Status</span>
                                                            <span>{job.status ?? "—"}</span>
                                                            <span className="text-muted-foreground">Updated</span>
                                                            <span>{formatDate(job.updated_at)}</span>
                                                            <span className="text-muted-foreground">Progress</span>
                                                            <span>{job.progress ?? job.percent ?? 0}%</span>
                                                          </div>
                                                          {job.error && (
                                                            <div className="mb-3">
                                                              <span className="text-muted-foreground text-xs">Error</span>
                                                              <div className="mt-1 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive whitespace-pre-wrap">
                                                                {String(job.error)}
                                                              </div>
                                                            </div>
                                                          )}
                                                          {output?.filename && (
                                                            <div className="mb-3">
                                                              <p className="text-muted-foreground text-xs mb-2">Output</p>
                                                              {output.url ? (
                                                                <>
                                                                  <VideoPlayer url={output.url} filename={output.filename} maxHeight="max-h-64" />
                                                                  <p className="mt-1 font-mono text-[11px] break-all text-muted-foreground">
                                                                    {output.url}
                                                                  </p>
                                                                </>
                                                              ) : (
                                                                <p className="text-xs font-mono break-all">{output.filename}</p>
                                                              )}
                                                            </div>
                                                          )}
                                                          <div>
                                                            <p className="text-muted-foreground text-xs mb-2">Raw job data</p>
                                                            <pre className="text-[11px] whitespace-pre-wrap break-words rounded border bg-background p-2">
                                                              {JSON.stringify(job, null, 2)}
                                                            </pre>
                                                          </div>
                                                        </div>
                                                      </td>
                                                    </tr>
                                                  )}
                                                </>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    ) : (
                                      <p className="text-muted-foreground text-sm py-2">
                                        No jobs found for this execution.
                                      </p>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!loadingAllExecutions && filteredExecutions.length > 0 && executionsHasMore && (
                <div className="flex justify-center py-4 border-t border-border">
                  <Button variant="outline" onClick={loadMoreExecutions} disabled={loadingAllExecutions}>Load more</Button>
                </div>
              )}
            </CardContent>
          </Card>
          )}
        </>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{editingId != null ? "Edit workflow" : "New workflow"}</CardTitle>
                <CardDescription>Name and steps (each step is a list of operations).</CardDescription>
              </div>
              <Button
                variant={showJson ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (showJson) {
                    handleJsonToForm();
                  } else {
                    setShowJson(true);
                  }
                }}
              >
                <Code className="size-4 mr-1" />
                {showJson ? "Form View" : "JSON View"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {showJson ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">JSON Data</Label>
                </div>
                <Textarea
                  value={jsonText}
                  onChange={(e) => {
                    setJsonText(e.target.value);
                    setJsonError(null);
                    try {
                      JSON.parse(e.target.value);
                    } catch {
                      setJsonError("Invalid JSON");
                    }
                  }}
                  className="font-mono text-xs min-h-[400px]"
                  placeholder='{"name": "My Workflow", "search": "", "steps": [[{"op": "trim", "start_sec": 0, "end_sec": -1}]]}'
                />
                {jsonError && (
                  <p className="text-xs text-destructive">{jsonError}</p>
                )}
                {!jsonError && jsonText && (
                  <p className="text-xs text-muted-foreground">Valid JSON</p>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Workflow name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Search (optional)</Label>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search tag"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label>Steps</Label>
                    <Button type="button" variant="outline" size="xs" onClick={addStep}>
                      <Plus className="size-3.5 mr-1" />
                      Add step
                    </Button>
                  </div>
                  {steps.map((stepOps, stepIndex) => (
                    <div key={stepIndex} className="rounded-xl border bg-muted/20 p-4 mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium">Step {stepIndex + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => removeStep(stepIndex)}
                          disabled={steps.length <= 1}
                          aria-label="Remove step"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <WorkflowStepEditor
                        operations={stepOps}
                        onOperationsChange={(ops) => updateStepOps(stepIndex, ops)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={creating || updating || (showJson ? !jsonText.trim() : !name.trim())}>
                {(creating || updating) && <Loader2 className="size-4 mr-2 animate-spin" />}
                {showJson && <Save className="size-4 mr-2" />}
                {editingId != null ? "Save" : "Create"}
              </Button>
              <Button variant="outline" onClick={() => { setView("list"); setEditingId(null); setShowJson(false); setJsonError(null); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <RunWorkflowDialog
        open={runModal != null}
        onOpenChange={(open) => !open && setRunModal(null)}
        workflowName={runModal?.name ?? ""}
        media={runMedia}
        mediaName={runMediaName}
        onMediaSelect={setRunMedia}
        onMediaNameSelect={setRunMediaName}
        onRun={handleRun}
        executing={executing}
      />

      {execResult?.workflows?.[0]?.uid && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Run status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">UID: {execResult.workflows[0].uid}</p>
            {job && (
              <div className="mt-2 space-y-2">
                <p className="text-sm">
                  Status: <span className="font-medium">{job.status}</span>
                </p>
                {job.output && typeof job.output === "object" && "filename" in job.output && (
                  <div className="pt-2 border-t">
                    {job.output && typeof job.output === "object" && "url" in job.output ? (
                      <VideoPlayer
                        url={String((job.output as { url?: string }).url)}
                        filename={String((job.output as { filename?: string }).filename)}
                        maxHeight="max-h-64"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Output: {String((job.output as { filename?: string }).filename)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WorkflowStepEditor({
  operations,
  onOperationsChange,
}: {
  operations: VideoOperation[];
  onOperationsChange: (ops: VideoOperation[]) => void;
}) {
  const addOp = useCallback((op: VideoOperation) => {
    onOperationsChange([...operations, op]);
  }, [operations, onOperationsChange]);
  const removeOp = useCallback((index: number) => {
    onOperationsChange(operations.filter((_, i) => i !== index));
  }, [operations, onOperationsChange]);
  const updateOp = useCallback((index: number, op: VideoOperation) => {
    const next = [...operations];
    next[index] = op;
    onOperationsChange(next);
  }, [operations, onOperationsChange]);

  return (
    <OperationList
      operations={operations}
      onAdd={addOp}
      onRemove={removeOp}
      onUpdate={updateOp}
      addTrim={() => addOp(defaultTrimOp)}
      addKaraoke={() => addOp(defaultKaraokeOp)}
      addTextSequence={() => addOp(defaultTextSequenceOp)}
      addText={() => addOp({ op: "text", segment: [defaultTextSegment()] })}
      addSpeed={(speed = 1) => addOp(defaultSpeedOp(speed))}
      addWatermark={() => addOp(defaultWatermarkOp)}
      addAudio={() => addOp(defaultAudioOp)}
      addBackgroundColor={() => addOp(defaultBackgroundColorOp)}
      addTranscode={() => addOp(defaultTranscodeOp)}
      addCompress={() => addOp(defaultCompressOp)}
      addConcat={() => addOp(defaultConcatOp)}
      addExtractAudio={() => addOp(defaultExtractAudioOp)}
      addGif={() => addOp(defaultGifOp)}
      addDownloadFromYouTube={() => addOp(defaultDownloadFromYouTubeOp)}
    />
  );
}

function RunWorkflowDialog({
  open,
  onOpenChange,
  workflowName,
  media,
  mediaName,
  onMediaSelect,
  onMediaNameSelect,
  onRun,
  executing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowName: string;
  media: string;
  mediaName: string;
  onMediaSelect: (url: string) => void;
  onMediaNameSelect: (name: string) => void;
  onRun: () => void;
  executing: boolean;
}) {
  const [showBucket, setShowBucket] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={showBucket ? "max-w-2xl max-h-[80vh] overflow-y-auto" : "max-w-md"}>
        {showBucket ? (
          <>
            <div className="text-lg font-semibold mb-2">Pick from bucket</div>
            <BucketBrowser
              compact
              onSelect={(url, filename) => {
                onMediaSelect(url);
                onMediaNameSelect(filename);
                setShowBucket(false);
              }}
            />
            <Button variant="outline" onClick={() => setShowBucket(false)}>Back</Button>
          </>
        ) : (
          <>
            <div className="text-lg font-semibold mb-2">Run workflow</div>
            <p className="text-sm text-muted-foreground">Workflow: {workflowName}</p>
            <div className="space-y-2">
              <Label>Source media URL</Label>
              <div className="flex gap-2">
                <Input
                  value={media}
                  onChange={(e) => onMediaSelect(e.target.value)}
                  placeholder="https://... or file URL"
                />
                <Button type="button" variant="outline" onClick={() => setShowBucket(true)}>
                  Bucket
                </Button>
              </div>
              {media && (
                <p className="text-xs text-muted-foreground truncate" title={media}>
                  {mediaName || media.split("/").pop() || media}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={onRun} disabled={!media.trim() || executing}>
                {executing && <Loader2 className="size-4 mr-2 animate-spin" />}
                Run
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
