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
  fontfile?: string | null;
  fontcolor?: string | null;
  boxcolor?: string | null;
  boxborderw?: number | null;
  background?: boolean | null;
}

export interface WordTiming {
  word: string;
  start_sec: number;
  end_sec: number;
}

export interface KaraokeOp {
  op: "karaoke";
  sentence: string;
  start_sec?: number;
  end_sec?: number;
  words?: WordTiming[];
  fontsize?: number;
  x?: string;
  y?: string;
  fontcolor?: string | null;
  highlight_fontcolor?: string | null;
  boxcolor?: string | null;
  boxborderw?: number | null;
  letter_width?: number | null;
  space_width?: number | null;
}

export interface TimedTextItem {
  text: string;
  start_sec: number;
  end_sec: number;
  fontsize?: number;
  x?: string;
  y?: string;
  fontcolor?: string | null;
  boxcolor?: string | null;
  boxborderw?: number | null;
  background?: boolean;
  fade_in_ms?: number;
  fade_out_ms?: number;
}

export interface TextSequenceOp {
  op: "textSequence";
  items: TimedTextItem[];
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

/** Transcode options (matches backend TranscodeOptions) */
export interface TranscodeOp {
  op: "transcode";
  codec?: string;
  preset?: string;
  crf?: number;
  audio_codec?: string;
  audio_bitrate?: string | null;
  movflags?: string | null;
  target_size_mb?: number | null;
  scale?: string | null;
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

/** Download from YouTube */
export interface DownloadFromYouTubeOp {
  op: "download_from_youtube";
  quality?: string | null;
  format?: string | null;
  audio_only?: boolean;
}

/** Single operation in the pipeline (discriminated by op) */
export type VideoOperation =
  | TrimOp
  | KaraokeOp
  | TextSequenceOp
  | TextOp
  | SpeedOp
  | WatermarkOp
  | AudioOp
  | BackgroundColorOp
  | TranscodeOp
  | CompressOp
  | ConcatOp
  | ExtractAudioOp
  | GifOp
  | DownloadFromYouTubeOp;

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

export const defaultKaraokeOp: KaraokeOp = {
  op: "karaoke",
  sentence: "",
  start_sec: 0,
  end_sec: -1,
  fontsize: 60,
  x: "(w-text_w)/2",
  y: "h-200",
  fontcolor: "white",
  highlight_fontcolor: "yellow",
  boxcolor: "black@1.0",
  boxborderw: 12,
};

export const defaultTextSequenceOp: TextSequenceOp = {
  op: "textSequence",
  items: [
    {
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
    },
  ],
};

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

export const defaultDownloadFromYouTubeOp: DownloadFromYouTubeOp = {
  op: "download_from_youtube",
  quality: "best",
  format: null,
  audio_only: false,
};
