export interface FileChangePreviewGlyphs {
  pendingStatus: string;
  completedStatus: string;
  scrollUp: string;
  scrollThumb: string;
  scrollTrack: string;
  scrollDown: string;
  cappedPrefix: string;
  separator: string;
}

export const unicodeFileChangePreviewGlyphs: FileChangePreviewGlyphs = {
  pendingStatus: "\u25cf",
  completedStatus: "\u2714",
  scrollUp: "\u25b2",
  scrollThumb: "\u2588",
  scrollTrack: "\u2591",
  scrollDown: "\u25bc",
  cappedPrefix: "\u21b3",
  separator: "\u00b7",
};
