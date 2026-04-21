const ANALYSIS_PAPER_RGB = { r: 248, g: 243, b: 235 };

const PRESET_ANALYSIS_COLORS: Record<string, string> = {
  study: '#5C7FA3',
  work: '#7EA3B3',
  daily: '#C68D4E',
  exercise: '#C77459',
  rest: '#7C6AA4',
  entertainment: '#9C82B1',
};

export const ANALYSIS_NEUTRAL_COLOR = '#B5A896';

export const ANALYSIS_CLUSTER_PALETTE = [
  '#5C7FA3',
  '#7EA3B3',
  '#C68D4E',
  '#C77459',
  '#7C6AA4',
  '#9C82B1',
  '#8F7F6F',
  '#B5A896',
];

const hashColorKey = (key: string): number => {
  let hash = 17;

  for (const character of key.trim().toLowerCase()) {
    hash = ((hash * 33) ^ character.charCodeAt(0)) >>> 0;
  }

  return hash;
};

type Rgb = { r: number; g: number; b: number };

const clampChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const hexToRgb = (hex: string): Rgb | null => {
  const normalized = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const rgbToHex = ({ r, g, b }: Rgb): string => {
  const toHex = (channel: number) => clampChannel(channel).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const mixRgb = (base: Rgb, target: Rgb, amount: number): Rgb => ({
  r: base.r + (target.r - base.r) * amount,
  g: base.g + (target.g - base.g) * amount,
  b: base.b + (target.b - base.b) * amount,
});

export const withAlpha = (hex: string, alpha: number): string => {
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(181, 168, 150, ${normalizedAlpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${normalizedAlpha})`;
};

export const softenAnalysisColor = (hex: string, paperMix = 0.32): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return ANALYSIS_NEUTRAL_COLOR;

  const mixed = mixRgb(rgb, ANALYSIS_PAPER_RGB, paperMix);
  return rgbToHex(mixed);
};

export const getAnalysisDisplayColor = (categoryId?: string | null, rawColor?: string | null): string => {
  if (categoryId && PRESET_ANALYSIS_COLORS[categoryId]) {
    return PRESET_ANALYSIS_COLORS[categoryId];
  }

  if (rawColor) {
    return softenAnalysisColor(rawColor);
  }

  return ANALYSIS_NEUTRAL_COLOR;
};

export const getAnalysisClusterColor = (clusterKey?: string | null, fallbackIndex = 0): string => {
  if (ANALYSIS_CLUSTER_PALETTE.length === 0) {
    return ANALYSIS_NEUTRAL_COLOR;
  }

  if (!clusterKey) {
    return ANALYSIS_CLUSTER_PALETTE[Math.abs(fallbackIndex) % ANALYSIS_CLUSTER_PALETTE.length] ?? ANALYSIS_NEUTRAL_COLOR;
  }

  return ANALYSIS_CLUSTER_PALETTE[hashColorKey(clusterKey) % ANALYSIS_CLUSTER_PALETTE.length] ?? ANALYSIS_NEUTRAL_COLOR;
};

export const getAnalysisSurfaceTint = (categoryId?: string | null, rawColor?: string | null, alpha = 0.14): string => {
  return withAlpha(getAnalysisDisplayColor(categoryId, rawColor), alpha);
};

export const getAnalysisClusterSurfaceTint = (clusterKey?: string | null, fallbackIndex = 0, alpha = 0.14): string => {
  return withAlpha(getAnalysisClusterColor(clusterKey, fallbackIndex), alpha);
};
