export const symbolCatalog = Object.freeze([
  {
    symbol: '005930',
    name: '삼성전자',
    market: 'KOSPI',
    aliases: ['삼성', '삼성 전자', 'Samsung Electronics']
  },
  {
    symbol: '000660',
    name: 'SK하이닉스',
    market: 'KOSPI',
    aliases: ['하이닉스', 'SK Hynix']
  },
  {
    symbol: '035720',
    name: '카카오',
    market: 'KOSPI',
    aliases: ['Kakao']
  },
  {
    symbol: '336260',
    name: '두산퓨얼셀',
    market: 'KOSPI',
    aliases: ['두산 퓨얼셀', '두산퓨어셀', '두산 퓨어셀', 'Doosan Fuelcell', 'Doosan Fuel Cell']
  },
  {
    symbol: '33626L',
    name: '두산퓨얼셀우선주',
    market: 'KOSPI',
    aliases: [
      '두산퓨얼셀 우선주',
      '두산퓨얼셀우',
      '두산퓨얼셀2우B',
      '두산 퓨얼셀 우선주',
      'Doosan Fuel Cell Preferred'
    ]
  },
  {
    symbol: 'AAPL',
    name: 'Apple',
    market: 'NASDAQ',
    aliases: ['애플', 'Apple Inc']
  },
  {
    symbol: 'TSLA',
    name: 'Tesla',
    market: 'NASDAQ',
    aliases: ['테슬라', 'Tesla Inc']
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA',
    market: 'NASDAQ',
    aliases: ['엔비디아', 'Nvidia Corporation']
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft',
    market: 'NASDAQ',
    aliases: ['마이크로소프트']
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet',
    market: 'NASDAQ',
    aliases: ['구글', 'Google']
  },
  {
    symbol: 'AMZN',
    name: 'Amazon',
    market: 'NASDAQ',
    aliases: ['아마존']
  }
]);

const symbolAliases = new Map(
  symbolCatalog.flatMap((item) =>
    [item.symbol, item.name, ...(item.aliases || [])].map((alias) => [
      normalizeSearchValue(alias),
      item.symbol
    ])
  )
);

export function normalizeSymbolInput(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return '';
  }

  const compact = raw.replace(/\s+/g, '');
  const koreanCodeMatch = compact.match(/(\d{5}[0-9A-Z])(?:\.(KS|KQ))?/i);

  if (koreanCodeMatch) {
    return koreanCodeMatch[2]
      ? `${koreanCodeMatch[1]}.${koreanCodeMatch[2].toUpperCase()}`
      : koreanCodeMatch[1];
  }

  const alias = symbolAliases.get(normalizeSearchValue(compact));

  if (alias) {
    return alias;
  }

  return raw.toUpperCase();
}

export function searchSymbols(query, limit = 8) {
  const raw = String(query || '').trim();

  if (!raw) {
    return [];
  }

  const normalizedQuery = normalizeSearchValue(raw);
  const upperQuery = raw.toUpperCase();

  return symbolCatalog
    .map((item, index) => {
      const fields = [item.symbol, item.name, item.market, ...(item.aliases || [])];
      const score = getSymbolSearchScore(fields, normalizedQuery, upperQuery);

      if (score === null) {
        return null;
      }

      return {
        index,
        score,
        symbol: item.symbol,
        name: item.name,
        market: item.market
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map(({ symbol, name, market }) => ({ symbol, name, market }));
}

function getSymbolSearchScore(fields, normalizedQuery, upperQuery) {
  let bestScore = null;

  for (const field of fields) {
    const normalizedField = normalizeSearchValue(field);
    const upperField = String(field || '').toUpperCase();
    let score = null;

    if (upperField === upperQuery || normalizedField === normalizedQuery) {
      score = 0;
    } else if (upperField.startsWith(upperQuery) || normalizedField.startsWith(normalizedQuery)) {
      score = 1;
    } else if (upperField.includes(upperQuery) || normalizedField.includes(normalizedQuery)) {
      score = 2;
    }

    if (score !== null && (bestScore === null || score < bestScore)) {
      bestScore = score;
    }
  }

  return bestScore;
}

function normalizeSearchValue(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}
