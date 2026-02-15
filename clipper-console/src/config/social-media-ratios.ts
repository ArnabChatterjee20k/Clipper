/**
 * Social media aspect ratios and scale presets for transcode/compress.
 * Use as easy presets for the scale option (FFmpeg scale=W:H).
 */

export interface SocialMediaRatio {
  ratio: string;
  scale: string;
}

export const SOCIAL_MEDIA_RATIOS: Record<string, SocialMediaRatio> = {
  // Vertical Short Form
  REELS: {
    ratio: "9:16",
    scale: "1080:1920",
  },
  TIKTOK: {
    ratio: "9:16",
    scale: "1080:1920",
  },
  YOUTUBE_SHORTS: {
    ratio: "9:16",
    scale: "1080:1920",
  },
  STORIES: {
    ratio: "9:16",
    scale: "1080:1920",
  },

  // Square Feed
  INSTAGRAM_SQUARE: {
    ratio: "1:1",
    scale: "1080:1080",
  },
  FACEBOOK_SQUARE: {
    ratio: "1:1",
    scale: "1080:1080",
  },
  X_SQUARE: {
    ratio: "1:1",
    scale: "1080:1080",
  },

  // Portrait Feed
  INSTAGRAM_PORTRAIT: {
    ratio: "4:5",
    scale: "1080:1350",
  },

  // Landscape
  YOUTUBE: {
    ratio: "16:9",
    scale: "1920:1080",
  },
  X_LANDSCAPE: {
    ratio: "16:9",
    scale: "1280:720",
  },
  FACEBOOK_LANDSCAPE: {
    ratio: "16:9",
    scale: "1920:1080",
  },
  LINKEDIN: {
    ratio: "16:9",
    scale: "1920:1080",
  },
};

/** Human-readable labels for the scale presets (for dropdown) */
export const SOCIAL_MEDIA_SCALE_LABELS: Record<string, string> = {
  REELS: "Reels (9:16)",
  TIKTOK: "TikTok (9:16)",
  YOUTUBE_SHORTS: "YouTube Shorts (9:16)",
  STORIES: "Stories (9:16)",
  INSTAGRAM_SQUARE: "Instagram Square (1:1)",
  FACEBOOK_SQUARE: "Facebook Square (1:1)",
  X_SQUARE: "X Square (1:1)",
  INSTAGRAM_PORTRAIT: "Instagram Portrait (4:5)",
  YOUTUBE: "YouTube (16:9)",
  X_LANDSCAPE: "X Landscape (16:9)",
  FACEBOOK_LANDSCAPE: "Facebook Landscape (16:9)",
  LINKEDIN: "LinkedIn (16:9)",
};

/** Option value for custom scale (user types their own) */
export const CUSTOM_SCALE_KEY = "__custom__";
