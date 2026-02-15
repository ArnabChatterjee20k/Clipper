/**
 * Submit edit button and job status (SSE). Shows output link when completed.
 * Backend uses status "error" and "cancelled" (not "failed").
 */

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEditVideo, useJobStatus } from "@/hooks/use-clipper-api";
import type { VideoEditRequest } from "@/types/edit-session";
import { Loader2, CheckCircle, XCircle, FolderOpen } from "lucide-react";

export interface SubmitAndStatusProps {
  toRequest: VideoEditRequest | null;
  canSubmit: boolean;
  onSubmitted?: (editId: string) => void;
  className?: string;
}

export function SubmitAndStatus({
  toRequest,
  canSubmit,
  onSubmitted,
  className,
}: SubmitAndStatusProps) {
  const { edit, loading: submitting, error: submitError, data: editData } = useEditVideo();
  const { start, stop, job, loading: streaming } = useJobStatus();

  useEffect(() => {
    if (editData?.id) {
      onSubmitted?.(editData.id);
      start(editData.id);
    }
  }, [editData?.id, start, onSubmitted]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  const handleSubmit = () => {
    if (!toRequest) return;
    edit(toRequest);
  };

  const outputFilename = job?.output && typeof job.output === "object" && "filename" in job.output
    ? String((job.output as { filename?: string }).filename)
    : null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Run edit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Submitting…
            </>
          ) : (
            "Submit edit"
          )}
        </Button>
        {submitError && (
          <p className="text-sm text-destructive">{submitError.message}</p>
        )}

        {editData?.id && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Job ID: {editData.id}</p>
            {streaming && !job && (
              <p className="text-xs text-muted-foreground">Connecting…</p>
            )}
            {job && (
              <>
                <JobStatusBadge status={job.status} />
                {job.status === "completed" && outputFilename && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">Output: {outputFilename}</p>
                    <Button variant="outline" size="sm" className="mt-2" asChild>
                      <Link to="/buckets">
                        <FolderOpen className="size-4" />
                        View in Buckets
                      </Link>
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JobStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const variant =
    status === "completed"
      ? "default"
      : status === "error" || status === "cancelled"
        ? "destructive"
        : "secondary";
  const icon =
    status === "completed" ? (
      <CheckCircle className="size-3" />
    ) : status === "error" || status === "cancelled" ? (
      <XCircle className="size-3" />
    ) : null;
  return (
    <Badge variant={variant} className="gap-1">
      {icon}
      {status}
    </Badge>
  );
}
