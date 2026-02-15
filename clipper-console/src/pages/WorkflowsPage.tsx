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
} from "@/types/edit-session";
import { OperationList } from "@/components/video-editor";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BucketBrowser } from "@/components/bucket/BucketBrowser";
import { Loader2, Plus, Pencil, Play, Trash2 } from "lucide-react";

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

  const [view, setView] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [steps, setSteps] = useState<VideoOperation[][]>([[]]);
  const [runModal, setRunModal] = useState<{ workflowId: number; name: string } | null>(null);
  const [runMedia, setRunMedia] = useState("");
  const [runMediaName, setRunMediaName] = useState("");

  useEffect(() => {
    list({ limit: 50, last_id: 0 });
  }, [list]);

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
          <div className="flex justify-end mb-4">
            <Button onClick={openCreate}>
              <Plus className="size-4 mr-2" />
              New workflow
            </Button>
          </div>
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
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Name</th>
                        <th className="pb-2 pr-4 font-medium">ID</th>
                        <th className="pb-2 pr-4 font-medium">Created</th>
                        <th className="pb-2 pr-4 font-medium">Steps</th>
                        <th className="pb-2 font-medium">Actions</th>
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
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editingId != null ? "Edit workflow" : "New workflow"}</CardTitle>
            <CardDescription>Name and steps (each step is a list of operations).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={creating || updating || !name.trim()}>
                {(creating || updating) && <Loader2 className="size-4 mr-2 animate-spin" />}
                {editingId != null ? "Save" : "Create"}
              </Button>
              <Button variant="outline" onClick={() => { setView("list"); setEditingId(null); }}>
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
              <p className="text-sm mt-1">
                Status: <span className="font-medium">{job.status}</span>
                {job.output && typeof job.output === "object" && "filename" in job.output && (
                  <span className="block text-muted-foreground text-xs mt-1">
                    Output: {String((job.output as { filename?: string }).filename)}
                  </span>
                )}
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
