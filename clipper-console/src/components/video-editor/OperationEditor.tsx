/**
 * Inline editor for a single operation. Supports all backend op types.
 */

import type {
  VideoOperation,
  TrimOp,
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

export function OperationEditor({ operation, onChange, onRemove, variant = "card", className }: OperationEditorProps) {
  const opLabel = OP_LABELS[operation.op] ?? operation.op;

  const content = (
    <>
      {operation.op === "trim" && <TrimEditor op={operation} onChange={(op) => onChange(op)} />}
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
  const o = op.overlay ?? { path: "", mix_volume: 1, loop: false };
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
