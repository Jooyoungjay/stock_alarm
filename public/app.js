const state = {
  stocks: [],
  alerts: [],
  loading: false,
  editingStockId: null
};

const elements = {
  form: document.querySelector('#stockForm'),
  stockList: document.querySelector('#stockList'),
  alertList: document.querySelector('#alertList'),
  message: document.querySelector('#message'),
  summaryText: document.querySelector('#summaryText'),
  telegramStatus: document.querySelector('#telegramStatus'),
  quoteStatus: document.querySelector('#quoteStatus'),
  pollStatus: document.querySelector('#pollStatus'),
  quotePreview: document.querySelector('#quotePreview'),
  symbolSuggestions: document.querySelector('#symbolSuggestions'),
  previewQuoteButton: document.querySelector('#previewQuoteButton'),
  checkNowButton: document.querySelector('#checkNowButton'),
  testTelegramButton: document.querySelector('#testTelegramButton')
};

let symbolSearchTimer = null;
let symbolSearchRequestId = 0;

document.querySelectorAll('.symbol-helper button').forEach((button) => {
  button.addEventListener('click', () => {
    elements.form.elements.symbol.value = button.dataset.symbol || '';

    if (!elements.form.elements.displayName.value) {
      elements.form.elements.displayName.value = button.dataset.name || '';
    }

    hideSymbolSuggestions();
    renderQuotePreview(null);
  });
});

elements.form.elements.symbol.addEventListener('input', () => {
  renderQuotePreview(null);
  queueSymbolSearch(elements.form.elements.symbol.value);
});

elements.form.elements.symbol.addEventListener('focus', () => {
  queueSymbolSearch(elements.form.elements.symbol.value);
});

document.addEventListener('click', (event) => {
  if (
    event.target !== elements.form.elements.symbol &&
    !elements.symbolSuggestions.contains(event.target)
  ) {
    hideSymbolSuggestions();
  }
});

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.form);
  const payload = Object.fromEntries(formData.entries());

  payload.thresholdPercent = Number(payload.thresholdPercent);
  payload.alertCooldownMinutes = Number(payload.alertCooldownMinutes);

  await withBusy(elements.form.querySelector('button[type="submit"]'), async () => {
    await api('/api/stocks', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    elements.form.reset();
    elements.form.elements.thresholdPercent.value = 5;
    elements.form.elements.alertCooldownMinutes.value = 30;
    hideSymbolSuggestions();
    renderQuotePreview(null);
    showMessage('종목을 등록했습니다.');
    await loadData();
  });
});

elements.previewQuoteButton.addEventListener('click', async () => {
  await previewQuote(elements.previewQuoteButton);
});

elements.checkNowButton.addEventListener('click', async () => {
  await withBusy(elements.checkNowButton, async () => {
    const result = await api('/api/check-now', { method: 'POST' });
    const checked = result.results?.length || 0;
    showMessage(`${checked}개 종목을 확인했습니다.`);
    await loadData();
  });
});

elements.testTelegramButton.addEventListener('click', async () => {
  await withBusy(elements.testTelegramButton, async () => {
    await api('/api/telegram/test', { method: 'POST' });
    showMessage('테스트 알림을 전송했습니다.');
  });
});

async function loadData() {
  try {
    const data = await api('/api/stocks');
    state.stocks = data.stocks || [];
    state.alerts = data.alerts || [];
    renderStatus(data);
    renderStocks();
    renderAlerts();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || '요청에 실패했습니다.');
  }

  return payload;
}

async function previewQuote(button) {
  const symbol = elements.form.elements.symbol.value.trim().toUpperCase();

  if (!symbol) {
    showMessage('종목 코드를 입력하세요.', true);
    return;
  }

  hideSymbolSuggestions();

  await withBusy(button, async () => {
    const result = await api(`/api/quote-preview?symbol=${encodeURIComponent(symbol)}`);
    const quote = result.quote;
    elements.form.elements.symbol.value = quote.symbol;

    if (
      !elements.form.elements.displayName.value &&
      quote.name &&
      quote.name !== quote.symbol
    ) {
      elements.form.elements.displayName.value = quote.name;
    }

    renderQuotePreview(quote);
  });
}

function queueSymbolSearch(query) {
  window.clearTimeout(symbolSearchTimer);
  const requestId = ++symbolSearchRequestId;

  if (!query.trim()) {
    hideSymbolSuggestions();
    return;
  }

  symbolSearchTimer = window.setTimeout(() => {
    loadSymbolSuggestions(query, requestId);
  }, 180);
}

async function loadSymbolSuggestions(query, requestId) {
  try {
    const data = await api(`/api/symbol-search?q=${encodeURIComponent(query)}`);

    if (requestId !== symbolSearchRequestId) {
      return;
    }

    renderSymbolSuggestions(data.results || []);
  } catch {
    if (requestId === symbolSearchRequestId) {
      hideSymbolSuggestions();
    }
  }
}

function renderSymbolSuggestions(results) {
  if (!results.length) {
    hideSymbolSuggestions();
    return;
  }

  const buttons = results.map((item) => {
    const button = document.createElement('button');
    const name = document.createElement('span');
    const meta = document.createElement('span');

    button.type = 'button';
    button.className = 'symbol-suggestion';
    name.className = 'symbol-suggestion-name';
    meta.className = 'symbol-suggestion-meta';
    name.textContent = item.name;
    meta.textContent = `${item.symbol} · ${item.market}`;
    button.append(name, meta);
    button.addEventListener('click', () => selectSymbolSuggestion(item));

    return button;
  });

  elements.symbolSuggestions.replaceChildren(...buttons);
  elements.symbolSuggestions.className = 'symbol-suggestions show';
}

function selectSymbolSuggestion(item) {
  elements.form.elements.symbol.value = item.symbol;

  if (!elements.form.elements.displayName.value.trim()) {
    elements.form.elements.displayName.value = item.name;
  }

  hideSymbolSuggestions();
  renderQuotePreview(null);
  elements.form.elements.symbol.focus();
}

function hideSymbolSuggestions() {
  symbolSearchRequestId += 1;
  window.clearTimeout(symbolSearchTimer);
  elements.symbolSuggestions.className = 'symbol-suggestions';
  elements.symbolSuggestions.replaceChildren();
}

async function withBusy(button, callback) {
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = '처리 중';

  try {
    await callback();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

function renderQuotePreview(quote) {
  if (!quote) {
    elements.quotePreview.className = 'quote-preview';
    elements.quotePreview.textContent = '';
    return;
  }

  elements.quotePreview.className = 'quote-preview show';
  elements.quotePreview.innerHTML = `
    <span class="quote-preview-name">${escapeHtml(quote.name || quote.symbol)}</span>
    <span>${escapeHtml(quote.symbol)}</span>
    <span>${formatMoney(quote.price, quote.currency)}</span>
    <span>${getProviderLabel(quote.provider)}</span>
  `;
}

function renderStatus(data) {
  elements.telegramStatus.textContent = data.telegramConfigured ? 'Telegram 연결됨' : 'Telegram 미설정';
  elements.telegramStatus.className = `status-pill ${data.telegramConfigured ? 'ok' : 'warn'}`;
  elements.quoteStatus.textContent = `시세 ${formatProviderList(data.quoteProviders)}`;
  elements.quoteStatus.className = 'status-pill muted';
  elements.pollStatus.textContent = `${data.pollIntervalSeconds || 60}초 주기`;
  elements.pollStatus.className = 'status-pill muted';
}

function renderStocks() {
  elements.summaryText.textContent = `${state.stocks.length}개 등록`;

  if (!state.stocks.length) {
    elements.stockList.innerHTML = '<div class="empty">등록된 종목이 없습니다.</div>';
    return;
  }

  elements.stockList.replaceChildren(
    ...state.stocks.map((stock) => {
      const row = document.createElement('article');
      row.className = 'stock-row';
      const drawdown = calculateDrawdown(stock.highPrice, stock.lastPrice);
      const thresholdPrice = calculateThreshold(stock.highPrice, stock.thresholdPercent);
      const lastPrice = parseFiniteNumber(stock.lastPrice);
      const isTriggered = thresholdPrice !== null && lastPrice !== null && lastPrice <= thresholdPrice;

      row.innerHTML = `
        <div class="stock-title">
          <div class="stock-name">${escapeHtml(stock.displayName || stock.symbol)}</div>
          <div class="stock-symbol">${escapeHtml(stock.symbol)} ${stock.active ? '' : '비활성'}</div>
        </div>
        <div class="metric">
          <span class="metric-label">현재가</span>
          <span class="metric-value">${formatMoney(stock.lastPrice, stock.currency)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">최고가</span>
          <span class="metric-value">${formatMoney(stock.highPrice, stock.currency)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">기준가</span>
          <span class="metric-value">${formatMoney(thresholdPrice, stock.currency)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">하락률</span>
          <span class="metric-value ${isTriggered ? 'down' : 'ok'}">-${drawdown.toFixed(2)}%</span>
        </div>
        <div class="metric status-metric">
          <span class="metric-label">상태</span>
          <span class="status-badge ${getStockStatusClass(stock)}">${getStockStatusLabel(stock)}</span>
          <span class="metric-detail">${formatLastChecked(stock.lastCheckedAt)}</span>
          ${stock.quoteProvider ? `<span class="metric-detail">시세 ${getProviderLabel(stock.quoteProvider)}</span>` : ''}
          ${stock.lastError ? `<span class="metric-error">${escapeHtml(stock.lastError)}</span>` : ''}
        </div>
      `;

      const actions = document.createElement('div');
      actions.className = 'stock-actions';
      actions.append(
        manualTestForm(stock),
        actionButton(state.editingStockId === stock.id ? '편집 닫기' : '편집', 'secondary-button', () => {
          state.editingStockId = state.editingStockId === stock.id ? null : stock.id;
          renderStocks();
        }),
        actionButton(stock.active ? '중지' : '재개', 'text-button', () =>
          patchStock(stock.id, { active: !stock.active })
        ),
        actionButton('최고가 초기화', 'secondary-button', () =>
          patchStock(stock.id, { resetHighPrice: true })
        ),
        actionButton('삭제', 'danger-button', () => deleteStock(stock.id))
      );
      row.append(actions);

      if (state.editingStockId === stock.id) {
        row.append(editStockForm(stock));
      }

      return row;
    })
  );
}

function editStockForm(stock) {
  const form = document.createElement('form');
  form.className = 'stock-edit-form';
  form.innerHTML = `
    <label>
      <span>표시 이름</span>
      <input name="displayName" value="${escapeHtml(stock.displayName || '')}" autocomplete="off" />
    </label>
    <label>
      <span>하락률 %</span>
      <input name="thresholdPercent" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" value="${escapeHtml(stock.thresholdPercent)}" required />
    </label>
    <label>
      <span>반복 분</span>
      <input name="alertCooldownMinutes" type="text" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(stock.alertCooldownMinutes)}" required />
    </label>
    <label class="edit-notes">
      <span>메모</span>
      <textarea name="notes" rows="2">${escapeHtml(stock.notes || '')}</textarea>
    </label>
    <div class="edit-actions">
      <button type="button" class="secondary-button" data-action="cancel">취소</button>
      <button type="submit" class="primary-button">저장</button>
    </div>
  `;

  form.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    state.editingStockId = null;
    renderStocks();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    payload.thresholdPercent = Number(payload.thresholdPercent);
    payload.alertCooldownMinutes = Number(payload.alertCooldownMinutes);

    await withBusy(form.querySelector('button[type="submit"]'), async () => {
      await api(`/api/stocks/${stock.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      state.editingStockId = null;
      showMessage('알림 조건을 저장했습니다.');
      await loadData();
    });
  });

  return form;
}

function manualTestForm(stock) {
  const form = document.createElement('form');
  const input = document.createElement('input');
  const button = document.createElement('button');

  form.className = 'manual-test-form';
  input.type = 'text';
  input.inputMode = 'decimal';
  input.pattern = '[0-9]*[.]?[0-9]*';
  input.placeholder = '테스트 현재가';
  input.setAttribute('aria-label', `${stock.symbol} 테스트 현재가`);

  const suggestedPrice = getSuggestedTestPrice(stock);

  if (suggestedPrice !== null) {
    input.value = String(suggestedPrice);
  }

  button.type = 'submit';
  button.className = 'secondary-button';
  button.textContent = '가격 테스트';

  form.append(input, button);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    await withBusy(button, async () => {
      const price = Number(input.value);

      if (!Number.isFinite(price) || price <= 0) {
        throw new Error('테스트 현재가를 입력하세요.');
      }

      const result = await api(`/api/stocks/${stock.id}/test-quote`, {
        method: 'POST',
        body: JSON.stringify({ price })
      });
      const stockResult = result.results?.[0];

      if (stockResult?.status === 'error') {
        throw new Error(stockResult.error || '테스트 가격 확인에 실패했습니다.');
      }

      showMessage(renderManualTestMessage(stockResult));
      await loadData();
    });
  });

  return form;
}

function renderAlerts() {
  if (!state.alerts.length) {
    elements.alertList.innerHTML = '<div class="empty">알림 기록이 없습니다.</div>';
    return;
  }

  elements.alertList.replaceChildren(
    ...state.alerts.map((alert) => {
      const row = document.createElement('article');
      row.className = 'alert-row';
      row.innerHTML = `
        <div class="metric">
          <span class="metric-label">종목</span>
          <span class="metric-value">${escapeHtml(alert.displayName || alert.symbol)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">하락률</span>
          <span class="metric-value down">-${Number(alert.drawdownPercent || 0).toFixed(2)}%</span>
        </div>
        <div class="metric">
          <span class="metric-label">전송</span>
          <span class="badge ${escapeHtml(alert.deliveryStatus)}">${renderDeliveryStatus(alert.deliveryStatus)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">시각</span>
          <span class="metric-value">${formatDate(alert.createdAt)}</span>
        </div>
      `;
      return row;
    })
  );
}

function renderManualTestMessage(result) {
  if (!result) {
    return '테스트 가격을 확인했습니다.';
  }

  const labels = {
    alert: '테스트 가격으로 알림을 보냈습니다.',
    high_updated: '테스트 가격이 새 최고가로 저장됐습니다.',
    checked: '테스트 가격을 확인했습니다. 아직 알림 기준에는 닿지 않았습니다.',
    skipped: '비활성 종목이라 테스트 확인을 건너뛰었습니다.'
  };

  return labels[result.status] || '테스트 가격을 확인했습니다.';
}

function getStockStatusLabel(stock) {
  if (!stock.active) {
    return '비활성';
  }

  const labels = {
    alert: '알림 전송',
    high_updated: '새 최고가',
    checked: '정상',
    error: '조회 실패',
    pending: '대기'
  };

  return labels[stock.lastCheckStatus] || '대기';
}

function getStockStatusClass(stock) {
  if (!stock.active) {
    return 'muted';
  }

  const classes = {
    alert: 'alert',
    high_updated: 'ok',
    checked: 'ok',
    error: 'error',
    pending: 'muted'
  };

  return classes[stock.lastCheckStatus] || 'muted';
}

function formatLastChecked(value) {
  if (!value) {
    return '확인 전';
  }

  return `마지막 확인 ${formatDate(value)}`;
}

function formatProviderList(value) {
  return String(value || '')
    .split(',')
    .map((provider) => getProviderLabel(provider.trim()))
    .filter(Boolean)
    .join(' > ');
}

function getProviderLabel(provider) {
  const labels = {
    naver: 'Naver',
    stooq: 'Stooq',
    alphavantage: 'Alpha Vantage',
    yahoo: 'Yahoo'
  };

  return labels[String(provider || '').toLowerCase()] || provider;
}

function getSuggestedTestPrice(stock) {
  const lastPrice = parseFiniteNumber(stock.lastPrice);
  const highPrice = parseFiniteNumber(stock.highPrice);

  if (lastPrice !== null && lastPrice > 0) {
    return lastPrice;
  }

  if (highPrice !== null && highPrice > 0) {
    return highPrice;
  }

  return null;
}

function actionButton(text, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.addEventListener('click', () => withBusy(button, onClick));
  return button;
}

async function patchStock(id, patch) {
  await api(`/api/stocks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  await loadData();
}

async function deleteStock(id) {
  await api(`/api/stocks/${id}`, {
    method: 'DELETE'
  });
  showMessage('종목을 삭제했습니다.');
  await loadData();
}

function showMessage(text, isError = false) {
  elements.message.textContent = text;
  elements.message.className = `message show${isError ? ' error' : ''}`;

  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => {
    elements.message.className = 'message';
  }, 4500);
}

function calculateThreshold(highPrice, thresholdPercent) {
  const high = parseFiniteNumber(highPrice);
  const threshold = Number(thresholdPercent);

  if (high === null || !Number.isFinite(threshold)) {
    return null;
  }

  return high * (1 - threshold / 100);
}

function calculateDrawdown(highPrice, lastPrice) {
  const high = parseFiniteNumber(highPrice);
  const last = parseFiniteNumber(lastPrice);

  if (high === null || high <= 0 || last === null) {
    return 0;
  }

  return Math.max(0, ((high - last) / high) * 100);
}

function formatMoney(value, currency) {
  const number = parseFiniteNumber(value);

  if (number === null) {
    return '-';
  }

  const formatted = number.toLocaleString('ko-KR', {
    maximumFractionDigits: number >= 1000 ? 0 : 2
  });

  return currency ? `${formatted} ${currency}` : formatted;
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('ko-KR');
}

function parseFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function renderDeliveryStatus(status) {
  const labels = {
    sent: '전송됨',
    failed: '실패',
    not_configured: '미설정'
  };

  return labels[status] || status || '-';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

loadData();
window.setInterval(loadData, 15000);
