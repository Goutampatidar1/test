/** Max reel length in seconds (1 minute). */
export const VIDEO_MAX_DURATION_SECONDS = 60;

/**
 * Read duration of a local video File via HTML5 metadata.
 * @param {File} file
 * @returns {Promise<number>} duration in seconds
 */
export function getVideoDurationSeconds(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) {
      reject(new Error("Invalid video file"));
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };

    video.onloadedmetadata = () => {
      const duration = Number(video.duration);
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Could not read video duration"));
        return;
      }
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Could not read video duration"));
    };
    video.src = url;
  });
}

export async function assertVideoMaxDuration(file, maxSeconds = VIDEO_MAX_DURATION_SECONDS) {
  const duration = await getVideoDurationSeconds(file);
  if (duration > maxSeconds) {
    const err = new Error(`Video must be ${maxSeconds} seconds or less.`);
    err.code = "VIDEO_TOO_LONG";
    err.duration = duration;
    throw err;
  }
  return duration;
}
