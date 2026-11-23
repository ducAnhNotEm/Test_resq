export const normalizeVietnamPhone = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const compact = value.trim().replace(/[\s().-]/g, '');
  const normalized = compact.startsWith('+84') ? `0${compact.slice(3)}` : compact;
  return /^0\d{9}$/.test(normalized) ? normalized : null;
};
