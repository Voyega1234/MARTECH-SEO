export function splitSeedCsv(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripSpaces(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function scriptsDiffer(a: string, b: string): boolean {
  const thaiA = /[\u0E00-\u0E7F]/.test(a);
  const thaiB = /[\u0E00-\u0E7F]/.test(b);
  const latinA = /[A-Za-z]/.test(a);
  const latinB = /[A-Za-z]/.test(b);
  return (thaiA && latinB) || (latinA && thaiB);
}

export function dedupeAndValidateSeeds(rawSeeds: string[]): string[] {
  const unique: string[] = [];

  for (const rawSeed of rawSeeds) {
    const seed = rawSeed.trim();
    if (!seed) continue;
    if (unique.some((item) => item.toLowerCase() === seed.toLowerCase())) continue;
    unique.push(seed);
  }

  return unique.filter((seedA, indexA) => {
    const normalizedA = stripSpaces(seedA);
    return !unique.some((seedB, indexB) => {
      if (indexA === indexB) return false;
      if (scriptsDiffer(seedA, seedB)) return false;
      const normalizedB = stripSpaces(seedB);
      return normalizedA !== normalizedB && normalizedA.includes(normalizedB);
    });
  });
}

export function parseAndValidateSeedOutput(text: string): string[] {
  return dedupeAndValidateSeeds(splitSeedCsv(text));
}
