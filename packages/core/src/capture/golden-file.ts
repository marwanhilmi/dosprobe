import { readFileSync, existsSync } from 'node:fs';
import { sha256 } from '@dosprobe/shared';

export interface GoldenComparison {
  match: boolean;
  goldenChecksum: string;
  actualChecksum: string;
  firstDiffOffset?: number;
  goldenByte?: number;
  actualByte?: number;
}

export function compareWithGolden(
  goldenPath: string,
  actualData: Buffer,
): GoldenComparison {
  if (!existsSync(goldenPath)) {
    return {
      match: false,
      goldenChecksum: '',
      actualChecksum: sha256(actualData),
    };
  }

  const goldenData = readFileSync(goldenPath);
  const goldenChecksum = sha256(goldenData);
  const actualChecksum = sha256(actualData);

  if (goldenChecksum === actualChecksum) {
    return { match: true, goldenChecksum, actualChecksum };
  }

  // Find first difference
  const len = Math.min(goldenData.length, actualData.length);
  for (let i = 0; i < len; i++) {
    if (goldenData[i] !== actualData[i]) {
      return {
        match: false,
        goldenChecksum,
        actualChecksum,
        firstDiffOffset: i,
        goldenByte: goldenData[i],
        actualByte: actualData[i],
      };
    }
  }

  // Lengths differ
  return {
    match: false,
    goldenChecksum,
    actualChecksum,
    firstDiffOffset: len,
  };
}
