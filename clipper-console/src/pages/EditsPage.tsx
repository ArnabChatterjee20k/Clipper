/**
 * List of past edits (jobs) with View / Retry / Cancel. Detail modal shows full edit and operation summary.
 */

import { useEffect, useState } from "react";
import {
  useListEdits,
  useGetEdit,
  useRetryEdit,
  useCancelEdit,
  type EditItem,
} from "@/hooks/use-clipper-api";
import { OperationSummary } from "@/components/video-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, Eye, RotateCcw, XCircle } from "lucide-react";

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
  const [detailId, setDetailId] = useState<number | null>(null);

  useEffect(() => {
    list({ limit: 50, last_id: 0 });
  }, [list]);

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

  const edits = data?.edits ?? [];
  const canRetry = (status: string | undefined) =>
    status === "error" || status === "cancelled";
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
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">ID</th>
                    <th className="pb-2 pr-4 font-medium">UID</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Created</th>
                    <th className="pb-2 pr-4 font-medium">Operations</th>
                    <th className="pb-2 font-medium">Actions</th>
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
                        <Badge variant={STATUS_VARIANTS[edit.status ?? ""] ?? "secondary"}>
                          {edit.status ?? "—"}
                        </Badge>
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
      />
    </div>
  );
}

function EditDetailDialog({
  open,
  onOpenChange,
  edit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit: EditItem | null;
  loading: boolean;
}) {
  const output = edit?.output as { filename?: string } | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Edit details" className="max-w-lg max-h-[85vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : edit ? (
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
        ) : (
          <p className="text-muted-foreground text-sm">No data.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
