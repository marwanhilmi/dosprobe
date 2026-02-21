/**
 * Parse a binary PPM (P6) image into an ImageData object suitable for canvas rendering.
 */
export function parsePPM(buffer: ArrayBuffer): ImageData {
  const bytes = new Uint8Array(buffer);
  let pos = 0;

  function skipWhitespace() {
    while (pos < bytes.length) {
      // Skip comments
      if (bytes[pos] === 0x23 /* # */) {
        while (pos < bytes.length && bytes[pos] !== 0x0a) pos++;
        pos++; // skip newline
        continue;
      }
      if (bytes[pos] <= 0x20) {
        pos++;
        continue;
      }
      break;
    }
  }

  function readToken(): string {
    skipWhitespace();
    let token = '';
    while (pos < bytes.length && bytes[pos] > 0x20) {
      token += String.fromCharCode(bytes[pos]);
      pos++;
    }
    return token;
  }

  const magic = readToken();
  if (magic !== 'P6') {
    throw new Error(`Unsupported PPM format: ${magic}`);
  }

  const width = parseInt(readToken(), 10);
  const height = parseInt(readToken(), 10);
  const maxVal = parseInt(readToken(), 10);

  if (isNaN(width) || isNaN(height) || isNaN(maxVal)) {
    throw new Error('Invalid PPM header');
  }

  // Skip single whitespace after maxval
  pos++;

  const imageData = new ImageData(width, height);
  const pixels = imageData.data;
  const scale = maxVal === 255 ? 1 : 255 / maxVal;

  for (let i = 0; i < width * height; i++) {
    const r = bytes[pos++];
    const g = bytes[pos++];
    const b = bytes[pos++];
    const pi = i * 4;
    pixels[pi] = Math.round(r * scale);
    pixels[pi + 1] = Math.round(g * scale);
    pixels[pi + 2] = Math.round(b * scale);
    pixels[pi + 3] = 255;
  }

  return imageData;
}

/**
 * Convert ImageData to a blob URL for use in <img> tags.
 */
export function imageDataToBlobUrl(imageData: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);

  // Synchronously get a data URL (faster than async toBlob for small images)
  return canvas.toDataURL('image/png');
}
