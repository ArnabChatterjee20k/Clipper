/**
 * Expanded row content: input, output, pipeline, error, timestamps, actions.
 * Shown inline below the row when expanded.
 */

import { OperationSummary } from "@/components/video-editor";
import { VideoPlayer } from "@/components/video-editor/VideoPlayer";
import { Button } from "@/components/ui/button";
import { RotateCcw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatExact } from "@/lib/relative-time";
import type { EditItem } from "@/hooks/use-clipper-api";

export interface ExpandPanelProps {
  edit: EditItem;
  outputUrl?: string;
  outputFilename?: string;
  onRetry: (id: number) => void;
  onCancel: (id: number) => void;
  onViewDetails?: (id: number) => void;
  retrying?: boolean;
  cancelling?: boolean;
  className?: string;
}

export function ExpandPanel({
  edit,
  outputUrl,
  outputFilename,
  onRetry,
  onCancel,
  onViewDetails,
  retrying,
  cancelling,
  className,
}: ExpandPanelProps) {
  const actions = Array.isArray(edit.action) ? edit.action : [];
  const canRetry =
    edit.status === "error" ||
    edit.status === "cancelled" ||
    edit.status === "completed";
  const canCancel = edit.status === "queued" || edit.status === "processing";

  const isCompleted = edit.status === "completed";
  const isError = edit.status === "error";

  return (
    <div
      className={cn(
        "border-t border-border bg-muted/20 px-4 py-4 text-sm",
        className
      )}
    >
      {isCompleted ? (
        <>
          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground tracking-wide">
              INPUT
            </p>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">Source</p>
              <p className="font-mono text-[11px] break-all">
                {edit.input ?? "—"}
              </p>
            </div>

            <p className="mt-4 text-[11px] font-semibold text-muted-foreground tracking-wide">
              OPERATIONS
            </p>
            <div className="rounded-md border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
              <OperationSummary action={actions} compact />
            </div>

            <p className="mt-4 text-[11px] font-semibold text-muted-foreground tracking-wide">
              OUTPUT
            </p>
            <div className="rounded-md border border-border bg-background px-3 py-3 space-y-2">
              {outputUrl && outputFilename ? (
                <>
                  <VideoPlayer
                    url={outputUrl}
                    filename={outputFilename}
                    maxHeight="max-h-48"
                  />
                  <p className="font-mono text-[11px] break-all text-muted-foreground">
                    {outputFilename}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="xs"
                      variant="outline"
                      type="button"
                      onClick={() => navigator.clipboard.writeText(outputUrl)}
                    >
                      Copy link
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      type="button"
                      asChild
                    >
                      <a href={outputUrl} download={outputFilename}>
                        Download
                      </a>
                    </Button>
                  </div>
                </>
              ) : outputFilename ? (
                <p className="font-mono text-[11px] break-all text-muted-foreground">
                  {outputFilename}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">No output yet.</p>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border">
            <p className="mb-2 text-[11px] font-semibold text-muted-foreground tracking-wide">
              ACTIONS
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {onViewDetails && (
                <Button variant="outline" size="sm" onClick={() => onViewDetails(edit.id!)}>
                  JSON View
                </Button>
              )}
              {canRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRetry(edit.id!)}
                  disabled={retrying}
                >
                  <RotateCcw className="size-3.5 mr-1" />
                  Retry Job
                </Button>
              )}
            </div>
          </div>
        </>
      ) : isError ? (
        <>
          <div>
            <p className="text-[11px] font-semibold text-destructive mb-1">Error</p>
            <div className="rounded-md border border-destructive px-3 py-2 text-[11px] text-destructive whitespace-pre-wrap break-all bg-background">
              {edit.error ?? "Unknown error"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border">
            {onViewDetails && (
              <Button variant="outline" size="sm" onClick={() => onViewDetails(edit.id!)}>
                View full details
              </Button>
            )}
            {canRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRetry(edit.id!)}
                disabled={retrying}
              >
                <RotateCcw className="size-3.5 mr-1" />
                Retry
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Input</p>
                <p className="truncate font-mono text-xs" title={edit.input ?? ""}>
                  {edit.input ?? "—"}
                </p>
              </div>
              {outputFilename && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
                  {outputUrl ? (
                    <VideoPlayer
                      url={outputUrl}
                      filename={outputFilename}
                      maxHeight="max-h-48"
                      showUrl={true}
                    />
                  ) : (
                    <p className="font-mono text-xs break-all">{outputFilename}</p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Pipeline</p>
                <OperationSummary action={actions} compact={false} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Created</span>
                <span title={formatExact(edit.created_at)}>{formatExact(edit.created_at)}</span>
                <span>Updated</span>
                <span title={formatExact(edit.updated_at)}>{formatExact(edit.updated_at)}</span>
                {edit.uid && (
                  <>
                    <span>UID</span>
                    <span className="font-mono truncate" title={edit.uid}>{edit.uid}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border">
            {onViewDetails && (
              <Button variant="outline" size="sm" onClick={() => onViewDetails(edit.id!)}>
                View full details
              </Button>
            )}
            {canRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRetry(edit.id!)}
                disabled={retrying}
              >
                <RotateCcw className="size-3.5 mr-1" />
                Retry
              </Button>
            )}
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCancel(edit.id!)}
                disabled={cancelling}
              >
                <XCircle className="size-3.5 mr-1" />
                Cancel
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
