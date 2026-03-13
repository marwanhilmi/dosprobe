export function toHex(buf: Buffer): string {
  return buf.toString('hex');
}

export function fromHex(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

export function hexDump(buf: Buffer, bytesPerLine = 16): string {
  const lines: string[] = [];
  for (let offset = 0; offset < buf.length; offset += bytesPerLine) {
    const slice = buf.subarray(offset, offset + bytesPerLine);
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    const ascii = Array.from(slice)
      .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'))
      .join('');
    lines.push(
      `${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(bytesPerLine * 3 - 1)}  ${ascii}`,
    );
  }
  return lines.join('\n');
}
