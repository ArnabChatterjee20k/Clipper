/**
 * Reusable bucket UI: upload, grid of files, view (open URL), delete.
 * Used on /buckets page and inside "Pick from bucket" modal in the editor.
 */

import { useEffect, useRef, useState } from "react";
import { useUploadFile, useListFiles, useDeleteFile } from "@/hooks/use-clipper-api";
import type { FileListItem } from "@/hooks/use-clipper-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileVideo,
  ExternalLink,
  Trash2,
  Loader2,
  Check,
} from "lucide-react";

export interface BucketBrowserProps {
  /** When set, show "Select" on each file (for modal picker). */
  onSelect?: (url: string, filename: string) => void;
  /** Compact layout (e.g. inside modal). */
  compact?: boolean;
  className?: string;
}

export function BucketBrowser({ onSelect, compact, className }: BucketBrowserProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, loading: uploading, error: uploadError, data: uploadData } = useUploadFile();
  const { list, loading: listing, error: listError, data: listData } = useListFiles();
  const { deleteFile } = useDeleteFile();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  useEffect(() => {
    list();
  }, [list]);

  useEffect(() => {
    if (uploadData) list();
  }, [uploadData, list]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteFile(id);
      setConfirmDelete(null);
      list();
    } finally {
      setDeletingId(null);
    }
  };

  const files = listData?.files ?? [];

  return (
    <div className={cn("space-y-4", className)}>
      <Card>
        <CardHeader className={compact ? "py-3" : undefined}>
          <CardTitle className="text-base">Upload</CardTitle>
        </CardHeader>
        <CardContent className={compact ? "pt-0" : undefined}>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*"
            className="hidden"
            onChange={handleFileChange}
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
            {uploading ? "Uploading…" : "Choose file"}
          </Button>
          {uploadError && (
            <p className="text-sm text-destructive mt-2">{uploadError.message}</p>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-medium mb-2">Files</h3>
        {listing ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : listError ? (
          <p className="text-sm text-destructive">{listError.message}</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files. Upload one above.</p>
        ) : (
          <div
            className={cn(
              "grid gap-3",
              compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
            )}
          >
            {files.map((f) => (
              <FileCard
                key={f.id}
                file={f}
                onSelect={onSelect}
                onDelete={() => setConfirmDelete(f.id)}
                isDeleting={deletingId === f.id}
              />
            ))}
          </div>
        )}
      </div>

      {confirmDelete !== null && (
        <Dialog
          open={true}
          onOpenChange={(open) => !open && setConfirmDelete(null)}
        >
          <DialogContent
            title="Delete file?"
            description="This cannot be undone."
            showClose
            onClose={() => setConfirmDelete(null)}
          >
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  await handleDelete(confirmDelete);
                  setConfirmDelete(null);
                }}
              >
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function FileCard({
  file,
  onSelect,
  onDelete,
  isDeleting,
}: {
  file: FileListItem;
  onSelect?: (url: string, filename: string) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const isVideo = (file.type || "").startsWith("video/");
  const isImage = (file.type || "").startsWith("image/");

  return (
    <Card className="overflow-hidden group">
      <div className="aspect-video bg-muted/50 relative flex items-center justify-center">
        {isVideo ? (
          <video
            src={file.url}
            className="w-full h-full object-contain"
            muted
            preload="metadata"
            playsInline
          />
        ) : isImage ? (
          <img
            src={file.url}
            alt=""
            className="w-full h-full object-contain"
          />
        ) : (
          <FileVideo className="size-10 text-muted-foreground" />
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={() => window.open(file.url, "_blank")}
            aria-label="Open in new tab"
          >
            <ExternalLink className="size-4" />
          </Button>
          {onSelect && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onSelect(file.url, file.filename)}
            >
              <Check className="size-4" />
              Select
            </Button>
          )}
          <Button
            variant="destructive"
            size="icon-sm"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </Button>
        </div>
      </div>
      <CardContent className="p-2">
        <p className="text-xs font-medium truncate" title={file.filename}>
          {file.filename}
        </p>
      </CardContent>
    </Card>
  );
}
