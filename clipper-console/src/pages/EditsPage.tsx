/**
 * Edits dashboard: production-grade table with filters, status badges,
 * operation chips, expandable rows, bulk actions, Load More.
 */

import { useEffect, useState, useRef, useMemo, useCallback, Fragment } from "react";
import { Link } from "react-router-dom";
import {
  useListEdits,
  useGetEdit,
  useRetryEdit,
  useCancelEdit,
  useUpdateEdit,
  type EditItem,
  type JobUpdate,
} from "@/hooks/use-clipper-api";
import { VideoPlayer } from "@/components/video-editor/VideoPlayer";
import {
  StatusBadge,
  OperationChips,
  FiltersBar,
  BulkActionsBar,
  ExpandPanel,
  TableSkeleton,
} from "@/components/edits";
import type { StatusFilter, TimeFilter } from "@/components/edits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Eye,
  RotateCcw,
  XCircle,
  Code,
  Save,
  ChevronDown,
  ChevronRight,
  Copy,
} from "lucide-react";
import { CLIPPER_API_BASE } from "@/lib/clipper-api";
import { formatRelative, formatExact } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { OperationSummary } from "@/components/video-editor";
import type { EditUpdateBody } from "@/lib/clipper-api";

const PAGE_SIZE = 20;

function filterEdits(
  edits: EditItem[],
  search: string,
  statusFilter: StatusFilter,
  timeFilter: TimeFilter
): EditItem[] {
  let out = edits;

  if (statusFilter !== "all") {
    out = out.filter((e) => e.status === statusFilter);
  }

  if (timeFilter !== "all") {
    const now = Date.now();
    const ms: Record<TimeFilter, number> = {
      all: 0,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };
    const cutoff = now - ms[timeFilter];
    out = out.filter((e) => new Date(e.created_at ?? 0).getTime() >= cutoff);
  }

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    out = out.filter((e) => {
      const id = String(e.id ?? "").toLowerCase();
      const uid = (e.uid ?? "").toLowerCase();
      const input = (e.input ?? "").toLowerCase();
      const error = (e.error ?? "").toLowerCase();
      const ops = (Array.isArray(e.action) ? e.action : [])
        .map((a: { op?: string }) => (a.op ?? "").toLowerCase())
        .join(" ");
      return (
        id.includes(q) ||
        uid.includes(q) ||
        input.includes(q) ||
        error.includes(q) ||
        ops.includes(q)
      );
    });
  }

  return out;
}

function getOutputFromEdit(edit: EditItem): { url?: string; filename?: string } | undefined {
  const output = edit?.output;
  if (!output || typeof output !== "object" || Array.isArray(output)) return undefined;
  const out = output as { filename?: string; url?: string };
  return { filename: out.filename, url: out.url };
}

export function EditsPage() {
  const { list, loading, error, data } = useListEdits();
  const { get, loading: loadingDetail, data: detail } = useGetEdit();
  const { retry, loading: retrying } = useRetryEdit();
  const { cancel, loading: cancelling } = useCancelEdit();
  const { update: updateEdit, loading: updatingEdit } = useUpdateEdit();

  const [detailId, setDetailId] = useState<number | null>(null);
  const [editsMap, setEditsMap] = useState<Map<number, EditItem>>(new Map());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [lastId, setLastId] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const sourcesRef = useRef<Map<string, EventSource>>(new Map());

  useEffect(() => {
    list({ limit: PAGE_SIZE, last_id: 0 });
  }, [list]);

  useEffect(() => {
    if (data?.edits) {
      setEditsMap((prev) => {
        const next = new Map(prev);
        data.edits.forEach((edit) => next.set(edit.id, edit));
        return next;
      });
      const ids = data.edits.map((e) => e.id).filter((id): id is number => id != null);
      if (ids.length > 0) {
        const maxId = Math.max(...ids);
        setLastId(maxId);
      }
      setHasMore((data.edits?.length ?? 0) >= PAGE_SIZE);
    }
  }, [data]);

  useEffect(() => {
    const sources = sourcesRef.current;
    const uids = new Set<string>();
    editsMap.forEach((edit) => {
      if (edit.uid && (edit.status === "queued" || edit.status === "processing")) {
        uids.add(edit.uid);
      }
    });
    sources.forEach((source, uid) => {
      if (!uids.has(uid)) {
        source.close();
        sources.delete(uid);
      }
    });
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
          } catch {}
        });
        source.onerror = () => {
          source.close();
          sources.delete(uid);
        };
      }
    });
    return () => {
      sources.forEach((s) => s.close());
      sources.clear();
    };
  }, [editsMap]);

  useEffect(() => {
    if (detailId != null) get(detailId);
  }, [detailId, get]);

  const allEdits = useMemo(
    () => Array.from(editsMap.values()).sort((a, b) => (b.id ?? 0) - (a.id ?? 0)),
    [editsMap]
  );
  const filteredEdits = useMemo(
    () => filterEdits(allEdits, search, statusFilter, timeFilter),
    [allEdits, search, statusFilter, timeFilter]
  );
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredEdits.length / PAGE_SIZE)),
    [filteredEdits.length]
  );
  const pagedEdits = useMemo(() => {
    const start = pageIndex * PAGE_SIZE;
    return filteredEdits.slice(start, start + PAGE_SIZE);
  }, [filteredEdits, pageIndex]);
  const pageIds = useMemo(
    () => pagedEdits.map((e) => e.id!).filter(Boolean),
    [pagedEdits]
  );
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  useEffect(() => {
    setPageIndex(0);
  }, [search, statusFilter, timeFilter]);

  useEffect(() => {
    if (pageIndex > totalPages - 1) {
      setPageIndex(totalPages - 1);
    }
  }, [pageIndex, totalPages]);

  const loadMore = useCallback(() => {
    list({ limit: PAGE_SIZE, last_id: lastId }).then((res) => {
      if ((res?.edits?.length ?? 0) < PAGE_SIZE) setHasMore(false);
    });
  }, [list, lastId]);

  const handleView = (id: number) => setDetailId(id);
  const handleCloseDetail = () => setDetailId(null);
  const toggleExpand = (id: number) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleRetry = useCallback(
    async (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      try {
        await retry(id);
        list({ limit: PAGE_SIZE * 2, last_id: 0 });
        if (detailId === id) get(id);
      } catch {}
    },
    [retry, list, detailId, get]
  );
  const handleCancel = useCallback(
    async (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      try {
        await cancel(id);
        list({ limit: PAGE_SIZE * 2, last_id: 0 });
        if (detailId === id) get(id);
      } catch {}
    },
    [cancel, list, detailId, get]
  );

  const bulkRetry = useCallback(async () => {
    for (const id of selectedIds) {
      try {
        await retry(id);
      } catch {}
    }
    list({ limit: PAGE_SIZE * 2, last_id: 0 });
    setSelectedIds(new Set());
  }, [selectedIds, retry, list]);
  const bulkCancel = useCallback(async () => {
    for (const id of selectedIds) {
      try {
        await cancel(id);
      } catch {}
    }
    list({ limit: PAGE_SIZE * 2, last_id: 0 });
    setSelectedIds(new Set());
  }, [selectedIds, cancel, list]);

  const hasActiveFilters = search !== "" || statusFilter !== "all" || timeFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setTimeFilter("all");
  };
  const selectedEdits = useMemo(
    () => filteredEdits.filter((e) => selectedIds.has(e.id!)),
    [filteredEdits, selectedIds]
  );
  const canBulkCancel = selectedEdits.some(
    (e) => e.status === "queued" || e.status === "processing"
  );

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edits</h1>
        </div>
        <Button asChild>
          <Link to="/edit">
            <span className="mr-2">+</span> New Edit
          </Link>
        </Button>
      </header>

      {error && (
        <p className="text-sm text-destructive mb-4">{error.message}</p>
      )}

      <Card>
        <FiltersBar
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          timeFilter={timeFilter}
          onTimeFilterChange={setTimeFilter}
          onClearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
        />
        <CardContent className="p-0">
          {selectedIds.size > 0 && (
            <div className="px-4 py-2 border-b border-border">
              <BulkActionsBar
                selectedCount={selectedIds.size}
                onRetry={bulkRetry}
                onCancel={bulkCancel}
                onDelete={() => setSelectedIds(new Set())}
                retrying={retrying}
                cancelling={cancelling}
                canCancel={canBulkCancel}
              />
            </div>
          )}

          {loading && editsMap.size === 0 ? (
            <TableSkeleton rows={10} columns={6} />
          ) : filteredEdits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <p className="text-muted-foreground text-sm">
                {allEdits.length === 0
                  ? "No edits yet"
                  : "No edits match your filters"}
              </p>
              {allEdits.length === 0 && (
                <Button asChild className="mt-4">
                  <Link to="/edit">Create first edit</Link>
                </Button>
              )}
              {allEdits.length > 0 && hasActiveFilters && (
                <Button variant="outline" className="mt-4" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse table-fixed text-left [&_th]:text-left [&_td]:text-left">
                <colgroup>
                  <col style={{ width: "2.5rem" }} />
                  <col style={{ width: "5rem" }} />
                  <col style={{ width: "6rem" }} />
                  <col style={{ width: "18rem" }} />
                  <col style={{ width: "6rem" }} />
                  <col style={{ width: "8rem" }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-muted-foreground bg-muted/30">
                    <th className="p-0 font-medium">
                      <div className="py-2 pl-3 pr-2 text-left">
                        <input
                          type="checkbox"
                          checked={allPageSelected}
                          onChange={toggleSelectAll}
                          className="rounded border-input"
                          aria-label="Select all"
                        />
                      </div>
                    </th>
                    <th className="p-0 font-medium">
                      <div className="py-2 pl-3 pr-2 text-left">ID</div>
                    </th>
                    <th className="p-0 font-medium">
                      <div className="py-2 pl-3 pr-2 text-left">Status</div>
                    </th>
                    <th className="p-0 font-medium">
                      <div className="py-2 pl-3 pr-2 text-left">Operations</div>
                    </th>
                    <th className="p-0 font-medium">
                      <div className="py-2 pl-3 pr-2 text-left">Created</div>
                    </th>
                    <th className="p-0 font-medium">
                      <div className="py-2 pl-3 pr-3 text-left">Actions</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedEdits.map((edit) => {
                    const isExpanded = expandedId === edit.id;
                    const output = getOutputFromEdit(edit);
                    return (
                      <Fragment key={edit.id}>
                        <tr
                          key={edit.id}
                          className={cn(
                            "border-b border-border hover:bg-muted/20 cursor-pointer transition-colors",
                            isExpanded && "bg-muted/20"
                          )}
                          onClick={() => toggleExpand(edit.id!)}
                        >
                          <td className="p-0 align-middle" onClick={(e) => e.stopPropagation()}>
                            <div className="py-1.5 pl-3 pr-2 text-left">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(edit.id!)}
                                onChange={() => toggleSelect(edit.id!)}
                                className="rounded border-input"
                                aria-label={`Select edit ${edit.id}`}
                              />
                            </div>
                          </td>
                          <td className="p-0 align-middle">
                            <div className="py-1.5 pl-3 pr-2 text-left">
                              <span
                                className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-2 py-0.5 font-mono text-xs"
                                title={String(edit.id)}
                              >
                                {edit.id}
                                <Copy
                                  className="size-3 opacity-60 hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(String(edit.id));
                                  }}
                                />
                              </span>
                            </div>
                          </td>
                          <td className="p-0 align-middle">
                            <div className="py-1.5 pl-3 pr-2 text-left">
                              <StatusBadge status={edit.status} />
                            </div>
                          </td>
                          <td className="p-0 align-middle min-w-0">
                            <div className="py-1.5 pl-3 pr-2 text-left">
                              <OperationChips
                                action={Array.isArray(edit.action) ? edit.action : []}
                                maxVisible={4}
                              />
                            </div>
                          </td>
                          <td className="p-0 align-middle text-muted-foreground text-xs whitespace-nowrap" title={formatExact(edit.created_at)}>
                            <div className="py-1.5 pl-3 pr-2 text-left">
                              {formatRelative(edit.created_at)}
                            </div>
                          </td>
                          <td className="p-0 align-middle" onClick={(e) => e.stopPropagation()}>
                            <div className="py-1.5 pl-3 pr-3 text-left">
                            <div className="flex flex-row items-center justify-start gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => toggleExpand(edit.id!)}
                                aria-label={isExpanded ? "Collapse" : "Expand"}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleView(edit.id!)}
                                aria-label="View details"
                                title="View details"
                              >
                                <Eye className="size-4" />
                              </Button>
                              {(edit.status === "error" ||
                                edit.status === "cancelled" ||
                                edit.status === "completed") && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => handleRetry(e, edit.id!)}
                                  disabled={retrying}
                                  aria-label="Retry"
                                  title="Retry job"
                                >
                                  <RotateCcw className="size-4" />
                                </Button>
                              )}
                              {(edit.status === "queued" || edit.status === "processing") && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => handleCancel(e, edit.id!)}
                                  disabled={cancelling}
                                  aria-label="Cancel"
                                  title="Cancel job"
                                >
                                  <XCircle className="size-4" />
                                </Button>
                              )}
                            </div>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${edit.id}-expand`}>
                            <td colSpan={6} className="p-0 align-top">
                              <ExpandPanel
                                edit={edit}
                                outputUrl={output?.url}
                                outputFilename={output?.filename}
                                onRetry={(id) => retry(id).then(() => list({ limit: PAGE_SIZE * 2, last_id: 0 }))}
                                onCancel={(id) => cancel(id).then(() => list({ limit: PAGE_SIZE * 2, last_id: 0 }))}
                                onViewDetails={handleView}
                                retrying={retrying}
                                cancelling={cancelling}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filteredEdits.length > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between py-4 border-t border-border px-4">
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                {Math.min(filteredEdits.length, pageIndex * PAGE_SIZE + 1)}-
                {Math.min(filteredEdits.length, (pageIndex + 1) * PAGE_SIZE)} of{" "}
                {filteredEdits.length}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
                  disabled={pageIndex === 0}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {pageIndex + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))
                  }
                  disabled={pageIndex >= totalPages - 1}
                >
                  Next
                </Button>
                {hasMore && (
                  <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
                    {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                    Load more
                  </Button>
                )}
              </div>
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
          await updateEdit(id, body as EditUpdateBody);
          list({ limit: PAGE_SIZE * 2, last_id: 0 });
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

  const output = useMemo(() => {
    if (!edit?.output) return undefined;
    if (typeof edit.output === "object" && edit.output !== null && !Array.isArray(edit.output)) {
      const out = edit.output as { filename?: string; url?: string };
      return { filename: out.filename, url: out.url };
    }
    return undefined;
  }, [edit?.output]);

  useEffect(() => {
    if (!open) {
      setShowJson(false);
      return;
    }
    if (edit) {
      setShowJson(true);
      try {
        setJsonText(JSON.stringify(edit, null, 2));
        setJsonError(null);
      } catch {
        setJsonError("Failed to serialize");
      }
    }
  }, [open, edit]);

  const handleSaveJson = async () => {
    if (!edit || !onUpdate) return;
    try {
      const parsed = JSON.parse(jsonText);
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
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : edit ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                variant={showJson ? "default" : "outline"}
                size="sm"
                onClick={() => setShowJson(!showJson)}
              >
                <Code className="size-4 mr-1" />
                {showJson ? "Form View" : "JSON View"}
              </Button>
            </div>
            {showJson ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs">JSON</Label>
                  {onUpdate && (
                    <Button size="sm" onClick={handleSaveJson} disabled={updating || !!jsonError}>
                      {updating ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Save className="size-4 mr-1" />}
                      Save
                    </Button>
                  )}
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
                  className="font-mono text-xs min-h-[300px]"
                />
                {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">ID</span>
                  <span className="font-mono">{edit.id}</span>
                  <span className="text-muted-foreground">UID</span>
                  <span className="font-mono text-xs break-all">{edit.uid}</span>
                  <span className="text-muted-foreground">Status</span>
                  <StatusBadge status={edit.status} />
                  <span className="text-muted-foreground">Created</span>
                  <span title={formatExact(edit.created_at)}>{formatExact(edit.created_at)}</span>
                </div>
                {edit.status === "error" && edit.error && (
                  <div>
                    <span className="text-muted-foreground text-xs">Error</span>
                    <div className="mt-1 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive whitespace-pre-wrap">
                      {edit.error}
                    </div>
                  </div>
                )}
                {edit.input && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Input</p>
                    <p className="truncate font-mono text-xs" title={edit.input}>{edit.input}</p>
                  </div>
                )}
                {output?.filename && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-2">Output</p>
                    {output.url ? (
                      <>
                        <VideoPlayer url={output.url} filename={output.filename} maxHeight="max-h-96" />
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
                  <p className="text-muted-foreground text-xs mb-2">Operations</p>
                  <OperationSummary action={Array.isArray(edit.action) ? edit.action : []} compact={false} />
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
