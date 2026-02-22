/**
 * Inline editor for a single operation. Supports all backend op types.
 */

import type {
  VideoOperation,
  TrimOp,
  KaraokeOp,
  WordTiming,
  TextSequenceOp,
  TimedTextItem,
  TextOp,
  TextSegment,
  SpeedOp,
  WatermarkOp,
  AudioOp,
  BackgroundColorOp,
  TranscodeOp,
  CompressOp,
  ConcatOp,
  GifOp,
  DownloadFromYouTubeOp,
  ConvertToPlatformOp,
} from "@/types/edit-session";
import { WATERMARK_POSITIONS } from "@/types/edit-session";
import {
  TEXT_POSITIONS,
  TEXT_POSITION_LABELS,
  CUSTOM_POSITION_KEY,
} from "@/config/text-positions";
import {
  SOCIAL_MEDIA_RATIOS,
  SOCIAL_MEDIA_SCALE_LABELS,
  CUSTOM_SCALE_KEY,
} from "@/config/social-media-ratios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Trash2, Plus } from "lucide-react";

export interface OperationEditorProps {
  operation: VideoOperation;
  onChange: (op: VideoOperation) => void;
  onRemove: () => void;
  /** When "inline", no card wrapper and no header/remove (for use inside accordion). */
  variant?: "card" | "inline";
  className?: string;
}

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
  convertToPlatform: "Convert to platform",
};

export function OperationEditor({ operation, onChange, onRemove, variant = "card", className }: OperationEditorProps) {
  const opLabel = OP_LABELS[operation.op] ?? operation.op;

  const content = (
    <>
      {operation.op === "trim" && <TrimEditor op={operation} onChange={(op) => onChange(op)} />}
      {operation.op === "karaoke" && <KaraokeEditor op={operation} onChange={(op) => onChange(op)} />}
      {operation.op === "textSequence" && <TextSequenceEditor op={operation} onChange={(op) => onChange(op)} />}
      {operation.op === "text" && <TextEditor op={operation} onChange={(op) => onChange(op)} />}
      {operation.op === "speed" && <SpeedEditor op={operation} onChange={(op) => onChange(op)} />}
      {operation.op === "watermark" && <WatermarkEditor op={operation} onChange={(op) => onChange(op)} />}
      {operation.op === "audio" && <AudioEditor op={operation} onChange={(op) => onChange(op)} />}
      {operation.op === "backgroundColor" && <BackgroundColorEditor op={operation} onChange={(op) => onChange(op)} />}
      {operation.op === "transcode" && <TranscodeEditor op={operation} onChange={(op) => onChange(op)} />}
      {operation.op === "compress" && <CompressEditor op={operation} onChange={(op) => onChange(op)} />}
      {operation.op === "concat" && <ConcatEditor op={operation} onChange={(op) => onChange(op)} />}
      {operation.op === "extractAudio" && <p className="text-xs text-muted-foreground">Extract audio track only. No options.</p>}
      {operation.op === "gif" && <GifEditor op={operation} onChange={(op) => onChange(op)} />}
      {operation.op === "download_from_youtube" && <YouTubeDownloadEditor op={operation} onChange={(op) => onChange(op)} />}
      {operation.op === "convertToPlatform" && <ConvertToPlatformEditor op={operation} onChange={(op) => onChange(op)} />}
    </>
  );

  if (variant === "inline") {
    return <div className={cn("flex flex-col gap-3 pt-1", className)}>{content}</div>;
  }

  return (
    <Card className={cn("rounded-xl border bg-card/50 shadow-sm", className)}>
      <CardContent className="pt-3 pb-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="font-medium">
            {opLabel}
          </Badge>
          <Button type="button" variant="ghost" size="icon-xs" onClick={onRemove} aria-label="Remove">
            <Trash2 className="size-4 text-muted-foreground" />
          </Button>
        </div>
        {content}
      </CardContent>
    </Card>
  );
}

function TrimEditor({ op, onChange }: { op: TrimOp; onChange: (op: TrimOp) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="space-y-1">
        <Label className="text-xs">Start (s)</Label>
        <Input
          type="number"
          min={0}
          step={0.5}
          value={op.start_sec ?? 0}
          onChange={(e) => onChange({ ...op, start_sec: Number(e.target.value) || 0 })}
          className="h-8"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">End (s)</Label>
        <Input
          type="number"
          min={-1}
          step={0.5}
          value={op.end_sec ?? -1}
          onChange={(e) => onChange({ ...op, end_sec: Number(e.target.value) ?? -1 })}
          placeholder="-1 = end"
          className="h-8"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Duration (s)</Label>
        <Input
          type="number"
          min={0}
          step={0.5}
          value={op.duration ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ ...op, duration: v === "" ? undefined : Number(v) });
          }}
          placeholder="optional"
          className="h-8"
        />
      </div>
    </div>
  );
}

function KaraokeEditor({ op, onChange }: { op: KaraokeOp; onChange: (op: VideoOperation) => void }) {
  const positionKey =
    (Object.entries(TEXT_POSITIONS).find(
      ([_, p]) => p.x === (op.x ?? "(w-text_w)/2") && p.y === (op.y ?? "h-200")
    )?.[0]) ?? CUSTOM_POSITION_KEY;
  const hasHighlightBackground = Boolean(op.boxcolor);
  const start = op.start_sec ?? 0;
  const end = op.end_sec ?? -1;
  const durationValue = end === -1 ? "" : Math.max(0, Number((end - start).toFixed(2)));
  const steps = op.words ?? [];

  const updateStep = (index: number, patch: Partial<WordTiming>) => {
    const next = steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ ...op, words: next });
  };

  const addStep = () => {
    const fallbackEnd = end === -1 ? start + 0.5 : end;
    onChange({
      ...op,
      words: [
        ...steps,
        {
          word: "",
          start_sec: start,
          end_sec: fallbackEnd,
        },
      ],
    });
  };

  const removeStep = (index: number) => {
    const next = steps.filter((_, i) => i !== index);
    onChange({ ...op, words: next.length ? next : undefined });
  };

  const autoFillStepsFromSentence = () => {
    const tokens = op.sentence
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (tokens.length === 0) return;

    if (end === -1 || end <= start) {
      const next = tokens.map((word, i) => ({
        word,
        start_sec: Number((start + i * 0.5).toFixed(2)),
        end_sec: Number((start + (i + 1) * 0.5).toFixed(2)),
      }));
      onChange({ ...op, words: next });
      return;
    }

    const chunk = (end - start) / tokens.length;
    const next = tokens.map((word, i) => ({
      word,
      start_sec: Number((start + i * chunk).toFixed(2)),
      end_sec: Number((start + (i + 1) * chunk).toFixed(2)),
    }));
    onChange({ ...op, words: next });
  };

  const convertStepsToFadeSequence = () => {
    const sourceSteps =
      steps.length > 0
        ? steps
        : op.sentence
            .split(/\s+/)
            .map((w) => w.trim())
            .filter(Boolean)
            .map((word, i) => ({
              word,
              start_sec: Number((start + i * 0.5).toFixed(2)),
              end_sec: Number((start + (i + 1) * 0.5).toFixed(2)),
            }));

    if (sourceSteps.length === 0) return;

    const fadeOp: TextSequenceOp = {
      op: "textSequence",
      items: sourceSteps.map((s) => ({
        text: s.word,
        start_sec: s.start_sec,
        end_sec: s.end_sec,
        fontsize: op.fontsize ?? 60,
        x: op.x ?? "(w-text_w)/2",
        y: op.y ?? "h-200",
        fontcolor: op.fontcolor ?? "white",
        boxcolor: op.boxcolor ?? "black@1.0",
        boxborderw: op.boxborderw ?? 12,
        background: Boolean(op.boxcolor),
        fade_in_ms: 200,
        fade_out_ms: 200,
      })),
    };

    onChange(fadeOp);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Sentence</Label>
        <Input
          value={op.sentence}
          onChange={(e) => onChange({ ...op, sentence: e.target.value })}
          placeholder="Type the sentence to animate"
          className="h-8"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Start (s)</Label>
          <Input
            type="number"
            min={0}
            step={0.1}
            value={op.start_sec ?? 0}
            onChange={(e) => onChange({ ...op, start_sec: Number(e.target.value) || 0 })}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End (s)</Label>
          <Input
            type="number"
            min={-1}
            step={0.1}
            value={op.end_sec ?? -1}
            onChange={(e) => onChange({ ...op, end_sec: Number(e.target.value) ?? -1 })}
            placeholder="-1 = end"
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Duration (s)</Label>
          <Input
            type="number"
            min={0}
            step={0.1}
            value={durationValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                onChange({ ...op, end_sec: -1 });
                return;
              }
              const duration = Number(v);
              onChange({ ...op, end_sec: Number((start + (Number.isFinite(duration) ? duration : 0)).toFixed(2)) });
            }}
            placeholder="-1 end -> blank"
            className="h-8"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Font size</Label>
          <Input
            type="number"
            min={8}
            max={120}
            value={op.fontsize ?? 60}
            onChange={(e) => onChange({ ...op, fontsize: Number(e.target.value) || 60 })}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Position</Label>
          <select
            className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={positionKey}
            onChange={(e) => {
              const key = e.target.value;
              if (key === CUSTOM_POSITION_KEY) return;
              const pos = TEXT_POSITIONS[key];
              if (pos) onChange({ ...op, x: pos.x, y: pos.y });
            }}
          >
            {Object.entries(TEXT_POSITIONS).map(([key]) => (
              <option key={key} value={key}>
                {TEXT_POSITION_LABELS[key] ?? key}
              </option>
            ))}
            <option value={CUSTOM_POSITION_KEY}>Custom</option>
          </select>
        </div>
      </div>
      {positionKey === CUSTOM_POSITION_KEY && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">X expression</Label>
            <Input
              value={op.x ?? "(w-text_w)/2"}
              onChange={(e) => onChange({ ...op, x: e.target.value })}
              placeholder="(w-text_w)/2"
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Y expression</Label>
            <Input
              value={op.y ?? "h-200"}
              onChange={(e) => onChange({ ...op, y: e.target.value })}
              placeholder="h-200"
              className="h-8"
            />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Text color</Label>
          <Input
            value={op.fontcolor ?? "white"}
            onChange={(e) => onChange({ ...op, fontcolor: e.target.value })}
            placeholder="white or #FFFFFF"
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Highlight text color</Label>
          <Input
            value={op.highlight_fontcolor ?? "yellow"}
            onChange={(e) => {
              const next = e.target.value.trim();
              onChange({ ...op, highlight_fontcolor: next === "" ? undefined : next });
            }}
            placeholder="yellow or #FFEB3B"
            className="h-8"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Highlight background color</Label>
          <Input
            value={op.boxcolor ?? ""}
            onChange={(e) => {
              const next = e.target.value.trim();
              onChange({ ...op, boxcolor: next === "" ? undefined : next });
            }}
            placeholder="black@1.0"
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Background padding</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={op.boxborderw ?? 0}
            onChange={(e) => onChange({ ...op, boxborderw: Number(e.target.value) || 0 })}
            className="h-8"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={hasHighlightBackground}
          onChange={(e) => {
            if (e.target.checked) {
              onChange({
                ...op,
                boxcolor: op.boxcolor && op.boxcolor.trim() ? op.boxcolor : "black@1.0",
                boxborderw: op.boxborderw ?? 12,
              });
            } else {
              onChange({ ...op, boxcolor: undefined });
            }
          }}
          aria-label="Enable highlight background"
          className="rounded border-input"
        />
        <Label className="text-xs">
          Enable highlight background
        </Label>
      </div>
      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Word steps (animation timeline)</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="xs" onClick={autoFillStepsFromSentence}>
              Auto-fill from sentence
            </Button>
            <Button type="button" variant="outline" size="xs" onClick={convertStepsToFadeSequence}>
              Convert steps to fade sequence
            </Button>
            <Button type="button" variant="outline" size="xs" onClick={addStep}>
              <Plus className="size-3.5 mr-1" />
              Add step
            </Button>
          </div>
        </div>
        {steps.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No steps added. Backend auto-distributes timings between start and end.
          </p>
        ) : (
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5 space-y-1">
                  <Label className="text-xs">Step {index + 1} text</Label>
                  <Input
                    value={step.word}
                    onChange={(e) => updateStep(index, { word: e.target.value })}
                    placeholder="word or phrase"
                    className="h-8"
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">Start</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={step.start_sec}
                    onChange={(e) => updateStep(index, { start_sec: Number(e.target.value) || 0 })}
                    className="h-8"
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">End</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={step.end_sec}
                    onChange={(e) => updateStep(index, { end_sec: Number(e.target.value) || 0 })}
                    className="h-8"
                  />
                </div>
                <div className="col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => removeStep(index)}
                    aria-label="Remove step"
                  >
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Use steps to control word timings. Convert to fade sequence for per-word fade-in/out animation.
      </p>
    </div>
  );
}

function TextSequenceEditor({ op, onChange }: { op: TextSequenceOp; onChange: (op: TextSequenceOp) => void }) {
  const items = op.items?.length ? op.items : [{
    text: "First line",
    start_sec: 0,
    end_sec: 2,
    fontsize: 60,
    x: "(w-text_w)/2",
    y: "h-200",
    fontcolor: "white",
    background: false,
    boxcolor: "black@1.0",
    boxborderw: 12,
    fade_in_ms: 200,
    fade_out_ms: 200,
  }];

  const updateItem = (index: number, patch: Partial<TimedTextItem>) => {
    const next = items.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ ...op, items: next });
  };
  const addItem = () => {
    onChange({
      ...op,
      items: [
        ...items,
        {
          text: "Next line",
          start_sec: 0,
          end_sec: 2,
          fontsize: 60,
          x: "(w-text_w)/2",
          y: "h-200",
          fontcolor: "white",
          background: false,
          boxcolor: "black@1.0",
          boxborderw: 12,
          fade_in_ms: 200,
          fade_out_ms: 200,
        },
      ],
    });
  };
  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    const next = items.filter((_, i) => i !== index);
    onChange({ ...op, items: next });
  };

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="rounded-lg border border-border/60 bg-muted/30 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Item {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => removeItem(index)}
              disabled={items.length <= 1}
              aria-label="Remove item"
            >
              <Trash2 className="size-3.5 text-muted-foreground" />
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Text</Label>
            <Input
              value={item.text}
              onChange={(e) => updateItem(index, { text: e.target.value })}
              placeholder="Overlay text"
              className="h-8"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Start (s)</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={item.start_sec ?? 0}
                onChange={(e) => updateItem(index, { start_sec: Number(e.target.value) || 0 })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End (s)</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={item.end_sec ?? 0}
                onChange={(e) => updateItem(index, { end_sec: Number(e.target.value) || 0 })}
                className="h-8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Fade in (ms)</Label>
              <Input
                type="number"
                min={0}
                step={50}
                value={item.fade_in_ms ?? 0}
                onChange={(e) => updateItem(index, { fade_in_ms: Number(e.target.value) || 0 })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fade out (ms)</Label>
              <Input
                type="number"
                min={0}
                step={50}
                value={item.fade_out_ms ?? 0}
                onChange={(e) => updateItem(index, { fade_out_ms: Number(e.target.value) || 0 })}
                className="h-8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Font size</Label>
              <Input
                type="number"
                min={8}
                max={120}
                value={item.fontsize ?? 60}
                onChange={(e) => updateItem(index, { fontsize: Number(e.target.value) || 60 })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Position</Label>
              <select
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={
                  (Object.entries(TEXT_POSITIONS).find(
                    ([_, p]) => p.x === (item.x ?? "(w-text_w)/2") && p.y === (item.y ?? "h-200")
                  )?.[0]) ?? CUSTOM_POSITION_KEY
                }
                onChange={(e) => {
                  const key = e.target.value;
                  if (key === CUSTOM_POSITION_KEY) return;
                  const pos = TEXT_POSITIONS[key];
                  if (pos) updateItem(index, { x: pos.x, y: pos.y });
                }}
              >
                {Object.entries(TEXT_POSITIONS).map(([key]) => (
                  <option key={key} value={key}>
                    {TEXT_POSITION_LABELS[key] ?? key}
                  </option>
                ))}
                <option value={CUSTOM_POSITION_KEY}>Custom</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Font color</Label>
              <Input
                value={item.fontcolor ?? "white"}
                onChange={(e) => updateItem(index, { fontcolor: e.target.value })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Box color</Label>
              <Input
                value={item.boxcolor ?? "black@1.0"}
                onChange={(e) => updateItem(index, { boxcolor: e.target.value })}
                className="h-8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Box padding</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={item.boxborderw ?? 0}
                onChange={(e) => updateItem(index, { boxborderw: Number(e.target.value) || 0 })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Background</Label>
              <select
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={item.background ? "yes" : "no"}
                onChange={(e) => updateItem(index, { background: e.target.value === "yes" })}
              >
                <option value="no">Off</option>
                <option value="yes">On</option>
              </select>
            </div>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addItem}>
        <Plus className="size-3.5 mr-1" />
        Add item
      </Button>
    </div>
  );
}

function TextEditor({ op, onChange }: { op: TextOp; onChange: (op: TextOp) => void }) {
  const segments = op.segment?.length ? op.segment : [{ start_sec: 0, end_sec: -1, text: "" }];
  const updateSeg = (index: number, patch: Partial<TextSegment>) => {
    const next = segments.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ ...op, segment: next });
  };
  const addSegment = () => {
    onChange({ ...op, segment: [...segments, { start_sec: 0, end_sec: -1, text: "" }] });
  };
  const removeSegment = (index: number) => {
    if (segments.length <= 1) return;
    const next = segments.filter((_, i) => i !== index);
    onChange({ ...op, segment: next });
  };
  return (
    <div className="space-y-3">
      {segments.map((seg, index) => (
        <div key={index} className="rounded-lg border border-border/60 bg-muted/30 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Segment {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => removeSegment(index)}
              disabled={segments.length <= 1}
              aria-label="Remove segment"
            >
              <Trash2 className="size-3.5 text-muted-foreground" />
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Text</Label>
            <Input
              value={seg.text}
              onChange={(e) => updateSeg(index, { text: e.target.value })}
              placeholder="Overlay text"
              className="h-8"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Start (s)</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={seg.start_sec ?? 0}
                onChange={(e) => updateSeg(index, { start_sec: Number(e.target.value) || 0 })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End (s)</Label>
              <Input
                type="number"
                min={-1}
                step={0.5}
                value={seg.end_sec ?? -1}
                onChange={(e) => updateSeg(index, { end_sec: Number(e.target.value) ?? -1 })}
                placeholder="-1"
                className="h-8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Font size</Label>
              <Input
                type="number"
                min={8}
                max={120}
                value={seg.fontsize ?? 24}
                onChange={(e) => updateSeg(index, { fontsize: Number(e.target.value) || 24 })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Position</Label>
              <select
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={
                  (Object.entries(TEXT_POSITIONS).find(
                    ([_, p]) => p.x === (seg.x ?? "10") && p.y === (seg.y ?? "10")
                  )?.[0]) ?? CUSTOM_POSITION_KEY
                }
                onChange={(e) => {
                  const key = e.target.value;
                  if (key === CUSTOM_POSITION_KEY) return;
                  const pos = TEXT_POSITIONS[key];
                  if (pos) updateSeg(index, { x: pos.x, y: pos.y });
                }}
              >
                <option value={CUSTOM_POSITION_KEY}>Custom</option>
                {Object.keys(TEXT_POSITIONS).map((key) => (
                  <option key={key} value={key}>
                    {TEXT_POSITION_LABELS[key] ?? key}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">X</Label>
              <Input
                value={seg.x ?? "10"}
                onChange={(e) => updateSeg(index, { x: e.target.value || "10" })}
                placeholder="10 or expression"
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Y</Label>
              <Input
                value={seg.y ?? "10"}
                onChange={(e) => updateSeg(index, { y: e.target.value || "10" })}
                placeholder="10 or expression"
                className="h-8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Font file (path)</Label>
              <Input
                value={seg.fontfile ?? ""}
                onChange={(e) => updateSeg(index, { fontfile: e.target.value || undefined })}
                placeholder="optional"
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Font color</Label>
              <Input
                value={seg.fontcolor ?? ""}
                onChange={(e) => updateSeg(index, { fontcolor: e.target.value || undefined })}
                placeholder="e.g. white or 0xffffff"
                className="h-8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Box color</Label>
              <Input
                value={seg.boxcolor ?? ""}
                onChange={(e) => updateSeg(index, { boxcolor: e.target.value || undefined })}
                placeholder="optional"
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Box border width</Label>
              <Input
                type="number"
                min={0}
                value={seg.boxborderw ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  updateSeg(index, { boxborderw: v === "" ? undefined : Number(v) });
                }}
                placeholder="optional"
                className="h-8"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`text-bg-${index}`}
              checked={seg.background ?? false}
              onChange={(e) => updateSeg(index, { background: e.target.checked })}
              className="rounded border-input"
            />
            <Label htmlFor={`text-bg-${index}`} className="text-xs">Draw box behind text</Label>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="xs" onClick={addSegment}>
        <Plus className="size-3.5 mr-1" />
        Add segment
      </Button>
    </div>
  );
}

function SpeedEditor({ op, onChange }: { op: SpeedOp; onChange: (op: SpeedOp) => void }) {
  const segments = op.segment?.length ? op.segment : [{ start_sec: 0, end_sec: -1, speed: 1 }];
  const updateSeg = (index: number, patch: { start_sec?: number; end_sec?: number; speed?: number }) => {
    const next = segments.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ ...op, segment: next });
  };
  const addSegment = () => {
    onChange({ ...op, segment: [...segments, { start_sec: 0, end_sec: -1, speed: 1 }] });
  };
  const removeSegment = (index: number) => {
    if (segments.length <= 1) return;
    const next = segments.filter((_, i) => i !== index);
    onChange({ ...op, segment: next });
  };
  return (
    <div className="space-y-3">
      {segments.map((seg, index) => (
        <div key={index} className="rounded-lg border border-border/60 bg-muted/30 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Segment {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => removeSegment(index)}
              disabled={segments.length <= 1}
              aria-label="Remove segment"
            >
              <Trash2 className="size-3.5 text-muted-foreground" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Start (s)</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={seg.start_sec ?? 0}
                onChange={(e) => updateSeg(index, { start_sec: Number(e.target.value) || 0 })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End (s)</Label>
              <Input
                type="number"
                min={-1}
                step={0.5}
                value={seg.end_sec ?? -1}
                onChange={(e) => updateSeg(index, { end_sec: Number(e.target.value) ?? -1 })}
                placeholder="-1"
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Speed</Label>
              <Input
                type="number"
                min={0.25}
                max={4}
                step={0.25}
                value={seg.speed ?? 1}
                onChange={(e) => updateSeg(index, { speed: Number(e.target.value) || 1 })}
                className="h-8"
              />
            </div>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="xs" onClick={addSegment}>
        <Plus className="size-3.5 mr-1" />
        Add segment
      </Button>
    </div>
  );
}

function WatermarkEditor({ op, onChange }: { op: WatermarkOp; onChange: (op: WatermarkOp) => void }) {
  const o = op.overlay;
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Image URL or path</Label>
        <Input
          value={o.path}
          onChange={(e) => onChange({ ...op, overlay: { ...o, path: e.target.value } })}
          placeholder="https://... or /path/to/image.png"
          className="h-8"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Position</Label>
        <select
          className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
          value={o.position ?? "(W-w)/2:H-h-80"}
          onChange={(e) => onChange({ ...op, overlay: { ...o, position: e.target.value } })}
        >
          {WATERMARK_POSITIONS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Opacity (0–1)</Label>
        <Input
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={o.opacity ?? 0.7}
          onChange={(e) => onChange({ ...op, overlay: { ...o, opacity: Number(e.target.value) || 0.7 } })}
          className="h-8"
        />
      </div>
    </div>
  );
}

function AudioEditor({ op, onChange }: { op: AudioOp; onChange: (op: AudioOp) => void }) {
  const o = op.overlay ?? { path: "", mix_volume: 1, loop: false, mute_source: false };
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Audio URL or path</Label>
        <Input
          value={o.path}
          onChange={(e) => onChange({ ...op, overlay: { ...o, path: e.target.value } })}
          placeholder="https://... or /path/to/audio.mp3"
          className="h-8"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Mix volume (0–1)</Label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={o.mix_volume ?? 1}
            onChange={(e) => onChange({ ...op, overlay: { ...o, mix_volume: Number(e.target.value) || 1 } })}
            className="h-8"
          />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <input
            type="checkbox"
            id="audio-loop"
            checked={o.loop ?? false}
            onChange={(e) => onChange({ ...op, overlay: { ...o, loop: e.target.checked } })}
            className="rounded border-input"
          />
          <Label htmlFor="audio-loop" className="text-xs">Loop</Label>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="audio-mute-source"
          checked={o.mute_source ?? false}
          onChange={(e) => onChange({ ...op, overlay: { ...o, mute_source: e.target.checked } })}
          className="rounded border-input"
        />
        <Label htmlFor="audio-mute-source" className="text-xs">Mute source media (only play this audio)</Label>
      </div>
    </div>
  );
}

function BackgroundColorEditor({ op, onChange }: { op: BackgroundColorOp; onChange: (op: BackgroundColorOp) => void }) {
  const o = op.overlay ?? { color: "black", only_color: false };
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Color (name or 0xRRGGBB)</Label>
        <Input
          value={o.color ?? "black"}
          onChange={(e) => onChange({ ...op, overlay: { ...o, color: e.target.value } })}
          placeholder="black or 0xffffff"
          className="h-8"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="bg-only"
          checked={o.only_color ?? false}
          onChange={(e) => onChange({ ...op, overlay: { ...o, only_color: e.target.checked } })}
          className="rounded border-input"
        />
        <Label htmlFor="bg-only" className="text-xs">Only color (no video)</Label>
      </div>
    </div>
  );
}

function TranscodeEditor({ op, onChange }: { op: TranscodeOp; onChange: (op: TranscodeOp) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Video codec</Label>
          <Input value={op.codec ?? "libx264"} onChange={(e) => onChange({ ...op, codec: e.target.value })} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Preset</Label>
          <Input value={op.preset ?? "medium"} onChange={(e) => onChange({ ...op, preset: e.target.value })} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">CRF</Label>
          <Input type="number" min={0} max={51} value={op.crf ?? 23} onChange={(e) => onChange({ ...op, crf: Number(e.target.value) || 23 })} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Audio codec</Label>
          <Input value={op.audio_codec ?? "aac"} onChange={(e) => onChange({ ...op, audio_codec: e.target.value })} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Audio bitrate</Label>
          <Input
            value={op.audio_bitrate ?? ""}
            onChange={(e) => onChange({ ...op, audio_bitrate: e.target.value || undefined })}
            placeholder="e.g. 128k"
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Movflags</Label>
          <Input
            value={op.movflags ?? ""}
            onChange={(e) => onChange({ ...op, movflags: e.target.value || undefined })}
            placeholder="e.g. +faststart"
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Target size (MB)</Label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={op.target_size_mb ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ ...op, target_size_mb: v === "" ? undefined : Number(v) });
            }}
            placeholder="optional"
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Scale preset</Label>
          <select
            className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={
              Object.entries(SOCIAL_MEDIA_RATIOS).find(
                ([_, r]) => r.scale === (op.scale ?? "")
              )?.[0] ?? CUSTOM_SCALE_KEY
            }
            onChange={(e) => {
              const key = e.target.value;
              if (key === CUSTOM_SCALE_KEY) return;
              const ratio = SOCIAL_MEDIA_RATIOS[key];
              if (ratio) onChange({ ...op, scale: ratio.scale });
            }}
          >
            <option value={CUSTOM_SCALE_KEY}>Custom</option>
            {Object.keys(SOCIAL_MEDIA_RATIOS).map((key) => (
              <option key={key} value={key}>
                {SOCIAL_MEDIA_SCALE_LABELS[key] ?? key}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Scale</Label>
          <Input
            value={op.scale ?? ""}
            onChange={(e) => onChange({ ...op, scale: e.target.value || undefined })}
            placeholder="e.g. 1280:-1 or use preset"
            className="h-8"
          />
        </div>
      </div>
    </div>
  );
}

function CompressEditor({ op, onChange }: { op: CompressOp; onChange: (op: CompressOp) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Target size (MB)</Label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={op.target_size_mb ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ ...op, target_size_mb: v === "" ? undefined : Number(v) });
            }}
            placeholder="optional"
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Scale preset</Label>
          <select
            className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={
              Object.entries(SOCIAL_MEDIA_RATIOS).find(
                ([_, r]) => r.scale === (op.scale ?? "")
              )?.[0] ?? CUSTOM_SCALE_KEY
            }
            onChange={(e) => {
              const key = e.target.value;
              if (key === CUSTOM_SCALE_KEY) return;
              const ratio = SOCIAL_MEDIA_RATIOS[key];
              if (ratio) onChange({ ...op, scale: ratio.scale });
            }}
          >
            <option value={CUSTOM_SCALE_KEY}>Custom</option>
            {Object.keys(SOCIAL_MEDIA_RATIOS).map((key) => (
              <option key={key} value={key}>
                {SOCIAL_MEDIA_SCALE_LABELS[key] ?? key}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Scale</Label>
          <Input
            value={op.scale ?? ""}
            onChange={(e) => onChange({ ...op, scale: e.target.value || undefined })}
            placeholder="e.g. 1280:-1 or use preset"
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Preset</Label>
          <Input value={op.preset ?? "medium"} onChange={(e) => onChange({ ...op, preset: e.target.value })} className="h-8" />
        </div>
      </div>
    </div>
  );
}

function ConcatEditor({ op, onChange }: { op: ConcatOp; onChange: (op: ConcatOp) => void }) {
  const paths = op.input_paths?.length ? op.input_paths : ["", ""];
  const update = (i: number, v: string) => {
    const next = [...paths];
    next[i] = v;
    onChange({ ...op, input_paths: next });
  };
  return (
    <div className="space-y-2">
      {paths.map((p, i) => (
        <div key={i} className="space-y-1">
          <Label className="text-xs">Input {i + 1} URL/path</Label>
          <Input value={p} onChange={(e) => update(i, e.target.value)} placeholder="https://... or path" className="h-8" />
        </div>
      ))}
      <Button type="button" variant="outline" size="xs" onClick={() => onChange({ ...op, input_paths: [...paths, ""] })}>
        Add input
      </Button>
    </div>
  );
}

function GifEditor({ op, onChange }: { op: GifOp; onChange: (op: GifOp) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <Label className="text-xs">Start time (HH:MM:SS)</Label>
        <Input value={op.start_time ?? "00:00:00"} onChange={(e) => onChange({ ...op, start_time: e.target.value })} className="h-8" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Duration (s)</Label>
        <Input type="number" min={1} value={op.duration ?? 5} onChange={(e) => onChange({ ...op, duration: Number(e.target.value) || 5 })} className="h-8" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">FPS</Label>
        <Input type="number" min={1} max={30} value={op.fps ?? 10} onChange={(e) => onChange({ ...op, fps: Number(e.target.value) || 10 })} className="h-8" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Width (scale)</Label>
        <Input type="number" min={100} value={op.scale ?? 480} onChange={(e) => onChange({ ...op, scale: Number(e.target.value) || 480 })} className="h-8" />
      </div>
    </div>
  );
}

const PLATFORM_OPTIONS = [
  { value: "generic", label: "Generic (LinkedIn, Instagram, YouTube, etc)" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
] as const;

function ConvertToPlatformEditor({ op, onChange }: { op: ConvertToPlatformOp; onChange: (op: ConvertToPlatformOp) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Transcodes the output to MP4 with +faststart for upload compatibility on LinkedIn, Instagram, and similar platforms.
      </p>
      <div className="space-y-1">
        <Label className="text-xs">Platform preset</Label>
        <select
          value={op.platform ?? "generic"}
          onChange={(e) => onChange({ ...op, platform: e.target.value || "generic" })}
          className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          {PLATFORM_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function YouTubeDownloadEditor({ op, onChange }: { op: DownloadFromYouTubeOp; onChange: (op: DownloadFromYouTubeOp) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="audio-only"
            checked={op.audio_only ?? false}
            onChange={(e) => onChange({ ...op, audio_only: e.target.checked })}
            className="h-4 w-4 rounded border-input"
          />
          <Label htmlFor="audio-only" className="text-xs cursor-pointer">
            Audio only
          </Label>
        </div>
      </div>
      {!op.audio_only && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Quality</Label>
            <select
              className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={op.quality ?? "best"}
              onChange={(e) => onChange({ ...op, quality: e.target.value || null })}
            >
              <option value="best">Best</option>
              <option value="worst">Worst</option>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              <option value="1440p">1440p</option>
              <option value="2160p">2160p (4K)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Format (optional)</Label>
            <Input
              value={op.format ?? ""}
              onChange={(e) => onChange({ ...op, format: e.target.value || null })}
              placeholder="e.g. mp4, webm"
              className="h-8"
            />
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Note: The media URL should be a YouTube URL when using this operation.
      </p>
    </div>
  );
}
