/**
 * Workflows: list, create/edit (multi-step), run with media + job status.
 */

import { useEffect, useState, useCallback } from "react";
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
import { Loader2, Plus, Pencil, Play, Trash2, Code, Save } from "lucide-react";
import { cn } from "@/lib/utils";

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Normalize backend steps (may be raw JSON) to VideoOperation[][] */
function normalizeSteps(steps: unknown): VideoOperation[][] {
  if (!Array.isArray(steps)) return [];
  return steps.map((step) => {
    if (!Array.isArray(step)) return [];
    return step.map((op) => (typeof op === "object" && op !== null && "op" in op ? (op as VideoOperation) : op as VideoOperation));
  });
}

export function WorkflowsPage() {
  const { list, loading, error, data } = useListWorkflows();
  const { get, data: workflowDetail } = useGetWorkflow();
  const { create, loading: creating } = useCreateWorkflow();
  const { update, loading: updating } = useUpdateWorkflow();
  const { execute, loading: executing, data: execResult } = useExecuteWorkflow();
  const { start: startJobStatus, job } = useJobStatus();
  const { deleteWorkflow, loading: deleting } = useDeleteWorkflow();
  const [executionsMap, setExecutionsMap] = useState<Map<number, number>>(new Map());
  const { list: listExecutions } = useListWorkflowExecutions();
  const { list: listAllExecutions, loading: loadingAllExecutions, data: allExecutionsData } = useListAllExecutions();

  const [view, setView] = useState<"list" | "form">("list");
  const [tab, setTab] = useState<"workflows" | "executions">("workflows");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [steps, setSteps] = useState<VideoOperation[][]>([[]]);
  const [runModal, setRunModal] = useState<{ workflowId: number; name: string } | null>(null);
  const [runMedia, setRunMedia] = useState("");
  const [runMediaName, setRunMediaName] = useState("");
  const { fetchJobs, loading: loadingExecutionJobs, data: executionJobs } = useExecutionJobs();
  const [selectedExecutionId, setSelectedExecutionId] = useState<number | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    list({ limit: 50, last_id: 0 });
  }, [list]);

  // Load execution counts for all workflows
  useEffect(() => {
    if (data?.workflows) {
      data.workflows.forEach((w) => {
        if (w.id) {
          listExecutions(w.id, { limit: 1, last_id: 0 }).then((result) => {
            setExecutionsMap((prev) => {
              const next = new Map(prev);
              next.set(w.id!, result?.total ?? 0);
              return next;
            });
          });
        }
      });
    }
  }, [data, listExecutions]);

  // Load all executions when executions tab is active
  useEffect(() => {
    if (tab === "executions") {
      listAllExecutions({ limit: 100, last_id: 0 });
    }
  }, [tab, listAllExecutions]);

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
      // Refresh execution count
      if (runModal.workflowId) {
        listExecutions(runModal.workflowId, { limit: 1, last_id: 0 }).then((result) => {
          setExecutionsMap((prev) => {
            const next = new Map(prev);
            next.set(runModal.workflowId, result?.total ?? 0);
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

  const workflows = data?.workflows ?? [];

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Create multi-step edits and run them with any source media.
        </p>
      </header>

      {error && <p className="text-sm text-destructive mb-4">{error.message}</p>}

      {view === "list" ? (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2 border-b">
              <button
                onClick={() => setTab("workflows")}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
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
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  tab === "executions"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                Executions
              </button>
            </div>
            <Button onClick={openCreate}>
              <Plus className="size-4 mr-2" />
              New workflow
            </Button>
          </div>
          {tab === "workflows" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workflows</CardTitle>
              <CardDescription>Open to edit, or Run with a source video.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : workflows.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8">No workflows yet. Create one to get started.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium text-center">Name</th>
                        <th className="pb-2 pr-4 font-medium text-center">ID</th>
                        <th className="pb-2 pr-4 font-medium text-center">Created</th>
                        <th className="pb-2 pr-4 font-medium text-center">Steps</th>
                        <th className="pb-2 pr-4 font-medium text-center">Executions</th>
                        <th className="pb-2 font-medium text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workflows.map((w) => (
                        <tr key={w.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 pr-4 font-medium">{w.name ?? "—"}</td>
                          <td className="py-2 pr-4 font-mono text-xs">{w.id}</td>
                          <td className="py-2 pr-4 text-muted-foreground text-xs">
                            {formatDate(w.created_at)}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {Array.isArray(w.steps) ? w.steps.length : 0} steps
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground text-center">
                            {executionsMap.get(w.id ?? 0) ?? 0} times
                          </td>
                          <td className="py-2 flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => openEdit(w.id!)}
                            >
                              <Pencil className="size-3.5 mr-1" />
                              Open
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => openRun(w.id!, w.name ?? "")}
                            >
                              <Play className="size-3.5 mr-1" />
                              Run
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleDelete(w.id!)}
                              disabled={deleting}
                            >
                              <Trash2 className="size-3.5 mr-1" />
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Executions</CardTitle>
              <CardDescription>Execution history across all workflows.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAllExecutions ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : allExecutionsData?.executions && allExecutionsData.executions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium text-center">ID</th>
                        <th className="pb-2 pr-4 font-medium text-center">Workflow</th>
                        <th className="pb-2 pr-4 font-medium text-center">Created</th>
                        <th className="pb-2 pr-4 font-medium text-center">Updated</th>
                        <th className="pb-2 font-medium text-center">Progress</th>
                        <th className="pb-2 font-medium text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allExecutionsData.executions.map((exec) => (
                        <tr key={exec.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 pr-4 font-mono text-xs text-center">{exec.id}</td>
                          <td className="py-2 pr-4 text-muted-foreground text-xs text-center">
                            {exec.workflow_name ?? `Workflow ${exec.workflow_id}`}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground text-xs text-center">
                            {formatDate(exec.created_at)}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground text-xs text-center">
                            {formatDate(exec.updated_at)}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground text-center">
                            {exec.progress ?? 0}%
                          </td>
                          <td className="py-2 pr-4 text-center">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => {
                                setSelectedExecutionId(exec.id);
                                fetchJobs(exec.id);
                              }}
                              disabled={loadingExecutionJobs && selectedExecutionId === exec.id}
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm py-8">No executions yet.</p>
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
      {selectedExecutionId != null && (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Execution jobs</CardTitle>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setSelectedExecutionId(null)}
              >
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {executionJobs?.uid && (
              <p className="text-xs text-muted-foreground mb-2">UID: {executionJobs.uid}</p>
            )}
            {loadingExecutionJobs ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </div>
            ) : executionJobs?.jobs && (executionJobs.jobs as any[]).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium text-center">Job ID</th>
                      <th className="pb-2 pr-4 font-medium text-center">Status</th>
                      <th className="pb-2 font-medium text-center">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(executionJobs.jobs as any[]).map((job) => (
                      <tr key={job.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 pr-4 font-mono text-xs text-center">{job.id}</td>
                        <td className="py-2 pr-4 text-muted-foreground text-center">
                          {job.status}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground text-xs text-center">
                          {job.updated_at ? formatDate(job.updated_at) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm py-4">
                No jobs found for this execution.
              </p>
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
