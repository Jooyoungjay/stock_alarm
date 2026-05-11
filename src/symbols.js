const koreanNameAliases = new Map([
  ['두산퓨얼셀', '336260'],
  ['두산퓨어셀', '336260']
]);

export function normalizeSymbolInput(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return '';
  }

  const compact = raw.replace(/\s+/g, '');
  const koreanCodeMatch = compact.match(/(\d{6})(?:\.(KS|KQ))?/i);

  if (koreanCodeMatch) {
    return koreanCodeMatch[2]
      ? `${koreanCodeMatch[1]}.${koreanCodeMatch[2].toUpperCase()}`
      : koreanCodeMatch[1];
  }

  const alias = koreanNameAliases.get(compact);

  if (alias) {
    return alias;
  }

  return raw.toUpperCase();
}
