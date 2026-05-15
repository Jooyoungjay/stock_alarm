import { config } from '../src/config.js';
import { fetchHistoricalHighSince } from '../src/priceProvider.js';

const [symbol, startDate, endDate] = process.argv.slice(2);

if (!symbol || !startDate) {
  console.error('사용법: node scripts/check-publicdata-price.js <종목코드> <시작일> [종료일]');
  console.error('예시: node scripts/check-publicdata-price.js 005930 2026-05-01 2026-05-15');
  process.exit(1);
}

const attempts = [];

try {
  const result = await fetchHistoricalHighSince(symbol, startDate, {
    providers: 'publicdata',
    endDate: endDate || new Date(),
    timeoutMs: config.quoteTimeoutMs,
    dataGoKrServiceKey: config.dataGoKrServiceKey,
    onProviderAttempt: (attempt) => attempts.push(attempt)
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        result,
        attempts
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error.message,
        attempts
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}
