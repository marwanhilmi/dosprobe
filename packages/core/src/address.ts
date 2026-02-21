import type { DosAddress, SegOff } from './types.ts';

export function segOffToLinear(seg: number, off: number): number {
  return ((seg & 0xffff) << 4) + (off & 0xffff);
}

export function linearToSegOff(linear: number): SegOff {
  return {
    segment: (linear >> 4) & 0xffff,
    offset: linear & 0x000f,
  };
}

export function parseAddress(input: string): DosAddress {
  if (input.includes(':')) {
    const [segStr, offStr] = input.split(':');
    const segment = parseInt(segStr!, 16);
    const offset = parseInt(offStr!, 16);
    return {
      linear: segOffToLinear(segment, offset),
      segOff: { segment, offset },
    };
  }
  const linear = input.startsWith('0x') || input.startsWith('0X')
    ? parseInt(input, 16)
    : parseInt(input, 10);
  return {
    linear,
    segOff: linearToSegOff(linear),
  };
}

export function formatSegOff(seg: number, off: number): string {
  return `${seg.toString(16).toUpperCase().padStart(4, '0')}:${off.toString(16).toUpperCase().padStart(4, '0')}`;
}
