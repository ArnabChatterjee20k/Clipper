/**
 * Search + status filters + time filter + column visibility for edits table.
 */

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Search, Settings2, X } from "lucide-react";

export type StatusFilter = "all" | "queued" | "processing" | "completed" | "error" | "cancelled";
export type TimeFilter = "24h" | "7d" | "30d" | "all";

export interface FiltersBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (v: StatusFilter) => void;
  timeFilter: TimeFilter;
  onTimeFilterChange: (v: TimeFilter) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  onColumnVisibilityClick?: () => void;
  className?: string;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "processing", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "completed", label: "Completed" },
  { value: "error", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const TIME_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

export function FiltersBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  timeFilter,
  onTimeFilterChange,
  onClearFilters,
  hasActiveFilters,
  onColumnVisibilityClick,
  className,
}: FiltersBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 py-3 px-4 border-b border-border",
        className
      )}
    >
      <div className="relative flex-1 min-w-[180px] max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search by ID, filename, operation, error…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-9"
        />
      </div>
      <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}>
        <SelectTrigger className="w-[130px] h-9">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={timeFilter} onValueChange={(v) => onTimeFilterChange(v as TimeFilter)}>
        <SelectTrigger className="w-[120px] h-9">
          <SelectValue placeholder="Time" />
        </SelectTrigger>
        <SelectContent>
          {TIME_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onColumnVisibilityClick && (
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onColumnVisibilityClick}
          aria-label="Column visibility"
        >
          <Settings2 className="size-4" />
        </Button>
      )}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={onClearFilters}>
          <X className="size-3.5" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
