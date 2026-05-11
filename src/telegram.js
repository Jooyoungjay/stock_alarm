export function isTelegramConfigured(config) {
  return Boolean(config.telegramBotToken && config.telegramChatId);
}

export function formatAlertMessage(stock, quote, drawdownPercent, thresholdPrice) {
  const name = stock.displayName || quote.name || stock.symbol;
  const price = formatNumber(quote.price);
  const high = formatNumber(stock.highPrice);
  const threshold = formatNumber(thresholdPrice);
  const drawdown = drawdownPercent.toFixed(2);
  const currency = quote.currency ? ` ${quote.currency}` : '';
  const highLabel = stock.purchaseDate
    ? `구매일 이후 최고가: ${high}${currency} (${formatDateOnly(stock.highPriceAt)} 기준)`
    : `감시 최고가: ${high}${currency}`;

  return [
    `[Stock Alarm] 매도 알림`,
    `${name} (${stock.symbol})`,
    `현재가: ${price}${currency}`,
    highLabel,
    `알림 기준: ${threshold}${currency} 이하`,
    `하락률: -${drawdown}%`,
    `반복 간격: ${stock.alertCooldownMinutes}분`
  ].join('\n');
}

export async function sendTelegramMessage(config, text) {
  if (!isTelegramConfigured(config)) {
    throw new Error('텔레그램 토큰 또는 채팅방 ID가 설정되지 않았습니다.');
  }

  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text,
      disable_web_page_preview: true
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.description || `텔레그램 전송 실패: HTTP ${response.status}`);
  }

  return payload;
}

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '-';
  }

  return number.toLocaleString('ko-KR', {
    maximumFractionDigits: number >= 1000 ? 0 : 2
  });
}

function formatDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    return '-';
  }

  return `${match[1]}.${match[2]}.${match[3]}`;
}
