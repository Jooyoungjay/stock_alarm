const state = {
  stocks: [],
  alerts: [],
  loading: false
};

const elements = {
  form: document.querySelector('#stockForm'),
  stockList: document.querySelector('#stockList'),
  alertList: document.querySelector('#alertList'),
  message: document.querySelector('#message'),
  summaryText: document.querySelector('#summaryText'),
  telegramStatus: document.querySelector('#telegramStatus'),
  pollStatus: document.querySelector('#pollStatus'),
  checkNowButton: document.querySelector('#checkNowButton'),
  testTelegramButton: document.querySelector('#testTelegramButton')
};

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
    elements.form.thresholdPercent.value = 5;
    elements.form.alertCooldownMinutes.value = 30;
    showMessage('종목을 등록했습니다.');
    await loadData();
  });
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

function renderStatus(data) {
  elements.telegramStatus.textContent = data.telegramConfigured ? 'Telegram 연결됨' : 'Telegram 미설정';
  elements.telegramStatus.className = `status-pill ${data.telegramConfigured ? 'ok' : 'warn'}`;
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
      const isTriggered = thresholdPrice !== null && Number(stock.lastPrice) <= thresholdPrice;

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
      `;

      const actions = document.createElement('div');
      actions.className = 'stock-actions';
      actions.append(
        actionButton(stock.active ? '중지' : '재개', 'text-button', () =>
          patchStock(stock.id, { active: !stock.active })
        ),
        actionButton('최고가 초기화', 'secondary-button', () =>
          patchStock(stock.id, { resetHighPrice: true })
        ),
        actionButton('삭제', 'danger-button', () => deleteStock(stock.id))
      );
      row.append(actions);
      return row;
    })
  );
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
  const high = Number(highPrice);
  const threshold = Number(thresholdPercent);

  if (!Number.isFinite(high) || !Number.isFinite(threshold)) {
    return null;
  }

  return high * (1 - threshold / 100);
}

function calculateDrawdown(highPrice, lastPrice) {
  const high = Number(highPrice);
  const last = Number(lastPrice);

  if (!Number.isFinite(high) || high <= 0 || !Number.isFinite(last)) {
    return 0;
  }

  return Math.max(0, ((high - last) / high) * 100);
}

function formatMoney(value, currency) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
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
