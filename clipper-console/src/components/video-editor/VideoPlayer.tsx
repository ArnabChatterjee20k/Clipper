/**
 * Reusable video player component for displaying video URLs with controls.
 * Shows the URL as a clickable link and an embedded video player.
 */

import { cn } from "@/lib/utils";

export interface VideoPlayerProps {
  /** Video URL to play */
  url: string;
  /** Display name/filename (shown as link text) */
  filename?: string;
  /** Optional className for the container */
  className?: string;
  /** Maximum height of the video player */
  maxHeight?: string;
  /** Show the URL link above the player */
  showUrl?: boolean;
}

export function VideoPlayer({
  url,
  filename,
  className,
  maxHeight = "max-h-64",
  showUrl = true,
}: VideoPlayerProps) {
  const displayName = filename || url.split("/").pop() || "Video";

  return (
    <div className={cn("space-y-2", className)}>
      {showUrl && (
        <p className="text-xs text-muted-foreground break-all">
          Output:{" "}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {displayName}
          </a>
        </p>
      )}
      <div className="rounded-md border bg-muted/40 p-2">
        <video
          src={url}
          controls
          className={cn("w-full rounded-md bg-black", maxHeight)}
          preload="metadata"
        />
      </div>
    </div>
  );
}
