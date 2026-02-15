/**
 * Preset x,y positions for text overlay (FFmpeg drawtext expressions).
 * Use as easy presets in the text overlay editor.
 */

export interface TextPosition {
  x: string;
  y: string;
}

export const TEXT_POSITIONS: Record<string, TextPosition> = {
  // Corners
  TOP_LEFT: { x: "20", y: "20" },
  TOP_RIGHT: { x: "w-text_w-20", y: "20" },
  BOTTOM_LEFT: { x: "20", y: "h-text_h-20" },
  BOTTOM_RIGHT: { x: "w-text_w-20", y: "h-text_h-20" },

  // Center
  CENTER: { x: "(w-text_w)/2", y: "(h-text_h)/2" },
  CENTER_TOP: { x: "(w-text_w)/2", y: "40" },
  CENTER_BOTTOM: { x: "(w-text_w)/2", y: "h-text_h-40" },

  // Safe Zones (better for captions / reels)
  SAFE_BOTTOM: { x: "(w-text_w)/2", y: "h-text_h-120" },
  SAFE_TOP: { x: "(w-text_w)/2", y: "100" },

  // Story Style
  STORY_CAPTION: { x: "(w-text_w)/2", y: "h*0.75" },
  LOWER_THIRD: { x: "(w-text_w)/2", y: "h*0.65" },

  // Floating
  LEFT_MID: { x: "40", y: "(h-text_h)/2" },
  RIGHT_MID: { x: "w-text_w-40", y: "(h-text_h)/2" },
};

/** Human-readable labels for the position presets (for dropdown) */
export const TEXT_POSITION_LABELS: Record<string, string> = {
  TOP_LEFT: "Top left",
  TOP_RIGHT: "Top right",
  BOTTOM_LEFT: "Bottom left",
  BOTTOM_RIGHT: "Bottom right",
  CENTER: "Center",
  CENTER_TOP: "Center top",
  CENTER_BOTTOM: "Center bottom",
  SAFE_BOTTOM: "Safe bottom (captions)",
  SAFE_TOP: "Safe top",
  STORY_CAPTION: "Story caption",
  LOWER_THIRD: "Lower third",
  LEFT_MID: "Left middle",
  RIGHT_MID: "Right middle",
};

/** Option value for "custom" so user can still type x,y manually */
export const CUSTOM_POSITION_KEY = "__custom__";
