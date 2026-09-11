export interface VideoProbeStream {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  pix_fmt?: string;
  field_order?: string;
  width?: number;
  height?: number;
  level?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  sample_aspect_ratio?: string;
  bit_rate?: string;
  channels?: number;
  sample_rate?: string;
  color_transfer?: string;
  color_primaries?: string;
  tags?: { rotate?: string };
  side_data_list?: Array<{ rotation?: number; side_data_type?: string }>;
}

function frameRate(value?: string): number {
  const [numerator, denominator = "1"] = (value ?? "").split("/").map(Number);
  return Number(numerator) / Number(denominator);
}

/** Missing/ambiguous metadata takes the existing transcode path, not a guess. */
export function canCopyVideo(streams: VideoProbeStream[]): boolean {
  const video = streams.filter(s => s.codec_type === "video");
  const audio = streams.filter(s => s.codec_type === "audio");
  if (video.length !== 1 || audio.length !== 1) return false;
  const v = video[0], a = audio[0];
  return v.codec_name === "h264" &&
    ["Baseline", "Constrained Baseline", "Main", "High"].includes(v.profile ?? "") &&
    v.pix_fmt === "yuv420p" &&
    v.field_order === "progressive" &&
    [v.width, v.height].every(n => Number.isInteger(n) && n! >= 2 && n! <= 1280 && n! % 2 === 0) &&
    Number(v.level) > 0 && Number(v.level) <= 41 &&
    [v.avg_frame_rate, v.r_frame_rate].every(rate => frameRate(rate) > 0 && frameRate(rate) <= 30) &&
    v.sample_aspect_ratio === "1:1" &&
    Number(v.bit_rate) > 0 && Number(v.bit_rate) <= 4_000_000 &&
    (!v.color_transfer || ["bt709", "unknown"].includes(v.color_transfer)) &&
    (!v.color_primaries || ["bt709", "unknown"].includes(v.color_primaries)) &&
    (!v.tags?.rotate || Number(v.tags.rotate) === 0) &&
    !(v.side_data_list ?? []).some(s => s.side_data_type === "Display Matrix" || s.rotation !== undefined) &&
    a.codec_name === "aac" && a.profile === "LC" &&
    Number(a.channels) >= 1 && Number(a.channels) <= 2 &&
    [44100, 48000].includes(Number(a.sample_rate));
}