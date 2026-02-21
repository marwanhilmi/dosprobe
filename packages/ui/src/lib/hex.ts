export function toHex8(value: number): string {
  return (value & 0xff).toString(16).padStart(2, '0');
}

export function toHex16(value: number): string {
  return (value & 0xffff).toString(16).padStart(4, '0');
}

export function toHex32(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}

export interface HexLine {
  offset: number;
  hex: string[];
  ascii: string;
}

export function hexDump(data: Uint8Array, bytesPerLine = 16): HexLine[] {
  const lines: HexLine[] = [];
  for (let i = 0; i < data.length; i += bytesPerLine) {
    const slice = data.subarray(i, Math.min(i + bytesPerLine, data.length));
    const hex: string[] = [];
    let ascii = '';
    for (let j = 0; j < slice.length; j++) {
      hex.push(toHex8(slice[j]));
      ascii += slice[j] >= 0x20 && slice[j] < 0x7f ? String.fromCharCode(slice[j]) : '.';
    }
    lines.push({ offset: i, hex, ascii });
  }
  return lines;
}
