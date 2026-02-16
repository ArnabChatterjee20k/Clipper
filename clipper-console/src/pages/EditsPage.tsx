/**
 * List of past edits (jobs) with View / Retry / Cancel. Detail modal shows full edit and operation summary.
 */

import { useEffect, useState, useRef } from "react";
import {
  useListEdits,
  useGetEdit,
  useRetryEdit,
  useCancelEdit,
  useUpdateEdit,
  type EditItem,
  type JobUpdate,
} from "@/hooks/use-clipper-api";
import { OperationSummary } from "@/components/video-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Eye, RotateCcw, XCircle, Code, Save } from "lucide-react";
import { CLIPPER_API_BASE } from "@/lib/clipper-api";

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "secondary",
  processing: "default",
  completed: "outline",
  error: "destructive",
  cancelled: "secondary",
};

function shortUid(uid: string | undefined): string {
  if (!uid) return "—";
  return uid.length > 8 ? `${uid.slice(0, 8)}…` : uid;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export function EditsPage() {
  const { list, loading, error, data } = useListEdits();
  const { get, loading: loadingDetail, data: detail } = useGetEdit();
  const { retry, loading: retrying } = useRetryEdit();
  const { cancel, loading: cancelling } = useCancelEdit();
  const { update: updateEdit, loading: updatingEdit } = useUpdateEdit();
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editsMap, setEditsMap] = useState<Map<number, EditItem>>(new Map());
  const sourcesRef = useRef<Map<string, EventSource>>(new Map());

  useEffect(() => {
    list({ limit: 50, last_id: 0 });
  }, [list]);

  useEffect(() => {
    if (data?.edits) {
      const map = new Map<number, EditItem>();
      data.edits.forEach((edit) => {
        map.set(edit.id, edit);
      });
      setEditsMap(map);
    }
  }, [data]);

  // Set up SSE streams for all edits with UIDs
  useEffect(() => {
    const sources = sourcesRef.current;
    const uids = new Set<string>();
    
    editsMap.forEach((edit) => {
      if (edit.uid && (edit.status === "queued" || edit.status === "processing")) {
        uids.add(edit.uid);
      }
    });

    // Close sources for UIDs no longer in the list
    sources.forEach((source, uid) => {
      if (!uids.has(uid)) {
        source.close();
        sources.delete(uid);
      }
    });

    // Create new sources for UIDs not yet tracked
    uids.forEach((uid) => {
      if (!sources.has(uid)) {
        const url = `${CLIPPER_API_BASE}/edits/status?uid=${encodeURIComponent(uid)}`;
        const source = new EventSource(url);
        sources.set(uid, source);

        source.addEventListener("job_update", (event: MessageEvent) => {
          try {
            const job = JSON.parse(event.data) as JobUpdate;
            setEditsMap((prev) => {
              const next = new Map(prev);
              prev.forEach((edit, id) => {
                if (edit.uid === job.uid) {
                  next.set(id, {
                    ...edit,
                    status: job.status ?? edit.status,
                    output: job.output ?? edit.output,
                    updated_at: job.updated_at ?? edit.updated_at,
                    progress: (job as { progress?: number }).progress ?? edit.progress,
                    error: (job as { error?: string | null }).error ?? edit.error,
                  });
                }
              });
              return next;
            });
          } catch {
            // ignore parse errors
          }
        });

        source.onerror = () => {
          source.close();
          sources.delete(uid);
        };
      }
    });

    return () => {
      sources.forEach((source) => source.close());
      sources.clear();
    };
  }, [editsMap]);

  useEffect(() => {
    if (detailId != null) get(detailId);
  }, [detailId, get]);

  const handleView = (id: number) => setDetailId(id);
  const handleCloseDetail = () => setDetailId(null);

  const handleRetry = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await retry(id);
      list({ limit: 50, last_id: 0 });
      if (detailId === id) get(id);
    } catch {
      // error in hook
    }
  };

  const handleCancel = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await cancel(id);
      list({ limit: 50, last_id: 0 });
      if (detailId === id) get(id);
    } catch {
      // error in hook
    }
  };

  const edits = Array.from(editsMap.values()).sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  const canRetry = (status: string | undefined) =>
    status === "error" || status === "cancelled" || status === "completed";
  const canCancel = (status: string | undefined) =>
    status === "queued" || status === "processing";

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Edits</h1>
        <p className="text-muted-foreground text-sm mt-1">
          List of edit jobs. View details, retry failed, or cancel queued.
        </p>
      </header>

      {error && (
        <p className="text-sm text-destructive mb-4">{error.message}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent edits</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : edits.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8">No edits yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium text-center">ID</th>
                    <th className="pb-2 pr-4 font-medium text-center">UID</th>
                    <th className="pb-2 pr-4 font-medium text-center">Status</th>
                    <th className="pb-2 pr-4 font-medium text-center">Created</th>
                    <th className="pb-2 pr-4 font-medium text-center">Operations</th>
                    <th className="pb-2 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {edits.map((edit) => (
                    <tr
                      key={edit.id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="py-2 pr-4 font-mono text-xs">{edit.id}</td>
                      <td className="py-2 pr-4 font-mono text-xs" title={edit.uid}>
                        {shortUid(edit.uid)}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-col gap-1">
                          <Badge variant={STATUS_VARIANTS[edit.status ?? ""] ?? "secondary"}>
                            {edit.status ?? "—"}
                          </Badge>
                          {edit.status === "error" && edit.error && (
                            <p className="text-xs text-destructive mt-1 max-w-[200px] truncate" title={edit.error}>
                              {edit.error}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground text-xs">
                        {formatDate(edit.created_at)}
                      </td>
                      <td className="py-2 pr-4 max-w-[200px]">
                        <OperationSummary
                          action={Array.isArray(edit.action) ? edit.action : []}
                          compact
                        />
                      </td>
                      <td className="py-2 flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleView(edit.id)}
                          aria-label="View"
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        {canRetry(edit.status) && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => handleRetry(e, edit.id)}
                            disabled={retrying}
                            aria-label="Retry"
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>
                        )}
                        {canCancel(edit.status) && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => handleCancel(e, edit.id)}
                            disabled={cancelling}
                            aria-label="Cancel"
                          >
                            <XCircle className="size-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditDetailDialog
        open={detailId != null}
        onOpenChange={(open) => !open && handleCloseDetail()}
        edit={detail}
        loading={loadingDetail}
        onUpdate={async (id, body) => {
          await updateEdit(id, body as import("@/lib/clipper-api").EditUpdateBody);
          list({ limit: 50, last_id: 0 });
          if (detailId === id) get(id);
        }}
        updating={updatingEdit}
      />
    </div>
  );
}

function EditDetailDialog({
  open,
  onOpenChange,
  edit,
  loading,
  onUpdate,
  updating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit: EditItem | null;
  loading: boolean;
  onUpdate?: (id: number, body: { status?: string; progress?: number; error?: string }) => Promise<void>;
  updating?: boolean;
}) {
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const output = edit?.output as { filename?: string } | undefined;

  useEffect(() => {
    if (edit && showJson) {
      try {
        setJsonText(JSON.stringify(edit, null, 2));
        setJsonError(null);
      } catch (e) {
        setJsonError("Failed to serialize edit data");
      }
    }
  }, [edit, showJson]);

  const handleSaveJson = async () => {
    if (!edit || !onUpdate) return;
    try {
      const parsed = JSON.parse(jsonText);
      // Only allow updating certain fields via JSON
      const updateBody: { status?: string; progress?: number; error?: string } = {};
      if (parsed.status !== undefined) updateBody.status = parsed.status;
      if (parsed.progress !== undefined) updateBody.progress = parsed.progress;
      if (parsed.error !== undefined && parsed.error !== null) updateBody.error = parsed.error;
      await onUpdate(edit.id!, updateBody);
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Edit details" className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : edit ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant={showJson ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowJson(!showJson)}
                >
                  <Code className="size-4 mr-1" />
                  {showJson ? "Form View" : "JSON View"}
                </Button>
              </div>
            </div>

            {showJson ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">JSON Data</Label>
                  {onUpdate && (
                    <Button
                      size="sm"
                      onClick={handleSaveJson}
                      disabled={updating || !!jsonError}
                    >
                      {updating ? (
                        <Loader2 className="size-4 mr-1 animate-spin" />
                      ) : (
                        <Save className="size-4 mr-1" />
                      )}
                      Save Changes
                    </Button>
                  )}
                </div>
                <Textarea
                  value={jsonText}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                    setJsonText(e.target.value);
                    setJsonError(null);
                    try {
                      JSON.parse(e.target.value);
                    } catch {
                      setJsonError("Invalid JSON");
                    }
                  }}
                  className="font-mono text-xs min-h-[400px]"
                  placeholder="Paste or edit JSON here..."
                />
                {jsonError && (
                  <p className="text-xs text-destructive">{jsonError}</p>
                )}
                {!jsonError && jsonText && (
                  <p className="text-xs text-muted-foreground">Valid JSON</p>
                )}
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">ID</span>
                  <span className="font-mono">{edit.id}</span>
                  <span className="text-muted-foreground">UID</span>
                  <span className="font-mono text-xs break-all">{edit.uid}</span>
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={STATUS_VARIANTS[edit.status ?? ""] ?? "secondary"}>
                    {edit.status ?? "—"}
                  </Badge>
                  <span className="text-muted-foreground">Created</span>
                  <span>{formatDate(edit.created_at)}</span>
                </div>
                {edit.status === "error" && edit.error && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Error</span>
                    <div className="mt-1 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
                      {edit.error}
                    </div>
                  </div>
                )}
                {edit.input && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Input</p>
                    <p className="truncate text-xs font-mono" title={edit.input}>
                      {edit.input}
                    </p>
                  </div>
                )}
                {output?.filename && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Output</p>
                    <p className="text-xs font-mono">{output.filename}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs mb-2">Operations</p>
                  <OperationSummary
                    action={Array.isArray(edit.action) ? edit.action : []}
                    compact={false}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No data.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
