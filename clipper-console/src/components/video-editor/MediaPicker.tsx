/**
 * Media picker: upload a file or choose from bucket (opens bucket in modal).
 * Passes presigned URL + display name to parent so backend receives URL.
 */

import { useRef, useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUploadFile } from "@/hooks/use-clipper-api";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BucketBrowser } from "@/components/bucket/BucketBrowser";
import { cn } from "@/lib/utils";
import { Upload, FolderOpen, Loader2, Youtube } from "lucide-react";

export interface MediaPickerProps {
  /** Presigned URL of selected media (for API). */
  media: string;
  /** Display name (e.g. filename) for UI. */
  mediaDisplayName?: string;
  /** Called with (presignedUrl, displayName) when user selects a file. */
  onSelect: (url: string, displayName?: string) => void;
  className?: string;
}

function isValidYouTubeUrl(url: string): boolean {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
  return youtubeRegex.test(url);
}

export function MediaPicker({
  media,
  mediaDisplayName,
  onSelect,
  className,
}: MediaPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bucketModalOpen, setBucketModalOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
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

  const handleYouTubeUrlSubmit = () => {
    const trimmedUrl = youtubeUrl.trim();
    if (trimmedUrl && isValidYouTubeUrl(trimmedUrl)) {
      onSelect(trimmedUrl, `YouTube: ${trimmedUrl}`);
      setYoutubeUrl("");
    }
  };

  const handleYouTubeUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleYouTubeUrlSubmit();
    }
  };

  const isYouTubeUrl = media && isValidYouTubeUrl(media);

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
                {isYouTubeUrl ? (
                  <>
                    <Youtube className="size-3 inline mr-1" />
                    {mediaDisplayName || media}
                  </>
                ) : (
                  mediaDisplayName || media.split("/").pop() || "—"
                )}
              </p>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">YouTube URL (optional)</Label>
              <div className="flex gap-2">
                <Input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  onKeyDown={handleYouTubeUrlKeyDown}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="h-8 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleYouTubeUrlSubmit}
                  disabled={!youtubeUrl.trim() || !isValidYouTubeUrl(youtubeUrl.trim())}
                >
                  <Youtube className="size-4" />
                  Use URL
                </Button>
              </div>
              {youtubeUrl && !isValidYouTubeUrl(youtubeUrl.trim()) && (
                <p className="text-xs text-destructive">Please enter a valid YouTube URL</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">OR</span>
              <div className="flex-1 h-px bg-border" />
            </div>

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
