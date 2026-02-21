/**
 * Operations as accordion: add dropdown + one accordion per operation.
 * Each accordion item shows op name and expand/collapse for edit options.
 */

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { OperationEditor } from "./OperationEditor";
import type { VideoOperation } from "@/types/edit-session";
import { Plus, Scissors, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OP_TYPES: { value: VideoOperation["op"]; label: string }[] = [
  { value: "trim", label: "Trim" },
  { value: "karaoke", label: "Karaoke highlight" },
  { value: "textSequence", label: "Text sequence (fade)" },
  { value: "text", label: "Text overlay" },
  { value: "speed", label: "Speed" },
  { value: "watermark", label: "Watermark" },
  { value: "audio", label: "Audio overlay" },
  { value: "backgroundColor", label: "Background color" },
  { value: "transcode", label: "Transcode" },
  { value: "compress", label: "Compress" },
  { value: "concat", label: "Concat" },
  { value: "extractAudio", label: "Extract audio" },
  { value: "gif", label: "GIF" },
  { value: "download_from_youtube", label: "Download from YouTube" },
];

const OP_LABELS: Record<string, string> = {
  trim: "Trim",
  karaoke: "Karaoke highlight",
  textSequence: "Text sequence (fade)",
  text: "Text overlay",
  speed: "Speed",
  watermark: "Watermark",
  audio: "Audio",
  backgroundColor: "Background",
  transcode: "Transcode",
  compress: "Compress",
  concat: "Concat",
  extractAudio: "Extract audio",
  gif: "GIF",
  download_from_youtube: "Download from YouTube",
};

export interface OperationListProps {
  operations: VideoOperation[];
  onAdd: (op: VideoOperation) => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, op: VideoOperation) => void;
  addTrim?: () => void;
  addKaraoke?: () => void;
  addTextSequence?: () => void;
  addText?: () => void;
  addSpeed?: (speed?: number) => void;
  addWatermark?: () => void;
  addAudio?: () => void;
  addBackgroundColor?: () => void;
  addTranscode?: () => void;
  addCompress?: () => void;
  addConcat?: () => void;
  addExtractAudio?: () => void;
  addGif?: () => void;
  addDownloadFromYouTube?: () => void;
  className?: string;
}

const ADD_PLACEHOLDER = "__add__";

export function OperationList({
  operations,
  onAdd,
  onRemove,
  onUpdate,
  addTrim,
  addKaraoke,
  addTextSequence,
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
  addDownloadFromYouTube,
  className,
}: OperationListProps) {
  const [selectValue, setSelectValue] = useState<string>(ADD_PLACEHOLDER);

  const handleAdd = (opType: VideoOperation["op"]) => {
    // Download from YouTube is only allowed as the first operation.
    if (opType === "download_from_youtube" && operations.length > 0) {
      setSelectValue(ADD_PLACEHOLDER);
      return;
    }

    setSelectValue(ADD_PLACEHOLDER);
    const helpers: Record<string, () => void> = {
      trim: addTrim ?? (() => onAdd({ op: "trim", start_sec: 0, end_sec: -1 })),
      karaoke: addKaraoke ?? (() => onAdd({ op: "karaoke", sentence: "", start_sec: 0, end_sec: -1, fontsize: 60, x: "(w-text_w)/2", y: "h-200", fontcolor: "white", highlight_fontcolor: "yellow", boxcolor: "black@1.0", boxborderw: 12 })),
      textSequence: addTextSequence ?? (() => onAdd({ op: "textSequence", items: [{ text: "First line", start_sec: 0, end_sec: 2, fontsize: 60, x: "(w-text_w)/2", y: "h-200", fontcolor: "white", background: false, boxcolor: "black@1.0", boxborderw: 12, fade_in_ms: 200, fade_out_ms: 200 }] })),
      text: addText ?? (() => onAdd({ op: "text", segment: [{ start_sec: 0, end_sec: -1, text: "" }] })),
      speed: addSpeed ? () => addSpeed(1) : () => onAdd({ op: "speed", segment: [{ start_sec: 0, end_sec: -1, speed: 1 }] }),
      watermark: addWatermark ?? (() => onAdd({ op: "watermark", overlay: { path: "", position: "(W-w)/2:H-h-80", opacity: 0.7 } })),
      audio: addAudio ?? (() => onAdd({ op: "audio", path: "", mix_volume: 1, loop: false, overlay: { path: "", mix_volume: 1, loop: false } })),
      backgroundColor: addBackgroundColor ?? (() => onAdd({ op: "backgroundColor", overlay: { color: "black", only_color: false } })),
      transcode: addTranscode ?? (() => onAdd({ op: "transcode", codec: "libx264", preset: "medium", crf: 23, audio_codec: "aac" })),
      compress: addCompress ?? (() => onAdd({ op: "compress", preset: "medium" })),
      concat: addConcat ?? (() => onAdd({ op: "concat", input_paths: ["", ""] })),
      extractAudio: addExtractAudio ?? (() => onAdd({ op: "extractAudio" })),
      gif: addGif ?? (() => onAdd({ op: "gif", start_time: "00:00:00", duration: 5, fps: 10, scale: 480, output_codec: "gif" })),
      download_from_youtube: addDownloadFromYouTube ?? (() => onAdd({ op: "download_from_youtube", quality: "best", format: null, audio_only: false })),
    };
    const fn = helpers[opType];
    if (fn) fn();
  };

  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-4">
        <Select
          value={selectValue}
          onValueChange={(v) => handleAdd(v as VideoOperation["op"])}
        >
          <SelectTrigger className="w-full h-9 bg-muted/50 border-dashed min-w-0 max-w-full">
            <Plus className="size-4 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Add operation" />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4} align="start" className="max-h-[min(60vh,400px)]">
            <SelectItem value={ADD_PLACEHOLDER} className="hidden">
              Add operation
            </SelectItem>
            {OP_TYPES.map((t) => (
              <SelectItem
                key={t.value}
                value={t.value}
                disabled={t.value === "download_from_youtube" && operations.length > 0}
              >
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {operations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-muted-foreground/25 bg-muted/20 py-10 px-4 text-center">
          <Scissors className="size-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No operations yet</p>
          <p className="text-xs text-muted-foreground/80 mt-1">Add an operation above.</p>
        </div>
      ) : (
        <Accordion type="single" defaultValue={0}>
          {operations.map((op, i) => (
            <AccordionItem key={i} index={i}>
              <AccordionTrigger
                index={i}
                className="py-3"
                actions={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onRemove(i)}
                    aria-label="Remove operation"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                }
              >
                <span className="font-medium">{OP_LABELS[op.op] ?? op.op}</span>
                <span className="text-muted-foreground text-xs ml-1">Step {i + 1}</span>
              </AccordionTrigger>
              <AccordionContent index={i}>
                <OperationEditor
                  operation={op}
                  onChange={(next) => onUpdate(i, next)}
                  onRemove={() => onRemove(i)}
                  variant="inline"
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
