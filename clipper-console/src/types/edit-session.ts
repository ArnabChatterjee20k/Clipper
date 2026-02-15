/**
 * Edit session types aligned with backend VideoEditRequest.
 * No dependency on generated SDK.
 */

/** Trim operation */
export interface TrimOp {
  op: "trim";
  start_sec?: number;
  end_sec?: number;
  duration?: number;
}

/** Text overlay segment */
export interface TextSegment {
  start_sec?: number;
  end_sec?: number;
  text: string;
  fontsize?: number;
  x?: string;
  y?: string;
}

export interface TextOp {
  op: "text";
  segment: TextSegment[];
}

/** Speed segment */
export interface SpeedSegment {
  start_sec?: number;
  end_sec?: number;
  speed: number;
}

export interface SpeedOp {
  op: "speed";
  segment: SpeedSegment[];
}

/** Watermark overlay – path is URL or path; position is FFmpeg overlay expr */
export interface WatermarkOverlay {
  path: string;
  position?: string;
  opacity?: number;
}

export interface WatermarkOp {
  op: "watermark";
  overlay: WatermarkOverlay;
}

/** Background/mix audio */
export interface AudioOverlay {
  path: string;
  mix_volume?: number;
  loop?: boolean;
}

export interface AudioOp {
  op: "audio";
  path?: string;
  mix_volume?: number;
  loop?: boolean;
  overlay?: AudioOverlay;
}

/** Solid background color */
export interface BackgroundColorOverlay {
  color?: string;
  only_color?: boolean;
}

export interface BackgroundColorOp {
  op: "backgroundColor";
  overlay: BackgroundColorOverlay;
}

/** Transcode options */
export interface TranscodeOp {
  op: "transcode";
  codec?: string;
  preset?: string;
  crf?: number;
  audio_codec?: string;
  movflags?: string | null;
  options?: Record<string, unknown>;
}

/** Compress (target size / scale) */
export interface CompressOp {
  op: "compress";
  target_size_mb?: number | null;
  scale?: string | null;
  preset?: string;
}

/** Concat – list of input URLs/paths */
export interface ConcatOp {
  op: "concat";
  input_paths: string[];
}

/** Extract audio only */
export interface ExtractAudioOp {
  op: "extractAudio";
}

/** GIF export segment */
export interface GifOp {
  op: "gif";
  start_time?: string;
  duration?: number;
  fps?: number;
  scale?: number;
  output_codec?: string;
}

/** Single operation in the pipeline (discriminated by op) */
export type VideoOperation =
  | TrimOp
  | TextOp
  | SpeedOp
  | WatermarkOp
  | AudioOp
  | BackgroundColorOp
  | TranscodeOp
  | CompressOp
  | ConcatOp
  | ExtractAudioOp
  | GifOp;

/** Request body for POST /edits. media must be presigned URL. */
export interface VideoEditRequest {
  media: string;
  operations: VideoOperation[];
}

/** Default trim: full video */
export const defaultTrimOp: TrimOp = {
  op: "trim",
  start_sec: 0,
  end_sec: -1,
};

/** Default text segment */
export function defaultTextSegment(overrides?: Partial<TextSegment>): TextSegment {
  return {
    start_sec: 0,
    end_sec: -1,
    text: "",
    ...overrides,
  };
}

/** Default speed segment */
export function defaultSpeedOp(speed: number = 1): SpeedOp {
  return {
    op: "speed",
    segment: [{ start_sec: 0, end_sec: -1, speed }],
  };
}

/** Watermark position values (match backend WatermarkPosition) */
export const WATERMARK_POSITIONS = [
  { value: "10:10", label: "Top left" },
  { value: "(W-w)/2:10", label: "Top center" },
  { value: "W-w-10:10", label: "Top right" },
  { value: "(W-w)/2:(H-h)/2", label: "Center" },
  { value: "(W-w)/2:H-h-80", label: "Safe bottom" },
  { value: "(W-w)/2:H-h-10", label: "Bottom center" },
] as const;

export const defaultWatermarkOp: WatermarkOp = {
  op: "watermark",
  overlay: { path: "", position: "(W-w)/2:H-h-80", opacity: 0.7 },
};

export const defaultAudioOp: AudioOp = {
  op: "audio",
  path: "",
  mix_volume: 1,
  loop: false,
  overlay: { path: "", mix_volume: 1, loop: false },
};

export const defaultBackgroundColorOp: BackgroundColorOp = {
  op: "backgroundColor",
  overlay: { color: "black", only_color: false },
};

export const defaultTranscodeOp: TranscodeOp = {
  op: "transcode",
  codec: "libx264",
  preset: "medium",
  crf: 23,
  audio_codec: "aac",
};

export const defaultCompressOp: CompressOp = {
  op: "compress",
  preset: "medium",
};

export const defaultConcatOp: ConcatOp = {
  op: "concat",
  input_paths: ["", ""],
};

export const defaultExtractAudioOp: ExtractAudioOp = { op: "extractAudio" };

export const defaultGifOp: GifOp = {
  op: "gif",
  start_time: "00:00:00",
  duration: 5,
  fps: 10,
  scale: 480,
  output_codec: "gif",
};
