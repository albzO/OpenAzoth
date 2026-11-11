/** Decode GIF/PNG/JPG/WebP into composited frames with durations (browser only). */
import { clampMs, drawPlaced, sampleFrames, toLevels, type GreyFrame, type Placement } from './gray4';
import { MAX_FRAMES, OLED_H, OLED_W } from '../devices/azoth/oled';

export interface DecodedFrame {
  bitmap: ImageBitmap;
  ms: number;
}
export interface DecodedImage {
  frames: DecodedFrame[];
  animated: boolean;
}

export async function decodeImage(blob: Blob): Promise<DecodedImage> {
  const type = blob.type;
  if ('ImageDecoder' in window && /gif|webp|png/.test(type)) {
    const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type });
    await dec.tracks.ready;
    await dec.completed;
    const n = dec.tracks.selectedTrack?.frameCount ?? 1;
    const frames: DecodedFrame[] = [];
    for (let i = 0; i < n; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      frames.push({ bitmap: await createImageBitmap(image), ms: Math.round((image.duration ?? 0) / 1000) || 100 });
      image.close();
    }
    dec.close();
    return { frames, animated: n > 1 };
  }
  return { frames: [{ bitmap: await createImageBitmap(blob), ms: 1000 }], animated: false };
}

export interface ConvertOptions {
  placement: Placement;
  invert: boolean;
  gamma: number;
}

/** Scale/fit every frame to 208×64 and convert to 16-level grey (≤ 196 frames). */
export function toGreyFrames(img: DecodedImage, opts: ConvertOptions): GreyFrame[] {
  const canvas = new OffscreenCanvas(OLED_W, OLED_H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return sampleFrames(img.frames, MAX_FRAMES).map((f) => {
    drawPlaced(ctx, f.bitmap, opts.placement);
    const px = ctx.getImageData(0, 0, OLED_W, OLED_H).data;
    return { levels: toLevels(px, OLED_W * OLED_H, opts.invert, opts.gamma), ms: clampMs(f.ms) };
  });
}
