const state = {
  stocks: [],
  alerts: [],
  backups: [],
  health: null,
  backupRetention: 0,
  loading: false,
  editingStockId: null
};

const elements = {
  form: document.querySelector('#stockForm'),
  stockList: document.querySelector('#stockList'),
  alertList: document.querySelector('#alertList'),
  message: document.querySelector('#message'),
  backupList: document.querySelector('#backupList'),
  backupSummary: document.querySelector('#backupSummary'),
  serverStatusPanel: document.querySelector('#serverStatusPanel'),
  serverStatusSummary: document.querySelector('#serverStatusSummary'),
  summaryText: document.querySelector('#summaryText'),
  telegramStatus: document.querySelector('#telegramStatus'),
  quoteStatus: document.querySelector('#quoteStatus'),
  pollStatus: document.querySelector('#pollStatus'),
  quotePreview: document.querySelector('#quotePreview'),
  symbolSuggestions: document.querySelector('#symbolSuggestions'),
  previewQuoteButton: document.querySelector('#previewQuoteButton'),
  checkNowButton: document.querySelector('#checkNowButton'),
  testTelegramButton: document.querySelector('#testTelegramButton'),
  createBackupButton: document.querySelector('#createBackupButton'),
  refreshBackupsButton: document.querySelector('#refreshBackupsButton'),
  refreshServerStatusButton: document.querySelector('#refreshServerStatusButton'),
  tabSections: document.querySelectorAll('.tab-section'),
  mobileNavButtons: document.querySelectorAll('.nav-item')
};

let symbolSearchTimer = null;
let symbolSearchRequestId = 0;

elements.form.elements.purchaseDate.max = getTodayInputValue();
syncAlertTypeControls(elements.form);

elements.form.elements.alertType.addEventListener('change', () => {
  syncAlertTypeControls(elements.form);
  renderQuotePreview(null);
});

document.querySelectorAll('.symbol-helper button').forEach((button) => {
  button.addEventListener('click', () => {
    elements.form.elements.symbol.value = button.dataset.symbol || '';
    document.querySelectorAll('.symbol-helper button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');

    if (!elements.form.elements.displayName.value) {
      elements.form.elements.displayName.value = button.dataset.name || '';
    }

    hideSymbolSuggestions();
    renderQuotePreview(null);
  });
});

elements.mobileNavButtons.forEach((button) => {
  button.addEventListener('click', () => switchMobileTab(button.dataset.tab));
});

window.addEventListener('resize', syncResponsiveTabs);

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
  const payload = normalizeStockPayload(Object.fromEntries(formData.entries()));

  await withBusy(elements.form.querySelector('button[type="submit"]'), async () => {
    await api('/api/stocks', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    elements.form.reset();
    elements.form.elements.thresholdPercent.value = 5;
    elements.form.elements.alertCooldownMinutes.value = 30;
    syncAlertTypeControls(elements.form);
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

elements.createBackupButton.addEventListener('click', async () => {
  await withBusy(elements.createBackupButton, async () => {
    const result = await api('/api/backups', { method: 'POST' });
    state.backups = result.backups || [];
    renderBackups();

    if (result.backup?.created === false) {
      showMessage('아직 저장된 데이터가 없어 백업을 만들지 않았습니다.', true);
      return;
    }

    showMessage('현재 데이터를 백업했습니다.');
  });
});

elements.refreshBackupsButton.addEventListener('click', async () => {
  await withBusy(elements.refreshBackupsButton, loadBackups);
});

elements.refreshServerStatusButton.addEventListener('click', async () => {
  await withBusy(elements.refreshServerStatusButton, loadHealth);
});

elements.serverStatusPanel.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy]');

  if (!button) {
    return;
  }

  await copyText(button.dataset.copy);
});

async function loadHealth() {
  try {
    const health = await api('/api/health');
    state.health = health;
    renderServerStatus(health);
  } catch (error) {
    renderServerStatusError(error);
  }
}

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

async function loadBackups() {
  try {
    const data = await api('/api/backups');
    state.backups = data.backups || [];
    state.backupRetention = data.retention || 0;
    renderBackups();
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

function normalizeStockPayload(payload) {
  const normalized = { ...payload };

  normalized.alertType = normalized.alertType || 'high_drawdown';
  normalized.purchasePrice = normalized.purchasePrice ? Number(normalized.purchasePrice) : null;
  normalized.targetPrice =
    normalized.alertType === 'target_price' && normalized.targetPrice
      ? Number(normalized.targetPrice)
      : null;
  normalized.alertCooldownMinutes = Number(normalized.alertCooldownMinutes);

  if (normalized.thresholdPercent === undefined || normalized.thresholdPercent === '') {
    delete normalized.thresholdPercent;
  } else {
    normalized.thresholdPercent = Number(normalized.thresholdPercent);
  }

  return normalized;
}

function syncAlertTypeControls(form) {
  const alertType = form.elements.alertType?.value || 'high_drawdown';
  const usesTargetPrice = alertType === 'target_price';
  const targetField = form.querySelector('[data-alert-target]');
  const targetInput = form.elements.targetPrice;
  const thresholdInput = form.elements.thresholdPercent;
  const thresholdLabel = form.querySelector('[data-threshold-label]');

  if (targetField) {
    targetField.hidden = !usesTargetPrice;
  }

  if (targetInput) {
    targetInput.disabled = !usesTargetPrice;
    targetInput.required = usesTargetPrice;
  }

  if (thresholdInput) {
    thresholdInput.disabled = usesTargetPrice;
    thresholdInput.required = !usesTargetPrice;
  }

  if (thresholdLabel) {
    thresholdLabel.textContent = alertType === 'purchase_loss' ? '손절률 %' : '하락률 %';
  }
}

async function previewQuote(button) {
  const symbol = elements.form.elements.symbol.value.trim().toUpperCase();

  if (!symbol) {
    showMessage('종목 코드를 입력하세요.', true);
    return;
  }

  hideSymbolSuggestions();

  await withBusy(button, async () => {
    const params = new URLSearchParams({
      symbol,
      purchasePrice: elements.form.elements.purchasePrice.value,
      purchaseDate: elements.form.elements.purchaseDate.value,
      alertType: elements.form.elements.alertType.value,
      thresholdPercent: elements.form.elements.thresholdPercent.value,
      targetPrice: elements.form.elements.targetPrice.value
    });
    const result = await api(`/api/quote-preview?${params.toString()}`);
    const quote = result.quote;
    elements.form.elements.symbol.value = quote.symbol;

    if (
      !elements.form.elements.displayName.value &&
      quote.name &&
      quote.name !== quote.symbol
    ) {
      elements.form.elements.displayName.value = quote.name;
    }

    renderQuotePreview(result);
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

function renderQuotePreview(preview) {
  if (!preview) {
    elements.quotePreview.className = 'quote-preview';
    elements.quotePreview.textContent = '';
    return;
  }

  const quote = preview.quote || preview;
  const position = preview.position;
  const previewCurrency = position?.currency || quote.currency;
  const statusClass = position?.alertNow ? 'down' : 'ok';
  const statusText = position
    ? position.alertNow
      ? '현재 알림 기준 이하'
      : `기준가까지 ${formatMoney(position.distanceToThreshold, position.currency)}`
    : getProviderLabel(quote.provider);

  elements.quotePreview.className = 'quote-preview show';
  elements.quotePreview.innerHTML = `
    <div class="quote-preview-header">
      <span class="quote-preview-name">${escapeHtml(quote.name || quote.symbol)}</span>
      <span class="quote-preview-meta">${escapeHtml(quote.symbol)} · ${getProviderLabel(quote.provider)}</span>
    </div>
    <div class="quote-preview-grid">
      ${renderPreviewItem('현재가', formatMoney(quote.price, previewCurrency))}
      ${position ? renderPreviewItem('알림 기준', position.alertTypeLabel || getAlertTypeLabel(position)) : ''}
      ${position ? renderPreviewItem('매수가', formatMoney(position.purchasePrice, position.currency)) : ''}
      ${
        position?.highPrice
          ? renderPreviewItem(
              '구매일 이후 최고가',
              formatMoney(position.highPrice, position.currency),
              `${formatDateOnly(position.highPriceAt)} 기준 · ${getHighSourceLabel(position.highPriceSource)}`
            )
          : ''
      }
      ${
        position
          ? renderPreviewItem(
              position.thresholdLabel || '알림 기준가',
              formatMoney(position.thresholdPrice, position.currency)
            )
          : ''
      }
      ${position ? renderPreviewItem(position.metricLabel || '현재 하락률', formatMetricPercent(position), '', statusClass) : ''}
      ${renderPreviewItem('상태', statusText, position ? formatDistancePercent(position) : '', statusClass)}
    </div>
  `;
}

function renderPreviewItem(label, value, detail = '', valueClass = '') {
  return `
    <div class="quote-preview-item">
      <span class="quote-preview-label">${escapeHtml(label)}</span>
      <span class="quote-preview-value ${escapeHtml(valueClass)}">${escapeHtml(value)}</span>
      ${detail ? `<span class="quote-preview-detail">${escapeHtml(detail)}</span>` : ''}
    </div>
  `;
}

function renderStatus(data) {
  elements.telegramStatus.innerHTML = data.telegramConfigured
    ? '<span class="dot"></span>Telegram 연결됨'
    : 'Telegram 미설정';
  elements.telegramStatus.className = `status-chip ${data.telegramConfigured ? 'connected' : 'warn'}`;
  elements.quoteStatus.textContent = `시세 ${formatProviderList(data.quoteProviders)}`;
  elements.quoteStatus.className = 'status-chip pipeline';
  elements.pollStatus.textContent = `${data.pollIntervalSeconds || 60}초 주기`;
  elements.pollStatus.className = 'status-chip timer';
}

function renderServerStatus(health) {
  const accessUrls = health.accessUrls || {};
  const currentUrl = window.location.origin;
  const localUrl = accessUrls.local || currentUrl;
  const lanUrls = Array.isArray(accessUrls.lan) ? accessUrls.lan : [];
  const phoneUrl = getPhoneAccessUrl(lanUrls, currentUrl);
  const serverMode = lanUrls.length ? '휴대폰 접속 가능' : 'PC 전용';

  elements.serverStatusSummary.textContent = `정상 · PID ${health.pid} · ${serverMode}`;
  elements.serverStatusPanel.innerHTML = `
    <div class="server-status-grid">
      ${renderServerMetric('서버', '정상 실행', `시작 ${formatDate(health.startedAt)}`)}
      ${renderServerMetric('Telegram', health.telegramConfigured ? '연결됨' : '미설정', health.telegramConfigured ? '알림 전송 가능' : '.env 설정 필요')}
      ${renderServerMetric('시세', formatProviderList(health.quoteProviders), `${health.pollIntervalSeconds || 60}초 주기`)}
      ${renderServerMetric('명령', formatDate(health.lastTelegramCommandPoll?.checkedAt), `${health.telegramCommandPollSeconds || 5}초 주기`)}
      ${renderServerMetric('마지막 확인', formatDate(health.lastCheck?.checkedAt), getLastCheckDetail(health.lastCheck))}
      ${renderServerMetric('포트', String(health.port || '-'), `HOST ${health.host || '-'}`)}
      ${renderServerMetric('데이터', shortenPath(health.dataDir), '로컬 저장소')}
      ${renderServerMetric('실행 방식', health.railwayRuntime ? 'Railway' : '로컬 PC', health.cwd || '')}
    </div>
    <div class="server-access">
      <div class="server-url-list">
        ${renderUrlRow('현재 주소', currentUrl)}
        ${renderUrlRow('PC 주소', localUrl)}
        ${
          lanUrls.length
            ? lanUrls.map((url, index) => renderUrlRow(index === 0 ? '휴대폰' : `휴대폰 ${index + 1}`, url)).join('')
            : renderInstructionRow('휴대폰', '같은 Wi-Fi 테스트는 start-phone.bat으로 서버를 시작하세요.')
        }
      </div>
      <div class="server-qr">
        ${
          phoneUrl
            ? `<img src="/api/qr.svg?text=${encodeURIComponent(phoneUrl)}" alt="휴대폰 접속 QR 코드" />`
            : '<div class="server-qr-empty">휴대폰 접속 주소 없음</div>'
        }
        <div class="server-qr-label">${phoneUrl ? '휴대폰으로 QR 스캔' : 'start-phone.bat 필요'}</div>
      </div>
    </div>
  `;
}

function renderServerStatusError(error) {
  elements.serverStatusSummary.textContent = '상태 확인 실패';
  elements.serverStatusPanel.innerHTML = `
    <div class="message show error">${escapeHtml(error.message || '서버 상태를 확인하지 못했습니다.')}</div>
  `;
}

function renderServerMetric(label, value, detail = '') {
  return `
    <div class="server-metric">
      <span class="server-metric-label">${escapeHtml(label)}</span>
      <span class="server-metric-value">${escapeHtml(value || '-')}</span>
      <span class="server-metric-detail">${escapeHtml(detail || '-')}</span>
    </div>
  `;
}

function renderUrlRow(label, url) {
  return `
    <div class="server-url-row">
      <span class="server-url-label">${escapeHtml(label)}</span>
      <a class="server-url" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>
      <button type="button" class="btn btn-ghost btn-sm text-button" data-copy="${escapeHtml(url)}">복사</button>
    </div>
  `;
}

function renderInstructionRow(label, text) {
  return `
    <div class="server-url-row">
      <span class="server-url-label">${escapeHtml(label)}</span>
      <span class="server-url">${escapeHtml(text)}</span>
    </div>
  `;
}

function getPhoneAccessUrl(lanUrls, currentUrl) {
  if (lanUrls.length) {
    return lanUrls[0];
  }

  try {
    const url = new URL(currentUrl);

    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      return currentUrl;
    }
  } catch {
    return '';
  }

  return '';
}

function getLastCheckDetail(lastCheck) {
  if (!lastCheck) {
    return '아직 실행 전';
  }

  if (lastCheck.skipped) {
    return lastCheck.reason || '건너뜀';
  }

  const checked = Array.isArray(lastCheck.results) ? lastCheck.results.length : 0;
  return `${checked}개 종목 확인`;
}

function shortenPath(value) {
  const text = String(value || '');

  if (text.length <= 36) {
    return text || '-';
  }

  return `...${text.slice(-33)}`;
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
      const alertMetric = calculateAlertMetric(stock, stock.lastPrice);
      const thresholdPrice = calculateAlertThreshold(stock);
      const lastPrice = parseFiniteNumber(stock.lastPrice);
      const isTriggered = thresholdPrice !== null && lastPrice !== null && lastPrice <= thresholdPrice;

      row.innerHTML = `
        <div class="stock-top">
          <div class="stock-title stock-info">
            <div class="stock-name">${escapeHtml(stock.displayName || stock.symbol)}</div>
            <div class="stock-symbol">${escapeHtml(stock.symbol)} ${stock.active ? '' : '비활성'}</div>
            ${renderPositionSummary(stock)}
          </div>
          <div class="metric price-block">
            <span class="metric-label price-label">현재가</span>
            <span class="metric-value price-value">${formatMoney(stock.lastPrice, stock.currency)}</span>
          </div>
          <div class="metric price-block">
            <span class="metric-label price-label">${getHighPriceLabel(stock)}</span>
            <span class="metric-value price-value">${formatMoney(stock.highPrice, stock.currency)}</span>
            <span class="metric-detail price-unit">${formatHighPriceAt(stock)}</span>
          </div>
          <div class="metric price-block">
            <span class="metric-label price-label">${escapeHtml(getAlertThresholdLabel(stock))}</span>
            <span class="metric-value price-value">${formatMoney(thresholdPrice, stock.currency)}</span>
          </div>
          <div class="metric change-block">
            <span class="metric-label price-label">${escapeHtml(getAlertMetricLabel(stock))}</span>
            <span class="metric-value change-pct ${isTriggered ? 'down' : 'up'}">${formatAlertMetricPercent(alertMetric)}</span>
          </div>
        </div>
        <div class="stock-bottom">
          <div class="status-block">
            <span class="status-badge ${getStockStatusClass(stock)}"><span class="dot"></span>${getStockStatusLabel(stock)}</span>
            <span class="status-time">${formatStockStatusDetail(stock)}</span>
            ${stock.quoteProvider ? `<span class="status-src">시세 ${getProviderLabel(stock.quoteProvider)}</span>` : ''}
            ${stock.lastError ? `<span class="metric-error">${escapeHtml(stock.lastError)}</span>` : ''}
          </div>
        </div>
      `;

      const actions = document.createElement('div');
      actions.className = 'stock-actions';
      actions.append(
        manualTestForm(stock),
        actionButton(state.editingStockId === stock.id ? '편집 닫기' : '편집', 'btn btn-ghost btn-sm secondary-button', () => {
          state.editingStockId = state.editingStockId === stock.id ? null : stock.id;
          renderStocks();
        }),
        actionButton(stock.active ? '중지' : '재개', 'btn btn-ghost btn-sm text-button', () =>
          patchStock(stock.id, { active: !stock.active })
        ),
        actionButton(stock.purchaseDate ? '최고가 재계산' : '최고가 초기화', 'btn btn-ghost btn-sm secondary-button', () =>
          patchStock(stock.id, { resetHighPrice: true })
        ),
        actionButton('삭제', 'btn btn-danger btn-sm danger-button', () => deleteStock(stock.id))
      );
      row.querySelector('.stock-bottom').append(actions);

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
      <span>매수가</span>
      <input name="purchasePrice" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" value="${escapeHtml(stock.purchasePrice || '')}" required />
    </label>
    <label>
      <span>구매일</span>
      <input name="purchaseDate" type="date" max="${getTodayInputValue()}" value="${escapeHtml(stock.purchaseDate || '')}" required />
    </label>
    <label>
      <span>알림 기준</span>
      <select name="alertType">
        <option value="high_drawdown" ${getAlertType(stock) === 'high_drawdown' ? 'selected' : ''}>최고가 대비 하락률</option>
        <option value="purchase_loss" ${getAlertType(stock) === 'purchase_loss' ? 'selected' : ''}>매수가 대비 손절률</option>
        <option value="target_price" ${getAlertType(stock) === 'target_price' ? 'selected' : ''}>직접 기준가</option>
      </select>
    </label>
    <label data-alert-target>
      <span>직접 기준가</span>
      <input name="targetPrice" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" value="${escapeHtml(stock.targetPrice || '')}" />
    </label>
    <label>
      <span data-threshold-label>하락률 %</span>
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
      <button type="button" class="btn btn-outline secondary-button" data-action="cancel">취소</button>
      <button type="submit" class="btn btn-primary primary-button">저장</button>
    </div>
  `;
  syncAlertTypeControls(form);

  form.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    state.editingStockId = null;
    renderStocks();
  });

  form.elements.alertType.addEventListener('change', () => syncAlertTypeControls(form));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = normalizeStockPayload(Object.fromEntries(formData.entries()));

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
  button.className = 'btn btn-outline btn-sm secondary-button';
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
          <span class="metric-label">${escapeHtml(alert.metricLabel || '하락률')}</span>
          <span class="metric-value down">${formatAlertMetricPercent(alert.drawdownPercent)}</span>
          ${alert.alertRepeatCount ? `<span class="metric-detail">${Number(alert.alertRepeatCount)}회차</span>` : ''}
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

function renderBackups() {
  if (!elements.backupList) {
    return;
  }

  const retentionText = state.backupRetention ? `최대 ${state.backupRetention}개 보관` : '백업 보관';
  elements.backupSummary.textContent = `${state.backups.length}개 백업 · ${retentionText}`;

  if (!state.backups.length) {
    elements.backupList.innerHTML = '<div class="empty">백업 파일이 없습니다.</div>';
    return;
  }

  elements.backupList.replaceChildren(
    ...state.backups.map((backup, index) => {
      const row = document.createElement('article');
      row.className = 'backup-row';
      row.innerHTML = `
        <div class="metric">
          <span class="metric-label">순번</span>
          <span class="metric-value">${index + 1}</span>
        </div>
        <div class="metric backup-file">
          <span class="metric-label">파일명</span>
          <span class="metric-value">${escapeHtml(backup.name || '-')}</span>
          <span class="metric-detail">${escapeHtml(getBackupReasonLabel(backup.reason))}</span>
        </div>
        <div class="metric">
          <span class="metric-label">크기</span>
          <span class="metric-value">${formatFileSize(backup.size)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">생성 시각</span>
          <span class="metric-value">${formatDate(backup.createdAt)}</span>
        </div>
        <div class="backup-actions"></div>
      `;

      row.querySelector('.backup-actions').append(
        actionButton('복구', 'btn btn-danger btn-sm danger-button', () => restoreBackupItem(backup))
      );

      return row;
    })
  );
}

async function restoreBackupItem(backup) {
  const confirmed = window.confirm(
    [
      '선택한 백업으로 데이터를 복구합니다.',
      '',
      `백업: ${backup.name}`,
      `생성 시각: ${formatDate(backup.createdAt)}`,
      '',
      '현재 데이터는 복구 전에 안전 백업으로 먼저 저장됩니다.',
      '계속할까요?'
    ].join('\n')
  );

  if (!confirmed) {
    return;
  }

  await api('/api/backups/restore', {
    method: 'POST',
    body: JSON.stringify({ target: backup.name })
  });

  state.editingStockId = null;
  showMessage('선택한 백업으로 복구했습니다.');
  await Promise.all([loadData(), loadBackups()]);
}

function renderManualTestMessage(result) {
  if (!result) {
    return '테스트 가격을 확인했습니다.';
  }

  const labels = {
    alert: '테스트 가격으로 알림을 보냈습니다.',
    recovered: '테스트 가격이 알림 기준 위로 회복됐습니다.',
    high_updated: '테스트 가격이 새 최고가로 저장됐습니다.',
    high_initialized: '구매일 이후 최고가를 계산했습니다.',
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
    recovered: '회복됨',
    high_updated: '새 최고가',
    high_initialized: '최고가 계산',
    checked: '정상',
    error: '조회 실패',
    pending: '대기'
  };

  if (stock.alertState === 'triggered' && stock.lastCheckStatus !== 'alert') {
    return '알림 상태';
  }

  return labels[stock.lastCheckStatus] || '대기';
}

function getStockStatusClass(stock) {
  if (!stock.active) {
    return 'muted';
  }

  const classes = {
    alert: 'alert',
    recovered: 'ok',
    high_updated: 'ok',
    checked: 'ok',
    error: 'error',
    pending: 'muted'
  };

  if (stock.alertState === 'triggered' && stock.lastCheckStatus !== 'error') {
    return 'alert';
  }

  return classes[stock.lastCheckStatus] || 'muted';
}

function formatLastChecked(value) {
  if (!value) {
    return '확인 전';
  }

  return `마지막 확인 ${formatDate(value)}`;
}

function formatStockStatusDetail(stock) {
  if (stock.lastCheckStatus === 'high_initialized' && stock.highPriceAt) {
    return `최고가 기준 ${formatDateOnly(stock.highPriceAt)}`;
  }

  if (stock.alertState === 'triggered') {
    const count = Number(stock.alertRepeatCount || 0);
    return `알림 진입 ${formatDate(stock.alertStartedAt)}${count ? ` · ${count}회차` : ''}`;
  }

  if (stock.lastCheckStatus === 'recovered' && stock.alertRecoveredAt) {
    return `회복 ${formatDate(stock.alertRecoveredAt)}`;
  }

  return formatLastChecked(stock.lastCheckedAt);
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

function renderPositionSummary(stock) {
  if (!stock.purchaseDate && !stock.purchasePrice) {
    return '';
  }

  const parts = [];

  if (stock.purchaseDate) {
    parts.push(`매수일 ${formatDateOnly(stock.purchaseDate)}`);
  }

  if (stock.purchasePrice) {
    parts.push(`매수가 ${formatMoney(stock.purchasePrice, stock.currency)}`);
  }

  parts.push(getAlertTypeLabel(stock));

  return `<div class="stock-symbol">${escapeHtml(parts.join(' · '))}</div>`;
}

function getHighPriceLabel(stock) {
  return stock.purchaseDate ? '구매일 이후 최고가' : '감시 최고가';
}

function getHighSourceLabel(source) {
  const labels = {
    historical_daily: '일봉',
    purchase_price: '매수가',
    realtime: '현재가',
    manual: '수동'
  };

  return labels[source] || '계산';
}

function formatHighPriceAt(stock) {
  if (!stock.highPriceAt) {
    return '';
  }

  return `${formatDateOnly(stock.highPriceAt)} 기준`;
}

function getAlertType(stock) {
  const type = String(stock?.alertType || 'high_drawdown');
  const validTypes = ['high_drawdown', 'purchase_loss', 'target_price'];

  return validTypes.includes(type) ? type : 'high_drawdown';
}

function getAlertTypeLabel(stock) {
  const labels = {
    high_drawdown: '최고가 대비 하락률',
    purchase_loss: '매수가 대비 손절률',
    target_price: '직접 기준가'
  };

  return labels[getAlertType(stock)];
}

function getAlertThresholdLabel(stock) {
  const labels = {
    high_drawdown: '알림 기준가',
    purchase_loss: '손절 기준가',
    target_price: '직접 기준가'
  };

  return labels[getAlertType(stock)];
}

function getAlertMetricLabel(stock) {
  const labels = {
    high_drawdown: '하락률',
    purchase_loss: '손실률',
    target_price: '기준 대비'
  };

  return labels[getAlertType(stock)];
}

function formatDistancePercent(position) {
  const value = Number(position.distanceToThresholdPercent);

  if (!Number.isFinite(value)) {
    return '';
  }

  if (position.alertNow) {
    return `기준가보다 ${Math.abs(value).toFixed(2)}% 낮음`;
  }

  return `현재가 기준 ${value.toFixed(2)}% 여유`;
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

async function copyText(text) {
  const value = String(text || '');

  if (!value) {
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    showMessage('주소를 복사했습니다.');
  } catch {
    showMessage('주소 복사에 실패했습니다.', true);
  }
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

function calculateAlertThreshold(stock) {
  if (getAlertType(stock) === 'target_price') {
    return parseFiniteNumber(stock.targetPrice);
  }

  if (getAlertType(stock) === 'purchase_loss') {
    return calculateThreshold(stock.purchasePrice, stock.thresholdPercent);
  }

  return calculateThreshold(stock.highPrice, stock.thresholdPercent);
}

function calculateAlertMetric(stock, lastPrice) {
  if (getAlertType(stock) === 'target_price') {
    return calculateDrawdown(stock.targetPrice, lastPrice);
  }

  if (getAlertType(stock) === 'purchase_loss') {
    return calculateDrawdown(stock.purchasePrice, lastPrice);
  }

  return calculateDrawdown(stock.highPrice, lastPrice);
}

function formatAlertMetricPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '-';
  }

  return number > 0 ? `-${number.toFixed(2)}%` : '0.00%';
}

function formatMetricPercent(position) {
  return formatAlertMetricPercent(position.metricPercent ?? position.drawdownPercent);
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

function formatDateOnly(value) {
  if (!value) {
    return '-';
  }

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return `${match[1]}.${match[2]}.${match[3]}`;
  }

  return formatDate(value);
}

function formatFileSize(value) {
  const size = Number(value);

  if (!Number.isFinite(size) || size < 0) {
    return '-';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getBackupReasonLabel(reason) {
  const labels = {
    'manual-web': '웹 수동 백업',
    manual: '수동 백업',
    'server-start': '서버 시작',
    'before-restore': '복구 전 안전 백업',
    'before-add-stock': '종목 추가 전',
    'after-add-stock': '종목 추가 후',
    'before-update-stock': '종목 수정 전',
    'after-update-stock': '종목 수정 후',
    'before-delete-stock': '종목 삭제 전',
    'after-delete-stock': '종목 삭제 후'
  };

  return labels[reason] || String(reason || '백업').replaceAll('-', ' ');
}

function getTodayInputValue() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
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

function isMobileViewport() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function switchMobileTab(name) {
  if (!isMobileViewport()) {
    return;
  }

  elements.tabSections.forEach((section) => {
    section.classList.toggle('active', section.id === `tab-${name}`);
  });
  elements.mobileNavButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === name);
  });
}

function syncResponsiveTabs() {
  if (!isMobileViewport()) {
    elements.tabSections.forEach((section) => section.classList.add('active'));
    return;
  }

  const activeButton =
    [...elements.mobileNavButtons].find((button) => button.classList.contains('active')) ||
    elements.mobileNavButtons[0];

  switchMobileTab(activeButton?.dataset.tab || 'register');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

syncResponsiveTabs();
initWebApp();
loadHealth();
loadData();
loadBackups();
window.setInterval(loadData, 15000);
window.setInterval(loadHealth, 15000);

function initWebApp() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}
