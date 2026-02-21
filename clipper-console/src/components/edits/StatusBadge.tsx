/**
 * Status badge with icon. Uses centralized status config.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getStatusConfig } from "./status-config";

export interface StatusBadgeProps {
  status: string | undefined;
  className?: string;
  showIcon?: boolean;
}

export function StatusBadge({ status, className, showIcon = true }: StatusBadgeProps) {
  const config = getStatusConfig(status);
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={cn(
        "gap-1 font-medium",
        config.className,
        status === "processing" && "animate-pulse",
        className
      )}
    >
      {showIcon &&
        (status === "processing" ? (
          <Icon className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <Icon className="size-3.5 shrink-0" />
        ))}
      {config.label}
    </Badge>
  );
}
