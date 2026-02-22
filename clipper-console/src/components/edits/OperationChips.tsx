/**
 * Operations as chips: [Download] → [Trim 10–60s] → [Compress]
 * Structured, not plain text.
 */

import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

export interface ActionItem {
  op: string;
  data?: unknown;
}

export interface OperationChipsProps {
  action: ActionItem[];
  className?: string;
  maxVisible?: number;
}

function fmtTime(sec: number | undefined): string {
  if (sec == null) return "?";
  if (sec === -1) return "end";
  return `${sec}s`;
}

function opToLabel(item: ActionItem): string {
  const op = item.op ?? "unknown";
  const data = item.data as Record<string, unknown> | undefined;

  if (op === "trim" && data) {
    const start = (data.start_sec as number) ?? 0;
    const end = (data.end_sec as number) ?? -1;
    return `Trim ${fmtTime(start)}–${fmtTime(end)}`;
  }
  if (op === "text") return "Text";
  if (op === "speed") {
    const segs = Array.isArray(data) ? data : [];
    const first = segs[0] as { speed?: number } | undefined;
    const speed = first?.speed ?? 1;
    return speed !== 1 ? `Speed ${speed}x` : "Speed";
  }
  if (op === "download_from_youtube") return "Download";
  if (op === "watermark") return "Watermark";
  if (op === "audio") return "Audio";
  if (op === "backgroundColor") return "Background";
  if (op === "transcode") return "Transcode";
  if (op === "compress") return "Compress";
  if (op === "concat") return "Concat";
  if (op === "extractAudio") return "Extract audio";
  if (op === "gif") return "GIF";
  if (op === "convertToPlatform") return "Convert to platform";
  return op.charAt(0).toUpperCase() + op.slice(1).replace(/_/g, " ");
}

export function OperationChips({
  action,
  className,
  maxVisible = 8,
}: OperationChipsProps) {
  if (!action?.length) {
    return (
      <span className={cn("text-muted-foreground text-xs", className)}>
        No operations
      </span>
    );
  }

  const items = action.slice(0, maxVisible);
  const overflow = action.length > maxVisible ? action.length - maxVisible : 0;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-0.5 text-xs", className)}
      title={action.map(opToLabel).join(" → ")}
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-0.5">
          <span className="inline-flex items-center rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-medium text-muted-foreground">
            {opToLabel(item)}
          </span>
          {i < items.length - 1 && (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
          )}
        </span>
      ))}
      {overflow > 0 && (
        <>
          <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
          <span className="text-muted-foreground">+{overflow}</span>
        </>
      )}
    </div>
  );
}
