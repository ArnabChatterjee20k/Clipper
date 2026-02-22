/**
 * Composable edit session state: current media URL and display name, plus operations.
 * Builds a VideoEditRequest for submit; media is always the presigned URL for the backend.
 */

import { useState, useCallback, useMemo } from "react";
import type { VideoOperation, VideoEditRequest } from "@/types/edit-session";
import {
  defaultTrimOp,
  defaultKaraokeOp,
  defaultTextSequenceOp,
  defaultTextSegment,
  defaultSpeedOp,
  defaultWatermarkOp,
  defaultAudioOp,
  defaultBackgroundColorOp,
  defaultTranscodeOp,
  defaultCompressOp,
  defaultConcatOp,
  defaultExtractAudioOp,
  defaultGifOp,
  defaultDownloadFromYouTubeOp,
  defaultConvertToPlatformOp,
} from "@/types/edit-session";

export interface EditSessionState {
  /** Presigned URL for the selected file (sent to API). */
  media: string;
  /** Human-readable name for UI (e.g. filename). */
  mediaDisplayName: string;
  /** Operations in order (trim, text, speed, etc.) */
  operations: VideoOperation[];
}

const initialState: EditSessionState = {
  media: "",
  mediaDisplayName: "",
  operations: [],
};

export function useEditSession() {
  const [state, setState] = useState<EditSessionState>(initialState);

  /** Set selected media. Pass URL (for API) and optional display name (for UI). */
  const setMedia = useCallback((url: string, displayName?: string) => {
    setState((s) => ({
      ...s,
      media: url,
      mediaDisplayName: displayName ?? url.split("/").pop() ?? "",
    }));
  }, []);

  const addOperation = useCallback((op: VideoOperation) => {
    setState((s) => ({ ...s, operations: [...s.operations, op] }));
  }, []);

  const removeOperation = useCallback((index: number) => {
    setState((s) => ({
      ...s,
      operations: s.operations.filter((_, i) => i !== index),
    }));
  }, []);

  const updateOperation = useCallback((index: number, op: VideoOperation) => {
    setState((s) => {
      const next = [...s.operations];
      next[index] = op;
      return { ...s, operations: next };
    });
  }, []);

  const clearSession = useCallback(() => {
    setState(initialState);
  }, []);

  /** Build request body for POST /edits. Requires media to be set. */
  const toRequest = useMemo((): VideoEditRequest | null => {
    if (!state.media.trim()) return null;
    return {
      media: state.media,
      operations: state.operations as VideoEditRequest["operations"],
    };
  }, [state.media, state.operations]);

  const canSubmit = toRequest !== null;

  return {
    media: state.media,
    mediaDisplayName: state.mediaDisplayName,
    operations: state.operations,
    setMedia,
    addOperation,
    removeOperation,
    updateOperation,
    clearSession,
    toRequest,
    canSubmit,
    /** Helpers that add with defaults */
    addTrim: () => addOperation(defaultTrimOp),
    addKaraoke: () => addOperation(defaultKaraokeOp),
    addTextSequence: () => addOperation(defaultTextSequenceOp),
    addText: () => addOperation({ op: "text", segment: [defaultTextSegment()] }),
    addSpeed: (speed = 1) => addOperation(defaultSpeedOp(speed)),
    addWatermark: () => addOperation(defaultWatermarkOp),
    addAudio: () => addOperation(defaultAudioOp),
    addBackgroundColor: () => addOperation(defaultBackgroundColorOp),
    addTranscode: () => addOperation(defaultTranscodeOp),
    addCompress: () => addOperation(defaultCompressOp),
    addConcat: () => addOperation(defaultConcatOp),
    addExtractAudio: () => addOperation(defaultExtractAudioOp),
    addGif: () => addOperation(defaultGifOp),
    addDownloadFromYouTube: () => addOperation(defaultDownloadFromYouTubeOp),
    addConvertToPlatform: () => addOperation(defaultConvertToPlatformOp),
  };
}
