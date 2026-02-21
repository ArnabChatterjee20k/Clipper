/**
 * Centralized status configuration for edit/workflow jobs.
 * Used by StatusBadge and any list that shows status.
 */

import type { LucideIcon } from "lucide-react";
import { CheckCircle, Loader2, Clock, XCircle, Ban } from "lucide-react";

export type JobStatusValue = "completed" | "processing" | "queued" | "error" | "cancelled";

export interface StatusConfig {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: LucideIcon;
  className: string;
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  completed: {
    label: "Completed",
    variant: "outline",
    icon: CheckCircle,
    className: "text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  },
  processing: {
    label: "Running",
    variant: "default",
    icon: Loader2,
    className: "text-blue-600 dark:text-blue-400",
  },
  queued: {
    label: "Queued",
    variant: "secondary",
    icon: Clock,
    className: "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  },
  error: {
    label: "Failed",
    variant: "destructive",
    icon: XCircle,
    className: "text-white dark:text-white",
  },
  cancelled: {
    label: "Cancelled",
    variant: "secondary",
    icon: Ban,
    className: "text-muted-foreground",
  },
};

export function getStatusConfig(status: string | undefined): StatusConfig {
  const key = (status ?? "").toLowerCase();
  return (
    STATUS_CONFIG[key] ?? {
      label: status ?? "—",
      variant: "secondary",
      icon: Clock,
      className: "text-muted-foreground",
    }
  );
}
