/**
 * Media picker: upload a file or choose from bucket (opens bucket in modal).
 * Passes presigned URL + display name to parent so backend receives URL.
 */

import { useRef, useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUploadFile } from "@/hooks/use-clipper-api";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BucketBrowser } from "@/components/bucket/BucketBrowser";
import { cn } from "@/lib/utils";
import { Upload, FolderOpen, Loader2 } from "lucide-react";

export interface MediaPickerProps {
  /** Presigned URL of selected media (for API). */
  media: string;
  /** Display name (e.g. filename) for UI. */
  mediaDisplayName?: string;
  /** Called with (presignedUrl, displayName) when user selects a file. */
  onSelect: (url: string, displayName?: string) => void;
  className?: string;
}

export function MediaPicker({
  media,
  mediaDisplayName,
  onSelect,
  className,
}: MediaPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bucketModalOpen, setBucketModalOpen] = useState(false);
  const { upload, loading: uploading, error: uploadError, data: uploadData } = useUploadFile();

  const lastUploadUrl = useRef<string | null>(null);
  useEffect(() => {
    if (uploadData?.url && uploadData.url !== lastUploadUrl.current) {
      lastUploadUrl.current = uploadData.url;
      onSelect(uploadData.url, uploadData.filename);
    }
  }, [uploadData?.url, uploadData?.filename, onSelect]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  };

  const handleBucketSelect = (url: string, filename: string) => {
    onSelect(url, filename);
    setBucketModalOpen(false);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Source video</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {media ? (
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">Selected</p>
              <p className="text-sm font-medium truncate" title={mediaDisplayName || media}>
                {mediaDisplayName || media.split("/").pop() || "—"}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 mx-0 items-center justify-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {uploading ? "Uploading…" : "Upload file"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBucketModalOpen(true)}
            >
              <FolderOpen className="size-4" />
              Pick from bucket
            </Button>
          </div>
          {uploadError ? (
            <p className="text-xs text-destructive">{uploadError.message}</p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={bucketModalOpen} onOpenChange={setBucketModalOpen}>
        <DialogContent
          className="w-[60vw]"
          title="Pick from bucket"
          description="Select a file to use as source. The presigned URL will be sent to the worker."
          showClose
        >
          <BucketBrowser onSelect={handleBucketSelect} compact />
        </DialogContent>
      </Dialog>
    </>
  );
}
