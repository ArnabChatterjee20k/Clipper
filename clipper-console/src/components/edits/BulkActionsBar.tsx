/**
 * Bulk actions toolbar: "X selected | Retry | Cancel | Delete"
 */

import { Button } from "@/components/ui/button";
import { RotateCcw, XCircle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BulkActionsBarProps {
  selectedCount: number;
  onRetry: () => void;
  onCancel: () => void;
  onDelete: () => void;
  retrying?: boolean;
  cancelling?: boolean;
  deleting?: boolean;
  /** Disable cancel when none of the selected are cancelable */
  canCancel?: boolean;
  className?: string;
}

export function BulkActionsBar({
  selectedCount,
  onRetry,
  onCancel,
  onDelete,
  retrying,
  cancelling,
  deleting,
  canCancel = true,
  className,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md border bg-muted/40 text-sm",
        className
      )}
    >
      <span className="font-medium text-muted-foreground">
        {selectedCount} selected
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
          {retrying ? null : <RotateCcw className="size-3.5 mr-1" />}
          Retry
        </Button>
        {canCancel && (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={cancelling}>
            <XCircle className="size-3.5 mr-1" />
            Cancel
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onDelete} disabled={deleting} className="text-destructive hover:text-destructive">
          <Trash2 className="size-3.5 mr-1" />
          Delete
        </Button>
      </div>
    </div>
  );
}
