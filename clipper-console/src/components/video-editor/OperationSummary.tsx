/**
 * Read-only summary of an edit's action[] (operations). Used in edits list and edit detail.
 * Renders text segments (time range + text), speed segments (time range + speed), trim, and other op names.
 */

import { cn } from "@/lib/utils";

export interface ActionItem {
  op: string;
  data?: unknown;
}

export interface OperationSummaryProps {
  /** Backend action array: [{ op, data }, ...] */
  action: ActionItem[];
  /** Compact: single line when true; otherwise list per op */
  compact?: boolean;
  className?: string;
}

function fmtTime(sec: number | undefined): string {
  if (sec == null) return "?";
  if (sec === -1) return "end";
  return `${sec}s`;
}

export function OperationSummary({ action, compact = false, className }: OperationSummaryProps) {
  if (!action?.length) {
    return <span className={cn("text-muted-foreground text-xs", className)}>No operations</span>;
  }

  const parts: string[] = [];
  const blocks: React.ReactNode[] = [];

  for (let i = 0; i < action.length; i++) {
    const item = action[i];
    const op = item.op ?? "unknown";
    const data = item.data;

    if (op === "trim") {
      const d = data as { start_sec?: number; end_sec?: number; duration?: number } | undefined;
      const start = d?.start_sec ?? 0;
      const end = d?.end_sec ?? -1;
      const str = `Trim: ${fmtTime(start)}–${fmtTime(end)}`;
      parts.push(str);
      if (!compact) blocks.push(<div key={i} className="text-xs">{str}</div>);
    } else if (op === "karaoke") {
      const d = data as { sentence?: string; start_sec?: number; end_sec?: number } | undefined;
      const start = d?.start_sec ?? 0;
      const end = d?.end_sec ?? -1;
      const text = d?.sentence ? `"${d.sentence}"` : "";
      const str = `Karaoke: ${fmtTime(start)}–${fmtTime(end)} ${text}`;
      parts.push(str.trim());
      if (!compact) blocks.push(<div key={i} className="text-xs">{str.trim()}</div>);
    } else if (op === "textSequence") {
      const items = (data as { items?: Array<{ text?: string; start_sec?: number; end_sec?: number }> })?.items ?? [];
      const itemStrs = items.map((s) => {
        const t = typeof s?.text === "string" ? `"${s.text}"` : "";
        return `${fmtTime(s?.start_sec)}–${fmtTime(s?.end_sec)}: ${t}`;
      });
      const str = itemStrs.length ? `Text sequence: ${itemStrs.join("; ")}` : "Text sequence";
      parts.push(str);
      if (!compact && itemStrs.length) {
        blocks.push(
          <div key={i} className="text-xs space-y-0.5">
            <span className="font-medium text-muted-foreground">Text sequence:</span>
            {itemStrs.map((s, j) => (
              <div key={j} className="pl-2 text-muted-foreground">{s}</div>
            ))}
          </div>
        );
      } else if (!compact) blocks.push(<div key={i} className="text-xs">Text sequence</div>);
    } else if (op === "text") {
      const segs = Array.isArray(data) ? data : [];
      const segStrs = segs.map((s: { start_sec?: number; end_sec?: number; text?: string }) => {
        const t = typeof s?.text === "string" ? `"${s.text}"` : "";
        return `${fmtTime(s?.start_sec)}–${fmtTime(s?.end_sec)}: ${t}`;
      });
      const str = segStrs.length ? `Text: ${segStrs.join("; ")}` : "Text";
      parts.push(str);
      if (!compact && segStrs.length) {
        blocks.push(
          <div key={i} className="text-xs space-y-0.5">
            <span className="font-medium text-muted-foreground">Text:</span>
            {segStrs.map((s, j) => (
              <div key={j} className="pl-2 text-muted-foreground">{s}</div>
            ))}
          </div>
        );
      } else if (!compact) blocks.push(<div key={i} className="text-xs">Text</div>);
    } else if (op === "speed") {
      const segs = Array.isArray(data) ? data : [];
      const segStrs = segs.map((s: { start_sec?: number; end_sec?: number; speed?: number }) => {
        const sp = s?.speed ?? 1;
        return `${fmtTime(s?.start_sec)}–${fmtTime(s?.end_sec)} @ ${sp}x`;
      });
      const str = segStrs.length ? `Speed: ${segStrs.join("; ")}` : "Speed";
      parts.push(str);
      if (!compact && segStrs.length) {
        blocks.push(
          <div key={i} className="text-xs space-y-0.5">
            <span className="font-medium text-muted-foreground">Speed:</span>
            {segStrs.map((s, j) => (
              <div key={j} className="pl-2 text-muted-foreground">{s}</div>
            ))}
          </div>
        );
      } else if (!compact) blocks.push(<div key={i} className="text-xs">Speed</div>);
    } else {
      const label = op.charAt(0).toUpperCase() + op.slice(1);
      parts.push(label);
      if (!compact) blocks.push(<div key={i} className="text-xs">{label}</div>);
    }
  }

  if (compact) {
    return (
      <span className={cn("text-muted-foreground text-xs truncate max-w-full block", className)} title={parts.join(" → ")}>
        {parts.join(" → ")}
      </span>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      {blocks}
    </div>
  );
}
