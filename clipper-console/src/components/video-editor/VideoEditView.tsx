/**
 * Single-session video edit UI: media picker, operation list, submit & status.
 * Modern layout with clear hierarchy and all operations.
 */

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { useEditSession } from "@/hooks/use-edit-session";
import { MediaPicker } from "./MediaPicker";
import { OperationList } from "./OperationList";
import { SubmitAndStatus } from "./SubmitAndStatus";

export function VideoEditView() {
  const {
    media,
    mediaDisplayName,
    operations,
    setMedia,
    addOperation,
    removeOperation,
    updateOperation,
    toRequest,
    canSubmit,
    addTrim,
    addText,
    addSpeed,
    addWatermark,
    addAudio,
    addBackgroundColor,
    addTranscode,
    addCompress,
    addConcat,
    addExtractAudio,
    addGif,
  } = useEditSession();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 overflow-x-hidden">
      <div className="container max-w-6xl mx-auto py-10 px-4 w-full min-w-0">
        <header className="mb-10 min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Video edit
          </h1>
        </header>

        <div className="grid gap-8 lg:grid-cols-10 min-w-0">
          {/* Left: source + run */}
          <div className="lg:col-span-4 space-y-6 min-w-0 overflow-hidden">
            {/* When the first operation is a YouTube download, switch source UI to "Import from YouTube" */}
            {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
            {/* @ts-ignore - allow custom prop on MediaPicker */}
            <MediaPicker
              media={media}
              mediaDisplayName={mediaDisplayName}
              onSelect={setMedia}
              showYouTubeImport={operations[0]?.op === "download_from_youtube"}
            />
            <SubmitAndStatus
              toRequest={toRequest}
              canSubmit={canSubmit}
            />
          </div>

          {/* Right: operations pipeline */}
          <div className="lg:col-span-6 min-w-0 overflow-visible">
            <Card className="rounded-2xl border bg-card/80 shadow-sm backdrop-blur overflow-visible">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Operations</CardTitle>
                <CardDescription>
                  Add trim, text, speed, watermark, audio, transcode, compress, GIF, and more. Order is applied top to bottom.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 overflow-visible">
                <OperationList
                  operations={operations}
                  onAdd={addOperation}
                  onRemove={removeOperation}
                  onUpdate={updateOperation}
                  addTrim={addTrim}
                  addText={addText}
                  addSpeed={addSpeed}
                  addWatermark={addWatermark}
                  addAudio={addAudio}
                  addBackgroundColor={addBackgroundColor}
                  addTranscode={addTranscode}
                  addCompress={addCompress}
                  addConcat={addConcat}
                  addExtractAudio={addExtractAudio}
                  addGif={addGif}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
