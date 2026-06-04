// Shared video URL helpers.
//
// Cloudinary stores videos with the moov atom at the END of the file. Browsers
// then have to download the WHOLE file before playback starts — a short ~20s
// clip finishes fast and plays, but a 1–2 minute clip never finishes buffering
// and shows a BLACK screen. Inserting `fl_faststart` re-muxes with the moov atom
// at the FRONT (progressive/streaming playback), and `vc_h264,f_mp4` guarantees
// a universally-supported codec/container. The video feed applies the same
// transform server-side; every other player that renders a Cloudinary boost or
// listing video MUST run its URL through this helper or long videos break.
export function toStreamingVideoUrl(url: string): string {
  if (
    url.includes("res.cloudinary.com") &&
    url.includes("/video/upload/") &&
    !url.includes("fl_faststart")
  ) {
    return url.replace("/video/upload/", "/video/upload/fl_faststart,vc_h264,f_mp4/");
  }
  return url;
}
