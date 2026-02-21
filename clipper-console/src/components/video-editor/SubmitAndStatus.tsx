/**
 * Submit edit button and job status (SSE). Shows output link when completed.
 * Backend uses status "error" and "cancelled" (not "failed").
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEditVideo, useJobStatus } from "@/hooks/use-clipper-api";
import type { VideoEditRequest } from "@/types/edit-session";
import { Loader2, CheckCircle, XCircle, FolderOpen, Code } from "lucide-react";
import { VideoPlayer } from "./VideoPlayer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

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
  const [showJson, setShowJson] = useState(false);
  const [showPasteJson, setShowPasteJson] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonInputError, setJsonInputError] = useState<string | null>(null);

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

  const handleOpenPasteJson = () => {
    setShowPasteJson(true);
    setJsonInputError(null);
    setJsonInput(
      JSON.stringify(
        toRequest ?? { media: "", operations: [] },
        null,
        2,
      ),
    );
  };

  const handleSubmitJson = () => {
    try {
      const parsed = JSON.parse(jsonInput) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setJsonInputError("JSON must be an object");
        return;
      }

      const { media, operations } = parsed as { media?: unknown; operations?: unknown };
      if (typeof media !== "string" || !media.trim()) {
        setJsonInputError("media must be a non-empty string");
        return;
      }
      if (!Array.isArray(operations)) {
        setJsonInputError("operations must be an array");
        return;
      }
      const invalidOp = operations.some(
        (op) =>
          !op ||
          typeof op !== "object" ||
          Array.isArray(op) ||
          !("op" in op) ||
          typeof (op as { op?: unknown }).op !== "string",
      );
      if (invalidOp) {
        setJsonInputError("each operation must be an object with string op");
        return;
      }

      setJsonInputError(null);
      edit({
        ...(parsed as VideoEditRequest),
        media: media.trim(),
        operations: operations as VideoEditRequest["operations"],
      });
      setShowPasteJson(false);
    } catch (e) {
      setJsonInputError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  const outputFilename =
    job?.output && typeof job.output === "object" && "filename" in job.output
      ? String((job.output as { filename?: string }).filename)
      : null;

  const outputUrl =
    job?.output && typeof job.output === "object" && "url" in job.output
      ? String((job.output as { url?: string }).url)
      : null;

  const jsonString = toRequest ? JSON.stringify(toRequest, null, 2) : "";

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Run edit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center flex-wrap gap-2">
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

          <Button
            variant="outline"
            onClick={() => setShowJson(true)}
            disabled={!toRequest}
          >
            <Code className="size-4 mr-2" />
            Get JSON
          </Button>

          <Button
            variant="outline"
            onClick={handleOpenPasteJson}
            disabled={submitting}
          >
            <Code className="size-4 mr-2" />
            Paste JSON
          </Button>
        </div>

        <Dialog open={showJson} onOpenChange={setShowJson}>
          <DialogContent title="Request JSON" className="max-w-2xl">
            <div className="p-4">
              <Textarea
                readOnly
                value={jsonString}
                className="font-mono text-xs min-h-[300px] bg-muted/20"
              />
              <div className="flex justify-end mt-4">
                <Button onClick={() => {
                  navigator.clipboard.writeText(jsonString);
                }}>
                  Copy to clipboard
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showPasteJson} onOpenChange={setShowPasteJson}>
          <DialogContent title="Submit Request JSON" className="max-w-2xl">
            <div className="p-4 space-y-3">
              <Textarea
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value);
                  setJsonInputError(null);
                }}
                className="font-mono text-xs min-h-[300px]"
                placeholder='{"media":"https://...","operations":[{"op":"trim","start_sec":0,"end_sec":5}]}'
              />
              {jsonInputError && (
                <p className="text-xs text-destructive">{jsonInputError}</p>
              )}
              <div className="flex justify-end">
                <Button onClick={handleSubmitJson} disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    "Submit JSON"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
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
                  <div className="pt-2 border-t space-y-2">
                    {outputUrl ? (
                      <VideoPlayer url={outputUrl} filename={outputFilename} />
                    ) : (
                      <p className="text-xs text-muted-foreground break-all">
                        Output: {outputFilename}
                      </p>
                    )}
                    <Button variant="outline" size="sm" className="mt-1" asChild>
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
