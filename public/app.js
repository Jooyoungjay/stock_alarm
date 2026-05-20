import { buildAveragingPlan } from './averagingCalculator.js';

const APP_MODES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin'
});

const ADMIN_TOKEN_STORAGE_KEY = 'stock_alarm_admin_token';
const KIS_MARKET_DIV_CODE_OPTIONS = Object.freeze([
  { value: '', label: '서버 기본값' },
  { value: 'J', label: 'KRX' },
  { value: 'NX', label: 'NXT' },
  { value: 'UN', label: '통합' }
]);

function getAppMode() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  return pathname === '/admin' ? APP_MODES.ADMIN : APP_MODES.USER;
}

const state = {
  appMode: getAppMode(),
  stocks: [],
  alerts: [],
  backups: [],
  health: null,
  roadmap: null,
  dividendCalendar: null,
  quoteProviderStats: null,
  kisQuoteSmokeTest: null,
  adminAuthRequired: false,
  adminAuthenticated: false,
  backupRetention: 0,
  loading: false,
  registrationModalOpen: false,
  registrationStep: 1,
  dividendCalendarFilter: 'all',
  watchFilter: 'all',
  watchSort: 'risk',
  editingStockId: null
};

const elements = {
  page: document.querySelector('.page'),
  headerBadge: document.querySelector('.header-badge'),
  headerTitle: document.querySelector('.header-title'),
  userModeLink: document.querySelector('#userModeLink'),
  adminModeLink: document.querySelector('#adminModeLink'),
  registerModal: document.querySelector('#tab-register'),
  openRegisterButton: document.querySelector('#openRegisterButton'),
  closeRegisterButton: document.querySelector('#closeRegisterButton'),
  form: document.querySelector('#stockForm'),
  stockList: document.querySelector('#stockList'),
  alertList: document.querySelector('#alertList'),
  message: document.querySelector('#message'),
  adminMessage: document.querySelector('#adminMessage'),
  watchSummaryBar: document.querySelector('#watchSummaryBar'),
  portfolioSummaryBar: document.querySelector('#portfolioSummaryBar'),
  quoteDiagnosticsPanel: document.querySelector('#quoteDiagnosticsPanel'),
  dividendDiagnosticsPanel: document.querySelector('#dividendDiagnosticsPanel'),
  dividendCalendarPanel: document.querySelector('#dividendCalendarPanel'),
  watchFilterButtons: document.querySelectorAll('[data-watch-filter]'),
  watchSortSelect: document.querySelector('#watchSortSelect'),
  backupList: document.querySelector('#backupList'),
  backupSummary: document.querySelector('#backupSummary'),
  serverStatusPanel: document.querySelector('#serverStatusPanel'),
  serverStatusSummary: document.querySelector('#serverStatusSummary'),
  adminAuthCard: document.querySelector('.admin-auth-card'),
  adminAuthForm: document.querySelector('#adminAuthForm'),
  adminTokenInput: document.querySelector('#adminTokenInput'),
  adminAuthBadge: document.querySelector('#adminAuthBadge'),
  adminAuthSummary: document.querySelector('#adminAuthSummary'),
  adminAuthHelp: document.querySelector('#adminAuthHelp'),
  clearAdminTokenButton: document.querySelector('#clearAdminTokenButton'),
  roadmapPanel: document.querySelector('#roadmapPanel'),
  roadmapSummary: document.querySelector('#roadmapSummary'),
  summaryText: document.querySelector('#summaryText'),
  telegramStatus: document.querySelector('#telegramStatus'),
  quoteStatus: document.querySelector('#quoteStatus'),
  pollStatus: document.querySelector('#pollStatus'),
  quotePreview: document.querySelector('#quotePreview'),
  registrationSummary: document.querySelector('#registrationSummary'),
  alertRuleSummary: document.querySelector('#alertRuleSummary'),
  symbolSuggestions: document.querySelector('#symbolSuggestions'),
  previewQuoteButton: document.querySelector('#previewQuoteButton'),
  registerBackButton: document.querySelector('#registerBackButton'),
  registerNextButton: document.querySelector('#registerNextButton'),
  registerSubmitButton: document.querySelector('#registerSubmitButton'),
  registerStepButtons: document.querySelectorAll('[data-register-step-button]'),
  registerSteps: document.querySelectorAll('[data-register-step]'),
  checkNowButton: document.querySelector('#checkNowButton'),
  refreshDividendsButton: document.querySelector('#refreshDividendsButton'),
  sendBriefingButton: document.querySelector('#sendBriefingButton'),
  testTelegramButton: document.querySelector('#testTelegramButton'),
  createBackupButton: document.querySelector('#createBackupButton'),
  refreshBackupsButton: document.querySelector('#refreshBackupsButton'),
  refreshServerStatusButton: document.querySelector('#refreshServerStatusButton'),
  refreshRoadmapButton: document.querySelector('#refreshRoadmapButton'),
  kisSmokeTestForm: document.querySelector('#kisSmokeTestForm'),
  kisSmokeSymbolInput: document.querySelector('#kisSmokeSymbolInput'),
  kisSmokeMarketSelect: document.querySelector('#kisSmokeMarketSelect'),
  kisSmokeForceTokenInput: document.querySelector('#kisSmokeForceTokenInput'),
  kisSmokeRunButton: document.querySelector('#kisSmokeRunButton'),
  kisSmokeTestResult: document.querySelector('#kisSmokeTestResult'),
  tabSections: document.querySelectorAll('.tab-section'),
  mobileNavButtons: document.querySelectorAll('.nav-item')
};

let symbolSearchTimer = null;
let symbolSearchRequestId = 0;

applyAppMode();
elements.form.elements.purchaseDate.max = getTodayInputValue();
syncAlertTypeControls(elements.form);
renderRegistrationSummary();
updateRegistrationStep(1);
renderKisSmokeTestResult(null);

elements.form.elements.alertType.addEventListener('change', () => {
  syncAlertTypeControls(elements.form);
  renderQuotePreview(null);
  renderRegistrationSummary();
});

elements.alertRuleSummary?.addEventListener('click', (event) => {
  const target = event.target?.closest ? event.target : event.target?.parentElement;
  const button = target?.closest('[data-alert-preset]');

  if (!button) {
    return;
  }

  applyAlertPreset(button.dataset.alertPreset, button.dataset.thresholdPreset);
});

elements.form.addEventListener('input', (event) => {
  if (event.target === elements.form.elements.thresholdPercent) {
    renderAlertRuleSummary();
  }

  renderRegistrationSummary();
});

elements.registerStepButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const nextStep = Number(button.dataset.registerStepButton);

    if (!Number.isFinite(nextStep) || nextStep === state.registrationStep) {
      return;
    }

    if (nextStep > state.registrationStep) {
      for (let step = state.registrationStep; step < nextStep; step += 1) {
        if (!validateRegistrationStep(step)) {
          return;
        }
      }
    }

    updateRegistrationStep(nextStep);
  });
});

elements.openRegisterButton?.addEventListener('click', () => openRegistrationModal());
elements.closeRegisterButton?.addEventListener('click', () => closeRegistrationModal());
elements.registerModal?.addEventListener('click', (event) => {
  if (event.target === elements.registerModal) {
    closeRegistrationModal();
  }
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
    renderRegistrationSummary();
  });
});

elements.mobileNavButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.openRegister) {
      openRegistrationModal();
      return;
    }

    switchMobileTab(button.dataset.tab);
  });
});

window.addEventListener('resize', syncResponsiveTabs);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.registrationModalOpen) {
    closeRegistrationModal();
  }
});

elements.adminAuthForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveAdminToken();
});

elements.clearAdminTokenButton?.addEventListener('click', async () => {
  clearAdminToken();
  await loadAdminSession();
  showMessage('관리자 토큰을 삭제했습니다.');
});

elements.form.elements.symbol.addEventListener('input', () => {
  renderQuotePreview(null);
  queueSymbolSearch(elements.form.elements.symbol.value);
});

elements.form.elements.symbol.addEventListener('focus', () => {
  queueSymbolSearch(elements.form.elements.symbol.value);
});

elements.form.elements.kisMarketDivCode?.addEventListener('change', () => {
  renderQuotePreview(null);
  renderRegistrationSummary();
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

  if (![1, 2, 3].every((step) => validateRegistrationStep(step))) {
    return;
  }

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
    renderRegistrationSummary();
    updateRegistrationStep(1);
    closeRegistrationModal();
    showMessage('종목을 등록했습니다.');
    await loadData();
  });
});

elements.previewQuoteButton.addEventListener('click', async () => {
  await previewQuote(elements.previewQuoteButton);
});

elements.registerBackButton.addEventListener('click', () => {
  closeRegistrationModal();
});

elements.registerNextButton.addEventListener('click', () => {
  if (!validateRegistrationStep(state.registrationStep)) {
    return;
  }

  updateRegistrationStep(state.registrationStep + 1);
});

elements.checkNowButton.addEventListener('click', async () => {
  await withBusy(elements.checkNowButton, async () => {
    const result = await api('/api/check-now', { method: 'POST' });
    const checked = result.results?.length || 0;
    showMessage(`${checked}개 종목을 확인했습니다.`);
    await loadData();
  });
});

elements.refreshDividendsButton.addEventListener('click', async () => {
  await withBusy(elements.refreshDividendsButton, async () => {
    const result = await api('/api/dividends/refresh', { method: 'POST' });
    const counts = countDividendRefreshResults(result);
    showMessage(`배당 정보 ${counts.checked}개 확인, ${counts.updated}개 업데이트했습니다.`);
    await Promise.all([loadData(), loadHealth()]);
  });
});

elements.dividendCalendarPanel?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-dividend-calendar-filter]');

  if (!button) {
    return;
  }

  state.dividendCalendarFilter = button.dataset.dividendCalendarFilter || 'all';
  renderDividendCalendar(state.dividendCalendar);
});

elements.sendBriefingButton.addEventListener('click', async () => {
  await withBusy(elements.sendBriefingButton, async () => {
    const result = await api('/api/briefing/send', { method: 'POST' });

    if (result.deliveryStatus === 'sent') {
      showMessage('일일 브리핑을 텔레그램으로 전송했습니다.');
    } else if (result.deliveryStatus === 'not_configured') {
      showMessage('텔레그램 설정이 없어 브리핑을 전송하지 못했습니다.', true);
    } else {
      showMessage(result.deliveryError || '브리핑 전송에 실패했습니다.', true);
    }

    await Promise.all([loadData(), loadHealth()]);
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

elements.refreshRoadmapButton.addEventListener('click', async () => {
  await withBusy(elements.refreshRoadmapButton, loadRoadmap);
});

elements.kisSmokeTestForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  await runKisSmokeTest();
});

elements.watchFilterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    state.watchFilter = button.dataset.watchFilter || 'all';
    renderStocks();
  });
});

elements.watchSortSelect.addEventListener('change', () => {
  state.watchSort = elements.watchSortSelect.value || 'risk';
  renderStocks();
});

elements.serverStatusPanel.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy]');

  if (!button) {
    return;
  }

  await copyText(button.dataset.copy);
});

async function loadAdminSession() {
  if (!isAdminMode()) {
    return true;
  }

  try {
    const data = await api('/api/admin/session');
    const adminAuth = data.adminAuth || {};

    state.adminAuthRequired = Boolean(adminAuth.required);
    state.adminAuthenticated = Boolean(adminAuth.authenticated);
    renderAdminAuth();
    return canAccessAdminPanel();
  } catch (error) {
    state.adminAuthRequired = true;
    state.adminAuthenticated = false;
    renderAdminAuth();
    showMessage(error.message, true);
    return false;
  }
}

async function loadHealth() {
  try {
    const health = await api('/api/health');
    state.health = health;
    renderServerStatus(health);
  } catch (error) {
    handleAdminAuthFailure(error);
    renderServerStatusError(error);
  }
}

async function loadData() {
  try {
    const roadmapRequest = isAdminMode()
      ? api('/api/roadmap')
          .then((payload) => ({ payload }))
          .catch((error) => ({ error }))
      : Promise.resolve({ payload: null });

    const [data, roadmapResult] = await Promise.all([
      api('/api/stocks'),
      roadmapRequest
    ]);
    state.stocks = data.stocks || [];
    state.alerts = data.alerts || [];
    state.dividendCalendar = data.dividendCalendar || null;
    state.quoteProviderStats = data.quoteProviderStats || null;
    renderStatus(data);
    renderStocks();
    renderDividendCalendar(state.dividendCalendar);
    renderQuoteDiagnostics(data.quoteProviderStats);
    renderDividendDiagnostics(data.lastDividendRefresh);
    renderAlerts();

    if (isAdminMode() && roadmapResult.payload) {
      state.roadmap = roadmapResult.payload.roadmap || null;
      renderRoadmap(state.roadmap);
    } else if (isAdminMode()) {
      renderRoadmapError(roadmapResult.error);
    }
  } catch (error) {
    handleAdminAuthFailure(error);
    showMessage(error.message, true);
  }
}

async function loadRoadmap() {
  try {
    const data = await api('/api/roadmap');
    state.roadmap = data.roadmap || null;
    renderRoadmap(state.roadmap);
  } catch (error) {
    handleAdminAuthFailure(error);
    renderRoadmapError(error);
  }
}

async function loadBackups() {
  try {
    const data = await api('/api/backups');
    state.backups = data.backups || [];
    state.backupRetention = data.retention || 0;
    renderBackups();
  } catch (error) {
    handleAdminAuthFailure(error);
    showMessage(error.message, true);
  }
}

async function runKisSmokeTest() {
  await withBusy(elements.kisSmokeRunButton, async () => {
    const result = await api('/api/kis/quote-smoke-test', {
      method: 'POST',
      body: JSON.stringify({
        symbol: elements.kisSmokeSymbolInput?.value || '',
        market: elements.kisSmokeMarketSelect?.value || 'J',
        forceToken: Boolean(elements.kisSmokeForceTokenInput?.checked)
      })
    });

    state.kisQuoteSmokeTest = result.kisQuoteSmokeTest || null;
    state.quoteProviderStats = result.quoteProviderStats || state.quoteProviderStats;
    renderKisSmokeTestResult(state.kisQuoteSmokeTest);
    renderQuoteDiagnostics(state.quoteProviderStats);
    showMessage(
      state.kisQuoteSmokeTest?.ok
        ? 'KIS 현재가 점검이 성공했습니다.'
        : 'KIS 현재가 점검에서 실패 항목이 있습니다.',
      !state.kisQuoteSmokeTest?.ok
    );
  });
}

async function api(path, options = {}) {
  const headers = {
    'content-type': 'application/json',
    ...(options.headers || {})
  };
  const adminToken = isAdminMode() ? getAdminToken() : '';

  if (adminToken && !headers['x-admin-token']) {
    headers['x-admin-token'] = adminToken;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || '요청에 실패했습니다.');
    error.status = response.status;
    error.payload = payload;
    error.adminAuthRequired = Boolean(payload.adminAuthRequired);
    throw error;
  }

  return payload;
}

function isAdminMode() {
  return state.appMode === APP_MODES.ADMIN;
}

function applyAppMode() {
  document.body.dataset.appMode = state.appMode;
  document.body.dataset.adminAuth = isAdminMode() ? 'checking' : 'none';
  elements.page?.classList.toggle('admin-page', isAdminMode());

  setModeLinkState(elements.userModeLink, !isAdminMode());
  setModeLinkState(elements.adminModeLink, isAdminMode());

  if (elements.headerBadge) {
    elements.headerBadge.textContent = isAdminMode() ? 'Admin Console' : 'Telegram MVP';
  }

  if (elements.headerTitle) {
    elements.headerTitle.textContent = isAdminMode() ? 'Stock Alarm Admin' : 'Stock Alarm';
  }
}

function setModeLinkState(link, isActive) {
  if (!link) {
    return;
  }

  link.classList.toggle('active', isActive);

  if (isActive) {
    link.setAttribute('aria-current', 'page');
  } else {
    link.removeAttribute('aria-current');
  }
}

function canAccessAdminPanel() {
  return !isAdminMode() || !state.adminAuthRequired || state.adminAuthenticated;
}

function renderAdminAuth() {
  if (!elements.adminAuthCard) {
    return;
  }

  elements.adminAuthCard.dataset.authRequired = String(state.adminAuthRequired);

  if (!isAdminMode()) {
    document.body.dataset.adminAuth = 'none';
    return;
  }

  if (!state.adminAuthRequired) {
    document.body.dataset.adminAuth = 'open';
    elements.adminAuthBadge.textContent = '보호 미설정';
    elements.adminAuthBadge.className = 'status-badge alert';
    elements.adminAuthSummary.textContent = 'ADMIN_TOKEN이 없어 관리자 기능이 열려 있습니다.';
    elements.adminAuthHelp.textContent =
      '.env에 ADMIN_TOKEN을 설정하고 서버를 재시작하면 운영 API 보호가 켜집니다.';
    return;
  }

  if (state.adminAuthenticated) {
    document.body.dataset.adminAuth = 'authenticated';
    elements.adminAuthBadge.textContent = '인증됨';
    elements.adminAuthBadge.className = 'status-badge ok';
    elements.adminAuthSummary.textContent = '관리자 토큰이 확인되었습니다.';
    elements.adminAuthHelp.textContent =
      '토큰은 현재 브라우저 세션에만 저장됩니다. 브라우저를 닫으면 다시 입력해야 합니다.';
    return;
  }

  document.body.dataset.adminAuth = 'locked';
  elements.adminAuthBadge.textContent = '토큰 필요';
  elements.adminAuthBadge.className = 'status-badge error';
  elements.adminAuthSummary.textContent = '관리자 화면을 보려면 ADMIN_TOKEN을 입력해야 합니다.';
  elements.adminAuthHelp.textContent =
    '.env 또는 .env.local에 설정한 ADMIN_TOKEN을 입력하세요. 토큰은 서버로 확인 요청할 때만 전송됩니다.';
}

async function saveAdminToken() {
  const token = elements.adminTokenInput?.value.trim() || '';

  if (!token) {
    showMessage('관리자 토큰을 입력하세요.', true);
    return;
  }

  setAdminToken(token);
  const authenticated = await loadAdminSession();

  if (!authenticated) {
    clearAdminToken();
    showMessage('관리자 토큰이 맞지 않습니다.', true);
    return;
  }

  if (elements.adminTokenInput) {
    elements.adminTokenInput.value = '';
  }

  showMessage('관리자 인증이 완료되었습니다.');
  await loadAdminData();
}

function getAdminToken() {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function setAdminToken(token) {
  try {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
  } catch {
    showMessage('브라우저 세션 저장소에 토큰을 저장하지 못했습니다.', true);
  }
}

function clearAdminToken() {
  try {
    window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // Session storage can be unavailable in some privacy modes.
  }

  state.adminAuthenticated = !state.adminAuthRequired;
  renderAdminAuth();
}

function handleAdminAuthFailure(error) {
  if (!isAdminMode() || !error.adminAuthRequired) {
    return false;
  }

  state.adminAuthRequired = true;
  state.adminAuthenticated = false;
  renderAdminAuth();
  return true;
}

function normalizeKisMarketDivCode(value) {
  const text = String(value || '').trim().toUpperCase();
  const aliases = {
    KRX: 'J',
    NXT: 'NX',
    NEXTRADE: 'NX',
    INTEGRATED: 'UN',
    TOTAL: 'UN',
    ALL: 'UN',
    UNIFIED: 'UN',
    통합: 'UN',
    DEFAULT: '',
    SERVER: '',
    SERVER_DEFAULT: '',
    기본값: ''
  };
  const normalized = Object.prototype.hasOwnProperty.call(aliases, text) ? aliases[text] : text;

  return KIS_MARKET_DIV_CODE_OPTIONS.some((option) => option.value === normalized) ? normalized : '';
}

function formatKisMarketDivCodeLabel(value) {
  const normalized = normalizeKisMarketDivCode(value);
  const option = KIS_MARKET_DIV_CODE_OPTIONS.find((item) => item.value === normalized);

  return option?.label || '서버 기본값';
}

function renderKisMarketDivCodeOptions(selectedValue) {
  const selected = normalizeKisMarketDivCode(selectedValue);

  return KIS_MARKET_DIV_CODE_OPTIONS.map(
    (option) =>
      `<option value="${escapeHtml(option.value)}" ${option.value === selected ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
  ).join('');
}

function normalizeStockPayload(payload) {
  const normalized = { ...payload };

  normalized.alertType = normalized.alertType || 'high_drawdown';
  normalized.kisMarketDivCode = normalizeKisMarketDivCode(normalized.kisMarketDivCode);
  normalized.purchasePrice = normalized.purchasePrice ? Number(normalized.purchasePrice) : null;
  normalized.quantity = normalized.quantity ? Number(normalized.quantity) : null;
  normalized.annualDividendPerShare = normalized.annualDividendPerShare
    ? Number(normalized.annualDividendPerShare)
    : null;
  normalized.dividendFrequency = normalized.dividendFrequency || '';
  normalized.dividendMonths = normalized.dividendMonths || '';
  normalized.targetPrice =
    normalized.alertType === 'target_price' && normalized.targetPrice
      ? Number(normalized.targetPrice)
      : null;
  normalized.investmentTargetPrice = normalized.investmentTargetPrice
    ? Number(normalized.investmentTargetPrice)
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
    thresholdLabel.textContent =
      alertType === 'purchase_loss'
        ? '손절률 %'
        : alertType === 'profit_retracement'
          ? '이익금 반납률 %'
          : '하락률 %';
  }

  renderAlertRuleSummary(alertType);
}

function applyAlertPreset(alertType, thresholdPercent) {
  if (!alertType || !elements.form.elements.alertType) {
    return;
  }

  elements.form.elements.alertType.value = alertType;

  if (thresholdPercent && elements.form.elements.thresholdPercent) {
    elements.form.elements.thresholdPercent.value = thresholdPercent;
  }

  syncAlertTypeControls(elements.form);
  renderQuotePreview(null);
  renderRegistrationSummary();
}

function openRegistrationModal() {
  state.registrationModalOpen = true;
  document.body.dataset.registerModal = 'open';
  elements.registerModal?.setAttribute('aria-hidden', 'false');
  updateRegistrationStep(4);
  renderRegistrationSummary();
  window.setTimeout(() => elements.form.elements.symbol?.focus(), 0);
}

function closeRegistrationModal() {
  state.registrationModalOpen = false;
  document.body.dataset.registerModal = 'closed';
  elements.registerModal?.setAttribute('aria-hidden', 'true');
  hideSymbolSuggestions();
}

function updateRegistrationStep(step) {
  state.registrationStep = 4;

  elements.registerSteps.forEach((section) => {
    section.classList.add('active');
  });

  elements.registerStepButtons.forEach((button) => {
    button.classList.add('active');
    button.classList.remove('completed');
  });

  elements.registerBackButton.hidden = false;
  elements.registerNextButton.hidden = true;
  elements.previewQuoteButton.hidden = false;
  elements.registerSubmitButton.hidden = false;
  renderRegistrationSummary();
}

function validateRegistrationStep(step) {
  const controlsByStep = {
    1: [elements.form.elements.symbol],
    2: [
      elements.form.elements.purchasePrice,
      elements.form.elements.quantity,
      elements.form.elements.annualDividendPerShare,
      elements.form.elements.dividendFrequency,
      elements.form.elements.dividendMonths,
      elements.form.elements.purchaseDate
    ],
    3: [
      elements.form.elements.alertType,
      elements.form.elements.targetPrice,
      elements.form.elements.thresholdPercent,
      elements.form.elements.alertCooldownMinutes,
      elements.form.elements.investmentTargetPrice,
      elements.form.elements.reviewDate,
      elements.form.elements.investmentReason,
      elements.form.elements.sellCondition,
      elements.form.elements.notes
    ]
  };
  const controls = controlsByStep[step] || [];

  for (const control of controls) {
    if (!control || control.disabled) {
      continue;
    }

    if (!control.checkValidity()) {
      control.reportValidity();
      return false;
    }
  }

  return true;
}

function renderAlertRuleSummary(alertType = elements.form.elements.alertType.value) {
  const summaries = {
    high_drawdown: {
      value: '최고가 대비 하락률',
      detail: '매수일을 입력하면 매수일 이후 최고가, 비우면 등록 이후 감시 최고가에서 설정 비율만큼 내려올 때 알림을 보냅니다.',
      fit: '추세를 따라가며 고점 이탈을 보고 싶을 때 적합합니다.',
      caution: '새 고점을 만들면 기준가도 같이 올라갑니다.'
    },
    profit_retracement: {
      value: '이익금 반납률',
      detail: '평단가 대비 최고 이익금 중 설정한 비율을 반납하면 알림을 보냅니다. 매수일을 비우면 등록 이후 감시 최고가를 씁니다.',
      fit: '수익을 최대한 보존하고 싶을 때 가장 이해하기 쉽습니다.',
      caution: '고점이 평단가보다 높아야 기준가가 계산됩니다.'
    },
    purchase_loss: {
      value: '매수가 대비 손절률',
      detail: '매수가에서 설정한 비율만큼 손실이 나면 알림을 보냅니다.',
      fit: '매수 직후 손실 제한선을 먼저 정해둘 때 적합합니다.',
      caution: '수익이 난 뒤의 고점 반납은 반영하지 않습니다.'
    },
    target_price: {
      value: '직접 기준가',
      detail: '직접 입력한 기준가 이하가 되면 알림을 보냅니다.',
      fit: '이미 정해둔 매도 가격이 있을 때 적합합니다.',
      caution: '현재가와 고점 변화에 따라 자동 조정되지 않습니다.'
    }
  };
  const summary = summaries[alertType] || summaries.high_drawdown;
  const beginnerPick =
    alertType === 'profit_retracement'
      ? '현재 선택이 초보 추천 기준입니다.'
      : '초보자는 이익금 반납률 10% 또는 15%부터 비교해보는 것을 권장합니다.';

  elements.alertRuleSummary.innerHTML = `
    <div class="alert-rule-item">
      <span class="alert-rule-label">선택한 알림 기준</span>
      <span class="alert-rule-value">${escapeHtml(summary.value)}</span>
      <span class="alert-rule-detail">${escapeHtml(summary.detail)}</span>
    </div>
    <div class="alert-rule-item">
      <span class="alert-rule-label">추천 상황</span>
      <span class="alert-rule-value">${escapeHtml(summary.fit)}</span>
      <span class="alert-rule-detail">${escapeHtml(summary.caution)}</span>
    </div>
    <div class="alert-preset-panel">
      <div>
        <span class="alert-rule-label">빠른 추천값</span>
        <span class="alert-rule-detail">${escapeHtml(beginnerPick)}</span>
      </div>
      <div class="alert-preset-list">
        ${renderAlertPresetButton('profit_retracement', 10, '이익 10%', alertType)}
        ${renderAlertPresetButton('profit_retracement', 15, '이익 15%', alertType)}
        ${renderAlertPresetButton('high_drawdown', 5, '고점 -5%', alertType)}
        ${renderAlertPresetButton('purchase_loss', 5, '손절 -5%', alertType)}
      </div>
    </div>
  `;
}

function renderAlertPresetButton(alertType, thresholdPercent, label, selectedAlertType) {
  const selected =
    selectedAlertType === alertType &&
    Number(elements.form.elements.thresholdPercent.value) === Number(thresholdPercent);

  return `
    <button
      class="alert-preset-button ${selected ? 'active' : ''}"
      type="button"
      data-alert-preset="${escapeHtml(alertType)}"
      data-threshold-preset="${escapeHtml(thresholdPercent)}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

async function previewQuote(button) {
  if (![1, 2, 3].every((step) => validateRegistrationStep(step))) {
    return;
  }

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
      quantity: elements.form.elements.quantity.value,
      annualDividendPerShare: elements.form.elements.annualDividendPerShare.value,
      dividendFrequency: elements.form.elements.dividendFrequency.value,
      dividendMonths: elements.form.elements.dividendMonths.value,
      purchaseDate: elements.form.elements.purchaseDate.value,
      kisMarketDivCode: elements.form.elements.kisMarketDivCode.value,
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
    const empty = document.createElement('div');
    empty.className = 'symbol-suggestion-empty';
    empty.textContent = '검색 결과 없음 · 종목 코드를 직접 입력할 수 있습니다.';
    elements.symbolSuggestions.replaceChildren(empty);
    elements.symbolSuggestions.className = 'symbol-suggestions show';
    return;
  }

  const buttons = results.map((item) => {
    const button = document.createElement('button');
    const main = document.createElement('span');
    const name = document.createElement('span');
    const meta = document.createElement('span');
    const badges = document.createElement('span');

    button.type = 'button';
    button.className = 'symbol-suggestion';
    main.className = 'symbol-suggestion-main';
    name.className = 'symbol-suggestion-name';
    meta.className = 'symbol-suggestion-meta';
    badges.className = 'symbol-suggestion-badges';
    name.textContent = item.name;
    meta.textContent = `${item.symbol} · ${item.market}`;
    main.append(name, meta);
    badges.append(...buildSymbolSuggestionBadges(item));
    button.append(main, badges);
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
  renderRegistrationSummary();
  elements.form.elements.symbol.focus();
}

function buildSymbolSuggestionBadges(item) {
  const badges = [];

  if (isPreferredStockSymbol(item)) {
    badges.push(createSuggestionBadge('우선주', 'preferred'));
  }

  if (isRegisteredSymbol(item.symbol)) {
    badges.push(createSuggestionBadge('등록됨', 'registered'));
  }

  if (!badges.length) {
    badges.push(createSuggestionBadge(item.market || '종목', 'market'));
  }

  return badges;
}

function createSuggestionBadge(label, type) {
  const badge = document.createElement('span');
  badge.className = `symbol-suggestion-badge ${type}`;
  badge.textContent = label;
  return badge;
}

function isPreferredStockSymbol(item) {
  return /우|preferred/i.test(`${item.name || ''} ${(item.aliases || []).join(' ')}`) ||
    /^\d{5}[A-Z]/i.test(String(item.symbol || ''));
}

function isRegisteredSymbol(symbol) {
  const normalized = normalizeSymbolForCompare(symbol);
  return state.stocks.some((stock) => normalizeSymbolForCompare(stock.symbol) === normalized);
}

function normalizeSymbolForCompare(symbol) {
  return String(symbol || '').trim().toUpperCase().replace(/\.(KS|KQ)$/i, '');
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
    handleAdminAuthFailure(error);
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
  const dividendSchedule = position ? getDividendSchedule({
    quantity: position.quantity,
    annualDividendPerShare: position.annualDividendPerShare,
    dividendFrequency: elements.form.elements.dividendFrequency.value,
    dividendMonths: elements.form.elements.dividendMonths.value
  }) : null;
  const statusClass = position?.alertNow ? 'down' : 'ok';
  const statusText = position
    ? position.alertNow
      ? '현재 알림 기준 이하'
      : position.thresholdPrice === null
        ? '기준가 계산 대기'
        : `기준가까지 ${formatMoney(position.distanceToThreshold, position.currency)}`
    : formatQuoteSourceSummary(quote) || getProviderLabel(quote.provider);
  const quoteSourceSummary = formatQuoteSourceSummary(quote);
  const quoteSourceDetail = formatQuoteSourceDetail(quote);

  elements.quotePreview.className = 'quote-preview show';
  elements.quotePreview.innerHTML = `
    <div class="quote-preview-header">
      <span class="quote-preview-name">${escapeHtml(quote.name || quote.symbol)}</span>
      <span class="quote-preview-meta">${escapeHtml(quote.symbol)} · ${escapeHtml(quoteSourceSummary || getProviderLabel(quote.provider))}</span>
    </div>
    <div class="quote-preview-grid">
      ${renderPreviewItem('현재가', formatMoney(quote.price, previewCurrency))}
      ${quoteSourceSummary ? renderPreviewItem('시세 출처', quoteSourceSummary, quoteSourceDetail) : ''}
      ${quote.regularMarketTime ? renderPreviewItem('시세 시각', formatDate(quote.regularMarketTime), quote.marketState || '') : ''}
      ${position ? renderPreviewItem('알림 기준', position.alertTypeLabel || getAlertTypeLabel(position)) : ''}
      ${position ? renderPreviewItem('매수가', formatMoney(position.purchasePrice, position.currency)) : ''}
      ${position?.quantity ? renderPreviewItem('보유 수량', formatQuantity(position.quantity)) : ''}
      ${
        position?.highPrice
          ? renderPreviewItem(
              getHighPriceLabel(position),
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
      ${position?.investmentAmount ? renderPreviewItem('총 매수금액', formatMoney(position.investmentAmount, position.currency)) : ''}
      ${position?.marketValue ? renderPreviewItem('현재 평가금액', formatMoney(position.marketValue, position.currency)) : ''}
      ${
        position?.maximumProfitAmount !== null && position?.maximumProfitAmount !== undefined
          ? renderPreviewItem(
              '최대 수익금',
              formatSignedMoney(position.maximumProfitAmount, position.currency),
              `${formatSignedPercent(position.maximumProfitPercent)} · 최고가 기준`,
              'up'
            )
          : ''
      }
      ${
        position?.expectedAnnualDividend &&
        position?.maximumTotalReturnAmount !== null &&
        position?.maximumTotalReturnAmount !== undefined
          ? renderPreviewItem(
              '배당 포함 최대 수익',
              formatSignedMoney(position.maximumTotalReturnAmount, position.currency),
              `${formatSignedPercent(position.maximumTotalReturnPercent)} · 예상 연 배당 포함`,
              'up'
            )
          : ''
      }
      ${
        position?.retracedProfitAmount !== null &&
        position?.retracedProfitAmount !== undefined &&
        position?.alertType === 'profit_retracement'
          ? renderPreviewItem(
              '반납 금액',
              formatMoney(position.retracedProfitAmount, position.currency),
              `${formatPercent(position.retracedProfitPercent)} 반납`,
              position.retracedProfitAmount > 0 ? 'down' : 'flat'
            )
          : ''
      }
      ${
        position?.expectedAnnualDividend &&
        position?.totalReturnRetracedAmount !== null &&
        position?.totalReturnRetracedAmount !== undefined &&
        position?.alertType === 'profit_retracement'
          ? renderPreviewItem(
              '배당 포함 반납률',
              formatMoney(position.totalReturnRetracedAmount, position.currency),
              `${formatPercent(position.totalReturnRetracedPercent)} 반납`,
              position.totalReturnRetracedAmount > 0 ? 'down' : 'flat'
            )
          : ''
      }
      ${position?.annualDividendPerShare ? renderPreviewItem('주당 연 배당금', formatMoney(position.annualDividendPerShare, position.currency)) : ''}
      ${position?.expectedAnnualDividend ? renderPreviewItem('예상 연 배당금', formatMoney(position.expectedAnnualDividend, position.currency), formatPercent(position.dividendYieldPercent)) : ''}
      ${dividendSchedule?.frequency ? renderPreviewItem('배당 주기', getDividendFrequencyLabel(dividendSchedule.frequency), formatDividendMonths(dividendSchedule.months)) : ''}
      ${dividendSchedule?.paymentAmount ? renderPreviewItem('1회 예상 배당금', formatMoney(dividendSchedule.paymentAmount, position.currency), `${dividendSchedule.paymentCount}회 기준`) : ''}
      ${
        position?.unrealizedProfit !== null && position?.unrealizedProfit !== undefined
          ? renderPreviewItem(
              '평가손익',
              formatSignedMoney(position.unrealizedProfit, position.currency),
              formatSignedPercent(position.unrealizedProfitPercent),
              getProfitClass(position.unrealizedProfit)
            )
          : ''
      }
      ${
        position?.expectedAnnualDividend &&
        position?.totalReturnAmount !== null &&
        position?.totalReturnAmount !== undefined
          ? renderPreviewItem(
              '배당 포함 손익',
              formatSignedMoney(position.totalReturnAmount, position.currency),
              formatSignedPercent(position.totalReturnPercent),
              getProfitClass(position.totalReturnAmount)
            )
          : ''
      }
      ${position ? renderPreviewItem(position.metricLabel || '현재 하락률', formatMetricPercent(position), '', statusClass) : ''}
      ${renderPreviewItem('상태', statusText, position ? formatDistancePercent(position) : '', statusClass)}
    </div>
    ${position ? renderAlertRuleComparison(position, quote) : ''}
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

function renderAlertRuleComparison(position, quote) {
  const rows = buildAlertRuleComparisonRows(position, quote);

  if (!rows.length) {
    return '';
  }

  return `
    <div class="alert-comparison" aria-label="알림 기준별 예상 결과">
      <div class="alert-comparison-header">
        <span>기준별 예상 결과</span>
        <span>${escapeHtml(formatMoney(quote.price, position.currency || quote.currency))} 기준</span>
      </div>
      <div class="alert-comparison-grid">
        ${rows.map(renderAlertRuleComparisonRow).join('')}
      </div>
    </div>
  `;
}

function renderAlertRuleComparisonRow(row) {
  return `
    <div class="alert-comparison-row ${row.selected ? 'selected' : ''}">
      <span class="alert-comparison-type">${escapeHtml(row.label)}</span>
      <span class="alert-comparison-price">${escapeHtml(row.thresholdText)}</span>
      <span class="alert-comparison-detail">${escapeHtml(row.detail)}</span>
      <span class="alert-comparison-status ${escapeHtml(row.statusClass)}">${escapeHtml(row.status)}</span>
    </div>
  `;
}

function buildAlertRuleComparisonRows(position, quote) {
  const currentPrice = parseFiniteNumber(quote.price);
  const currency = position.currency || quote.currency;
  const highPrice = parseFiniteNumber(position.highPrice);
  const purchasePrice = parseFiniteNumber(position.purchasePrice);
  const thresholdPercent =
    parseFiniteNumber(elements.form.elements.thresholdPercent.value) ??
    parseFiniteNumber(position.thresholdPercent) ??
    5;
  const targetPrice =
    parseFiniteNumber(elements.form.elements.targetPrice.value) ??
    parseFiniteNumber(position.targetPrice);
  const rows = [];

  if (currentPrice === null) {
    return rows;
  }

  if (highPrice !== null) {
    const thresholdPrice = calculateThreshold(highPrice, thresholdPercent);
    const metric = calculateDrawdown(highPrice, currentPrice);
    rows.push(
      buildAlertRuleComparisonRow({
        type: 'high_drawdown',
        label: '최고가 대비',
        thresholdPrice,
        currentPrice,
        currency,
        detail: `${formatAlertMetricPercent(metric)} · ${formatPercent(thresholdPercent)} 기준`,
        selectedType: position.alertType
      })
    );
  }

  if (highPrice !== null && purchasePrice !== null && highPrice > purchasePrice) {
    const thresholdPrice = highPrice - (highPrice - purchasePrice) * (thresholdPercent / 100);
    const retracement = Math.max(0, ((highPrice - currentPrice) / (highPrice - purchasePrice)) * 100);
    rows.push(
      buildAlertRuleComparisonRow({
        type: 'profit_retracement',
        label: '이익금 반납',
        thresholdPrice,
        currentPrice,
        currency,
        detail: `${formatPercent(retracement)} 반납 · ${formatPercent(thresholdPercent)} 기준`,
        selectedType: position.alertType
      })
    );
  }

  if (purchasePrice !== null) {
    const thresholdPrice = calculateThreshold(purchasePrice, thresholdPercent);
    const metric = calculateDrawdown(purchasePrice, currentPrice);
    rows.push(
      buildAlertRuleComparisonRow({
        type: 'purchase_loss',
        label: '매수가 손절',
        thresholdPrice,
        currentPrice,
        currency,
        detail: `${formatAlertMetricPercent(metric)} · ${formatPercent(thresholdPercent)} 기준`,
        selectedType: position.alertType
      })
    );
  }

  if (targetPrice !== null) {
    const metric = calculateDrawdown(targetPrice, currentPrice);
    rows.push(
      buildAlertRuleComparisonRow({
        type: 'target_price',
        label: '직접 기준가',
        thresholdPrice: targetPrice,
        currentPrice,
        currency,
        detail: `${formatAlertMetricPercent(metric)} · 직접 입력`,
        selectedType: position.alertType
      })
    );
  }

  return rows;
}

function buildAlertRuleComparisonRow({
  type,
  label,
  thresholdPrice,
  currentPrice,
  currency,
  detail,
  selectedType
}) {
  const distance = thresholdPrice === null ? null : currentPrice - thresholdPrice;
  const triggered = distance !== null && distance <= 0;

  return {
    type,
    label,
    thresholdText: formatMoney(thresholdPrice, currency),
    detail,
    status: distance === null ? '대기' : triggered ? '알림' : `여유 ${formatMoney(distance, currency)}`,
    statusClass: distance === null ? 'flat' : triggered ? 'down' : 'ok',
    selected: selectedType === type
  };
}

function renderRegistrationSummary() {
  const form = elements.form;
  const symbol = form.elements.symbol.value.trim().toUpperCase() || '-';
  const displayName = form.elements.displayName.value.trim();
  const purchasePrice = parseFiniteNumber(form.elements.purchasePrice.value);
  const quantity = parseFiniteNumber(form.elements.quantity.value);
  const annualDividendPerShare = parseFiniteNumber(form.elements.annualDividendPerShare.value);
  const dividendFrequency = form.elements.dividendFrequency.value;
  const dividendMonths = parseDividendMonths(form.elements.dividendMonths.value);
  const purchaseDate = form.elements.purchaseDate.value;
  const purchaseDateDetail = purchaseDate || '미입력 시 등록 이후 감시 최고가 기준';
  const kisMarketDivCode = form.elements.kisMarketDivCode.value;
  const alertType = form.elements.alertType.value;
  const thresholdPercent = parseFiniteNumber(form.elements.thresholdPercent.value);
  const targetPrice = parseFiniteNumber(form.elements.targetPrice.value);
  const cooldown = parseFiniteNumber(form.elements.alertCooldownMinutes.value);
  const investmentTargetPrice = parseFiniteNumber(form.elements.investmentTargetPrice.value);
  const investmentReason = form.elements.investmentReason.value.trim();
  const sellCondition = form.elements.sellCondition.value.trim();
  const reviewDate = form.elements.reviewDate.value;
  const notes = form.elements.notes.value.trim();
  const alertDetail =
    alertType === 'target_price'
      ? `기준가 ${formatMoney(targetPrice)}`
      : `${
          alertType === 'purchase_loss'
            ? '손절률'
            : alertType === 'profit_retracement'
              ? '이익금 반납률'
              : '하락률'
        } ${thresholdPercent ?? '-'}%`;
  const purchaseAmount =
    purchasePrice !== null && quantity !== null ? purchasePrice * quantity : null;
  const expectedAnnualDividend =
    quantity !== null && annualDividendPerShare !== null ? quantity * annualDividendPerShare : null;
  const dividendYield =
    expectedAnnualDividend !== null && purchaseAmount ? (expectedAnnualDividend / purchaseAmount) * 100 : null;
  const dividendSchedule = getDividendSchedule({
    quantity,
    annualDividendPerShare,
    dividendFrequency,
    dividendMonths
  });
  const dividendScheduleDetail =
    dividendSchedule.paymentAmount !== null
      ? `1회 ${formatMoney(dividendSchedule.paymentAmount)} · ${formatDividendMonths(dividendSchedule.months)}`
      : dividendSchedule.frequency
        ? formatDividendMonths(dividendSchedule.months)
        : '선택 입력';
  const planSummary = [
    investmentReason ? '매수 이유 입력' : '',
    investmentTargetPrice ? `목표 ${formatMoney(investmentTargetPrice)}` : '',
    sellCondition ? '매도 조건 입력' : '',
    reviewDate ? `점검 ${formatDateOnly(reviewDate)}` : ''
  ].filter(Boolean);

  elements.registrationSummary.innerHTML = `
    <div class="registration-summary-grid">
      ${renderSummaryItem('종목', displayName ? `${displayName} · ${symbol}` : symbol)}
      ${renderSummaryItem('시세 기준', formatKisMarketDivCodeLabel(kisMarketDivCode), 'KIS provider 사용 시 적용')}
      ${renderSummaryItem('매수가', formatMoney(purchasePrice), purchaseDateDetail)}
      ${renderSummaryItem('보유 수량', quantity ? formatQuantity(quantity) : '-', purchaseAmount ? `총 ${formatMoney(purchaseAmount)}` : '선택 입력')}
      ${renderSummaryItem('배당', annualDividendPerShare ? `주당 ${formatMoney(annualDividendPerShare)}` : '-', expectedAnnualDividend ? `연 ${formatMoney(expectedAnnualDividend)} · ${formatPercent(dividendYield)}` : '선택 입력')}
      ${renderSummaryItem('배당 일정', getDividendFrequencyLabel(dividendFrequency), dividendScheduleDetail)}
      ${renderSummaryItem('알림 기준', getAlertTypeLabel({ alertType }), alertDetail)}
      ${renderSummaryItem('투자 계획', planSummary.length ? planSummary.join(' · ') : '-', notes || '선택 입력')}
      ${renderSummaryItem('반복 알림', cooldown ? `${cooldown}분마다` : '-', '기준가 이하 반복 알림')}
    </div>
  `;
}

function renderSummaryItem(label, value, detail = '') {
  return `
    <div class="registration-summary-item">
      <span class="registration-summary-label">${escapeHtml(label)}</span>
      <span class="registration-summary-value">${escapeHtml(value || '-')}</span>
      <span class="registration-summary-detail">${escapeHtml(detail || '-')}</span>
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
  elements.pollStatus.textContent = `시세 ${data.pollIntervalSeconds || 60}초 · 배당 ${formatInterval(data.dividendRefreshIntervalSeconds || 86400)} · 배당알림 ${formatDividendEventAlertSetting(data)}`;
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
      ${renderServerMetric('일봉', formatProviderList(health.historicalQuoteProviders || health.quoteProviders), '최고가 계산용')}
      ${renderServerMetric('배당', formatProviderList(health.dividendProviders), `${formatInterval(health.dividendRefreshIntervalSeconds || 86400)} 주기`)}
      ${renderServerMetric('배당 알림', formatDividendEventAlertSetting(health), getLastDividendEventAlertDetail(health.lastDividendEventAlert))}
      ${renderServerMetric('브리핑', formatDailyBriefingSetting(health), getLastDailyBriefingDetail(health.lastDailyBriefing))}
      ${renderServerMetric('명령', formatDate(health.lastTelegramCommandPoll?.checkedAt), `${health.telegramCommandPollSeconds || 5}초 주기`)}
      ${renderServerMetric('마지막 확인', formatDate(health.lastCheck?.checkedAt), getLastCheckDetail(health.lastCheck))}
      ${renderServerMetric('배당 갱신', formatDate(health.lastDividendRefresh?.checkedAt), getLastDividendRefreshDetail(health.lastDividendRefresh))}
      ${renderServerMetric('포트', String(health.port || '-'), `HOST ${health.host || '-'}`)}
      ${renderServerMetric('데이터', shortenPath(health.dataDir), formatStorageEngine(health.storageEngine))}
      ${renderServerMetric('데이터 모델', formatDataModelVersion(health.dataModel), formatDataModelStoreSummary(health.dataModel?.store))}
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

function renderKisSmokeTestResult(result) {
  if (!elements.kisSmokeTestResult) {
    return;
  }

  if (!result) {
    elements.kisSmokeTestResult.innerHTML = `
      <div class="kis-smoke-empty">
        KIS 앱 키와 시크릿을 .env에 넣은 뒤 점검을 실행하면 토큰 상태와 시장별 현재가 결과가 표시됩니다.
      </div>
    `;
    return;
  }

  const statusClass = result.ok ? 'ok' : 'error';
  const statusLabel = result.ok ? '성공' : '실패';
  const summary = result.summary || {};
  const rows = Array.isArray(result.results) ? result.results : [];

  elements.kisSmokeTestResult.innerHTML = `
    <div class="kis-smoke-summary ${statusClass}">
      <div>
        <div class="kis-smoke-heading">
          <strong>${escapeHtml(result.symbol || '-')}</strong>
          <span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="kis-smoke-meta">
          <span>KIS 입력 ${escapeHtml(result.inputSymbol || '-')}</span>
          <span>시장 ${escapeHtml(formatKisSmokeMarketList(result.markets))}</span>
          <span>생성 ${escapeHtml(formatDate(result.generatedAt))}</span>
        </div>
      </div>
      <div class="kis-smoke-counts">
        <span>전체 ${escapeHtml(summary.total || 0)}</span>
        <span>성공 ${escapeHtml(summary.success || 0)}</span>
        <span>실패 ${escapeHtml(summary.failed || 0)}</span>
      </div>
    </div>
    <div class="kis-smoke-token">
      <span class="server-metric-label">토큰</span>
      <span>${escapeHtml(formatKisSmokeTokenDetail(result.token))}</span>
    </div>
    ${
      result.message
        ? `<div class="kis-smoke-message ${statusClass}">${escapeHtml(result.message)}</div>`
        : ''
    }
    ${
      rows.length
        ? `<div class="kis-smoke-market-list">${rows.map(renderKisSmokeMarketResult).join('')}</div>`
        : ''
    }
  `;
}

function renderKisSmokeMarketResult(item) {
  const statusClass = item.ok ? 'ok' : 'error';
  const quote = item.quote || {};
  const attempts = Array.isArray(item.attempts) ? item.attempts : [];
  const marketLabel = [item.market, item.marketLabel].filter(Boolean).join(' / ') || '-';
  const quoteTitle = quote.name || quote.symbol || '-';
  const quoteMeta = item.ok
    ? [
        formatMoney(quote.price, quote.currency),
        quote.exchange || quote.providerLabel || getProviderLabel(quote.provider),
        quote.regularMarketTime ? formatDate(quote.regularMarketTime) : ''
      ].filter(Boolean)
    : [item.error || '현재가 조회 실패'];

  return `
    <div class="dividend-diagnostic-row ${statusClass}">
      <div class="dividend-diagnostic-main">
        <span class="dividend-diagnostic-stock">${escapeHtml(marketLabel)}</span>
        <span class="status-badge ${statusClass}">${escapeHtml(item.ok ? '성공' : '실패')}</span>
      </div>
      <div class="dividend-diagnostic-meta">
        <span>${escapeHtml(quoteTitle)}</span>
        ${quoteMeta.map((part) => `<span>${escapeHtml(part)}</span>`).join('')}
      </div>
      ${item.error ? `<div class="dividend-diagnostic-error">${escapeHtml(item.error)}</div>` : ''}
      ${
        attempts.length
          ? `<div class="dividend-attempt-list">${attempts.map(renderKisSmokeAttempt).join('')}</div>`
          : ''
      }
    </div>
  `;
}

function renderKisSmokeAttempt(attempt) {
  const status = attempt.status === 'success' ? 'success' : attempt.status === 'skipped' ? 'muted' : 'error';
  const detail =
    attempt.status === 'success'
      ? `성공 ${formatDurationMs(attempt.durationMs)}`
      : attempt.error || getQuoteProviderReasonLabel(attempt.reason) || getQuoteProviderStatusLabel(attempt.status);

  return `
    <span class="dividend-attempt ${status}">
      <strong>${escapeHtml(getProviderLabel(attempt.provider))}</strong>
      <span>${escapeHtml(detail)}</span>
    </span>
  `;
}

function formatKisSmokeMarketList(markets = []) {
  if (!Array.isArray(markets) || !markets.length) {
    return '-';
  }

  return markets.map((market) => `${market.code || '-'} ${market.label || ''}`.trim()).join(', ');
}

function formatKisSmokeTokenDetail(token = {}) {
  if (!token.available) {
    return token.cachePath
      ? `사용 불가 · 캐시 ${shortenPath(token.cachePath)}`
      : '사용 불가';
  }

  const sourceLabels = {
    env: '환경변수',
    cache: '캐시',
    issued: '신규 발급'
  };
  const parts = [
    sourceLabels[token.source] || token.source || '확인됨',
    token.cached ? '캐시 사용' : '',
    token.expiresAt ? `만료 ${formatDate(token.expiresAt)}` : '만료 시각 없음',
    token.cachePath ? `캐시 ${shortenPath(token.cachePath)}` : ''
  ];

  return parts.filter(Boolean).join(' · ');
}

function formatDataModelVersion(dataModel) {
  const version = Number(dataModel?.schemaVersion);

  return Number.isInteger(version) && version > 0 ? `v${version}` : '-';
}

function formatDataModelStoreSummary(store) {
  const counts = store?.counts;

  if (!counts) {
    return '스키마 요약 없음';
  }

  return `종목 ${counts.stocks || 0} · 알림 ${counts.alerts || 0} · 기기 ${counts.devices || 0}`;
}

function formatStorageEngine(engine) {
  const value = String(engine || 'json').trim().toLowerCase();

  if (value === 'json') {
    return 'JSON 저장소';
  }

  if (value === 'postgres') {
    return 'Postgres 저장소';
  }

  return `${value || '-'} 저장소`;
}

function renderRoadmap(roadmap) {
  if (!roadmap) {
    renderRoadmapError(new Error('로드맵 문서를 찾지 못했습니다.'));
    return;
  }

  const summary = roadmap.summary || {};
  const completed = summary.completed || 0;
  const inProgress = summary.in_progress || 0;
  const pending = summary.pending || 0;
  const paused = summary.paused || 0;
  const total = summary.total || 0;
  const nextTask = roadmap.nextTask || {};
  const recommendedOrder = Array.isArray(roadmap.recommendedOrder) ? roadmap.recommendedOrder : [];
  const sections = Array.isArray(roadmap.sections) ? roadmap.sections : [];

  elements.roadmapSummary.textContent = `${roadmap.dateLabel || '날짜 미상'} · 완료 ${completed}/${total} · 진행중 ${inProgress} · 예정 ${pending} · 보류 ${paused}`;
  elements.roadmapPanel.innerHTML = `
    <div class="roadmap-hero">
      <div class="roadmap-next">
        <span class="roadmap-eyebrow">다음 개발</span>
        <strong>${escapeHtml(nextTask.title || '다음 작업 없음')}</strong>
        <p>${escapeHtml(nextTask.summary || '문서의 다음 작업 영역을 확인하세요.')}</p>
      </div>
      <div class="roadmap-stats" aria-label="로드맵 진행 현황">
        ${renderRoadmapStat('완료', `${completed}/${total}`, '전체 작업 기준', 'done')}
        ${renderRoadmapStat('진행중', String(inProgress), '부분 완료 포함', 'active')}
        ${renderRoadmapStat('예정', String(pending), '착수 대기', 'pending')}
        ${renderRoadmapStat('보류', String(paused), '후속 검토', 'paused')}
      </div>
    </div>
    ${
      recommendedOrder.length
        ? `<div class="roadmap-order" aria-label="추천 진행 순서">
            ${recommendedOrder
              .map((item, index) => `<span><b>${index + 1}</b>${escapeHtml(item)}</span>`)
              .join('')}
          </div>`
        : ''
    }
    <div class="roadmap-section-list">
      ${sections.map(renderRoadmapSection).join('')}
    </div>
  `;
}

function renderRoadmapError(error) {
  elements.roadmapSummary.textContent = 'WBS 확인 실패';
  elements.roadmapPanel.innerHTML = `
    <div class="message show error">${escapeHtml(error.message || '로드맵을 확인하지 못했습니다.')}</div>
  `;
}

function renderRoadmapStat(label, value, detail, type) {
  return `
    <div class="roadmap-stat ${escapeHtml(type || '')}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function renderRoadmapSection(section) {
  const summary = section.summary || {};
  const total = summary.total || 0;
  const completed = summary.completed || 0;
  const inProgress = summary.in_progress || 0;
  const progress = total ? Math.round(((completed + inProgress * 0.5) / total) * 100) : 0;
  const tasks = Array.isArray(section.tasks) ? section.tasks : [];

  return `
    <section class="roadmap-section">
      <div class="roadmap-section-head">
        <div>
          <span class="roadmap-section-id">${escapeHtml(section.id || '-')}</span>
          <strong>${escapeHtml(section.title || '-')}</strong>
          <p>${escapeHtml(section.goal || '')}</p>
        </div>
        <div class="roadmap-section-count">${completed}/${total}</div>
      </div>
      <div class="roadmap-progress" aria-label="진행률 ${progress}%">
        <span style="width: ${progress}%"></span>
      </div>
      ${section.statusNote ? `<div class="roadmap-note">${escapeHtml(section.statusNote)}</div>` : ''}
      <div class="roadmap-task-list">
        ${tasks.map(renderRoadmapTask).join('')}
      </div>
    </section>
  `;
}

function renderRoadmapTask(task) {
  const statusClass = getRoadmapStatusClass(task.status);

  return `
    <div class="roadmap-task-row ${statusClass}">
      <span class="roadmap-task-id">${escapeHtml(task.id || '-')}</span>
      <div class="roadmap-task-main">
        <strong>${escapeHtml(task.task || '-')}</strong>
        <span>${escapeHtml(task.output || '-')}</span>
      </div>
      <span class="roadmap-task-priority">${escapeHtml(task.priority ? `우선 ${task.priority}` : '우선 -')}</span>
      <span class="roadmap-status-badge ${statusClass}">${escapeHtml(task.statusLabel || getRoadmapStatusLabel(task.status))}</span>
      <span class="roadmap-task-estimate">${escapeHtml(task.estimate || '-')}</span>
    </div>
  `;
}

function getRoadmapStatusClass(status) {
  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'in_progress') {
    return 'in-progress';
  }

  if (status === 'paused') {
    return 'paused';
  }

  return 'pending';
}

function getRoadmapStatusLabel(status) {
  if (status === 'completed') {
    return '완료';
  }

  if (status === 'in_progress') {
    return '진행중';
  }

  if (status === 'paused') {
    return '보류';
  }

  return '예정';
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

function getLastDividendRefreshDetail(lastRefresh) {
  if (!lastRefresh) {
    return '아직 실행 전';
  }

  if (lastRefresh.skipped) {
    return lastRefresh.reason || '건너뜀';
  }

  if (lastRefresh.error) {
    return lastRefresh.error;
  }

  const counts = countDividendRefreshResults(lastRefresh);
  return `확인 ${counts.checked}개 · 업데이트 ${counts.updated}개 · 실패 ${counts.error}개`;
}

function formatDailyBriefingSetting(data) {
  if (!data?.dailyBriefingEnabled) {
    return '꺼짐';
  }

  return data.dailyBriefingTime || '16:10';
}

function formatDividendEventAlertSetting(data) {
  if (!data?.dividendEventAlertEnabled) {
    return '꺼짐';
  }

  return formatInterval(data.dividendEventAlertCheckIntervalSeconds || 3600);
}

function getLastDividendEventAlertDetail(lastAlert) {
  if (!lastAlert) {
    return '아직 확인 전';
  }

  if (lastAlert.skipped) {
    return lastAlert.reason || '건너뜀';
  }

  if (lastAlert.error) {
    return lastAlert.error;
  }

  const summary = lastAlert.summary || {};
  return `대상 ${summary.due || 0}개 · 전송 ${summary.sent || 0}개 · 중복 ${summary.alreadySent || 0}개`;
}

function getLastDailyBriefingDetail(lastBriefing) {
  if (!lastBriefing) {
    return '아직 전송 전';
  }

  if (lastBriefing.skipped) {
    return lastBriefing.reason || '건너뜀';
  }

  if (lastBriefing.error) {
    return lastBriefing.error;
  }

  if (lastBriefing.deliveryStatus === 'sent') {
    const dateText = lastBriefing.dateKey ? `${lastBriefing.dateKey} 전송` : '전송 완료';
    return lastBriefing.checkedAt ? `${dateText} · ${formatDate(lastBriefing.checkedAt)}` : dateText;
  }

  if (lastBriefing.deliveryStatus === 'not_configured') {
    return '텔레그램 미설정';
  }

  if (lastBriefing.deliveryStatus === 'failed') {
    return lastBriefing.deliveryError || '전송 실패';
  }

  return lastBriefing.checkedAt ? formatDate(lastBriefing.checkedAt) : '-';
}

function countDividendRefreshResults(result) {
  const counts = {
    checked: 0,
    updated: 0,
    error: 0,
    skipped: 0
  };
  const results = Array.isArray(result?.results) ? result.results : [];

  for (const item of results) {
    if (item.status === 'updated') {
      counts.updated += 1;
      counts.checked += 1;
    } else if (item.status === 'checked') {
      counts.checked += 1;
    } else if (item.status === 'error') {
      counts.error += 1;
      counts.checked += 1;
    } else if (item.status === 'skipped') {
      counts.skipped += 1;
    }
  }

  return counts;
}

function renderDividendDiagnostics(lastRefresh) {
  if (!elements.dividendDiagnosticsPanel) {
    return;
  }

  const stocksWithDiagnostics = state.stocks
    .map((stock) => ({
      stock,
      diagnostic: stock.dividendLastDiagnostic
    }))
    .filter((item) => item.diagnostic)
    .sort((left, right) => getDiagnosticTime(right.diagnostic) - getDiagnosticTime(left.diagnostic));

  if (!state.stocks.length) {
    elements.dividendDiagnosticsPanel.innerHTML = '';
    return;
  }

  const counts = countDividendRefreshResults(lastRefresh);
  const latestRows = stocksWithDiagnostics.slice(0, 5);
  const checkedAt = lastRefresh?.checkedAt || latestRows[0]?.diagnostic?.checkedAt || '';
  const summaryDetail = lastRefresh
    ? `확인 ${counts.checked}개 · 업데이트 ${counts.updated}개 · 실패 ${counts.error}개`
    : latestRows.length
      ? `${latestRows.length}개 종목에 이전 진단 이력이 있습니다.`
      : '아직 자동 갱신 이력이 없습니다.';

  elements.dividendDiagnosticsPanel.innerHTML = `
    <div class="dividend-diagnostics-head">
      <div>
        <div class="dividend-diagnostics-title">배당 API 진단</div>
        <div class="dividend-diagnostics-subtitle">${escapeHtml(summaryDetail)}</div>
      </div>
      <div class="dividend-diagnostics-time">${escapeHtml(formatDate(checkedAt))}</div>
    </div>
    ${
      latestRows.length
        ? `<div class="dividend-diagnostics-list">${latestRows.map(renderDividendDiagnosticRow).join('')}</div>`
        : '<div class="dividend-diagnostics-empty">배당 새로고침을 실행하면 provider별 성공/실패 내역이 표시됩니다.</div>'
    }
  `;
}

function renderQuoteDiagnostics(stats) {
  if (!elements.quoteDiagnosticsPanel) {
    return;
  }

  const providers = Array.isArray(stats?.providers) ? stats.providers : [];

  if (!state.stocks.length && !providers.length) {
    elements.quoteDiagnosticsPanel.innerHTML = '';
    return;
  }

  const totals = providers.reduce(
    (acc, provider) => {
      acc.attempts += Number(provider.attempts || 0);
      acc.success += Number(provider.success || 0);
      acc.error += Number(provider.error || 0);
      acc.skipped += Number(provider.skipped || 0);
      return acc;
    },
    {
      attempts: 0,
      success: 0,
      error: 0,
      skipped: 0
    }
  );
  const measured = totals.success + totals.error;
  const failureRate = measured ? (totals.error / measured) * 100 : 0;
  const summaryDetail = providers.length
    ? `성공 ${totals.success}회 · 실패 ${totals.error}회 · 실패율 ${formatPercent(failureRate)} · 스킵 ${totals.skipped}회`
    : '아직 시세 provider 진단 이력이 없습니다.';

  elements.quoteDiagnosticsPanel.innerHTML = `
    <div class="dividend-diagnostics-head">
      <div>
        <div class="dividend-diagnostics-title">시세 provider 진단</div>
        <div class="dividend-diagnostics-subtitle">${escapeHtml(summaryDetail)}</div>
      </div>
      <div class="dividend-diagnostics-time">${escapeHtml(formatDate(stats?.updatedAt))}</div>
    </div>
    ${
      providers.length
        ? `<div class="dividend-diagnostics-list">${providers.map(renderQuoteProviderDiagnosticRow).join('')}</div>`
        : '<div class="dividend-diagnostics-empty">즉시 확인 또는 자동 확인이 실행되면 provider별 성공/실패율이 표시됩니다.</div>'
    }
  `;
}

function renderQuoteProviderDiagnosticRow(provider) {
  const statusClass = getQuoteProviderStatusClass(provider.lastStatus);
  const measured = Number(provider.success || 0) + Number(provider.error || 0);
  const failureRate = measured ? Number(provider.failureRatePercent || 0) : 0;
  const lastDetail = formatQuoteProviderLastDetail(provider);

  return `
    <div class="dividend-diagnostic-row ${statusClass}">
      <div class="dividend-diagnostic-main">
        <span class="dividend-diagnostic-stock">${escapeHtml(getProviderLabel(provider.provider))}</span>
        <span class="status-badge ${statusClass}">${escapeHtml(getQuoteProviderStatusLabel(provider.lastStatus))}</span>
      </div>
      <div class="dividend-diagnostic-meta">
        <span>성공 ${escapeHtml(provider.success || 0)}회</span>
        <span>실패 ${escapeHtml(provider.error || 0)}회</span>
        <span>실패율 ${escapeHtml(formatPercent(failureRate))}</span>
        <span>스킵 ${escapeHtml(provider.skipped || 0)}회</span>
        <span>평균 ${escapeHtml(formatDurationMs(provider.averageDurationMs))}</span>
        <span>${escapeHtml(lastDetail)}</span>
      </div>
      ${
        provider.lastError || provider.lastReason
          ? `<div class="dividend-diagnostic-error">${escapeHtml(provider.lastError || getQuoteProviderReasonLabel(provider.lastReason))}</div>`
          : ''
      }
    </div>
  `;
}

function getQuoteProviderStatusClass(status) {
  if (status === 'success') {
    return 'ok';
  }

  if (status === 'skipped') {
    return 'muted';
  }

  return 'error';
}

function getQuoteProviderStatusLabel(status) {
  const labels = {
    success: '성공',
    error: '실패',
    skipped: '스킵'
  };

  return labels[status] || '대기';
}

function formatQuoteProviderLastDetail(provider) {
  const parts = [];

  if (provider.lastSymbol) {
    parts.push(provider.lastSymbol);
  }

  if (provider.lastType) {
    parts.push(provider.lastType === 'historical' ? '일봉' : '현재가');
  }

  if (provider.lastCheckedAt) {
    parts.push(formatDate(provider.lastCheckedAt));
  }

  return parts.filter(Boolean).join(' · ') || '-';
}

function getQuoteProviderReasonLabel(reason) {
  const labels = {
    not_korean_symbol: '한국 종목이 아니어서 건너뜀',
    korean_symbol_not_supported: '한국 종목 미지원',
    missing_alpha_vantage_key: 'Alpha Vantage 키 없음',
    missing_data_go_kr_service_key: '공공데이터포털 키 없음',
    missing_nxt_quote_endpoint: 'NXT endpoint 없음',
    missing_kis_credentials: 'KIS 키 또는 토큰 없음',
    historical_not_supported: '일봉 조회 미지원',
    historical_only_provider: '일봉 전용 provider',
    unsupported_provider: '지원하지 않는 provider'
  };

  return labels[reason] || reason || '';
}

function renderDividendDiagnosticRow({ stock, diagnostic }) {
  const statusClass = getDividendDiagnosticStatusClass(diagnostic.status);
  const statusLabel = getDividendDiagnosticStatusLabel(diagnostic.status);
  const attempts = Array.isArray(diagnostic.attempts) ? diagnostic.attempts : [];
  const provider = diagnostic.provider ? getProviderLabel(diagnostic.provider) : '-';
  const appliedValue =
    diagnostic.annualDividendPerShare !== null && diagnostic.annualDividendPerShare !== undefined
      ? formatMoney(diagnostic.annualDividendPerShare, diagnostic.currency || stock.currency)
      : diagnostic.preservedAnnualDividendPerShare
        ? `${formatMoney(diagnostic.preservedAnnualDividendPerShare, stock.currency)} 유지`
        : '-';

  return `
    <div class="dividend-diagnostic-row ${statusClass}">
      <div class="dividend-diagnostic-main">
        <span class="dividend-diagnostic-stock">${escapeHtml(stock.displayName || stock.symbol)}</span>
        <span class="dividend-diagnostic-symbol">${escapeHtml(stock.symbol)}</span>
        <span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="dividend-diagnostic-meta">
        <span>적용값 ${escapeHtml(appliedValue)}</span>
        ${diagnostic.lastDividendValue ? `<span>최근 배당 ${escapeHtml(formatMoney(diagnostic.lastDividendValue, diagnostic.currency || stock.currency))}</span>` : ''}
        ${diagnostic.exDividendDate ? `<span>배당락 ${escapeHtml(formatDateOnly(diagnostic.exDividendDate))}</span>` : ''}
        ${diagnostic.dividendDate ? `<span>지급 ${escapeHtml(formatDateOnly(diagnostic.dividendDate))}</span>` : ''}
        <span>출처 ${escapeHtml(provider)}</span>
        <span>${escapeHtml(formatDate(diagnostic.checkedAt))}</span>
      </div>
      ${diagnostic.error ? `<div class="dividend-diagnostic-error">${escapeHtml(diagnostic.error)}</div>` : ''}
      ${
        attempts.length
          ? `<div class="dividend-attempt-list">${attempts.map((attempt) => renderDividendAttempt(attempt, stock)).join('')}</div>`
          : ''
      }
    </div>
  `;
}

function renderDividendAttempt(attempt, stock) {
  const status = attempt.status === 'success' ? 'success' : 'error';
  const value =
    status === 'success'
      ? formatDividendAttemptValue(attempt, stock)
      : attempt.error || '실패';

  return `
    <span class="dividend-attempt ${status}">
      <strong>${escapeHtml(getProviderLabel(attempt.provider))}</strong>
      <span>${escapeHtml(value)}</span>
    </span>
  `;
}

function formatDividendAttemptValue(attempt, stock) {
  const parts = [
    formatMoney(attempt.annualDividendPerShare, attempt.currency || stock.currency)
  ];

  if (attempt.exDividendDate) {
    parts.push(`락 ${formatDateOnly(attempt.exDividendDate)}`);
  }

  if (attempt.dividendDate) {
    parts.push(`지급 ${formatDateOnly(attempt.dividendDate)}`);
  }

  return parts.filter(Boolean).join(' · ');
}

function getDividendDiagnosticStatusClass(status) {
  if (status === 'updated' || status === 'checked') {
    return 'ok';
  }

  if (status === 'skipped') {
    return 'muted';
  }

  return 'error';
}

function getDividendDiagnosticStatusLabel(status) {
  const labels = {
    updated: '업데이트',
    checked: '확인',
    error: '실패',
    skipped: '건너뜀'
  };

  return labels[status] || '대기';
}

function getDiagnosticTime(diagnostic) {
  const time = new Date(diagnostic?.checkedAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatInterval(seconds) {
  const value = Number(seconds);

  if (!Number.isFinite(value) || value <= 0) {
    return '-';
  }

  if (value % 86400 === 0) {
    return `${value / 86400}일`;
  }

  if (value % 60 === 0) {
    return `${value / 60}분`;
  }

  return `${value}초`;
}

function shortenPath(value) {
  const text = String(value || '');

  if (text.length <= 36) {
    return text || '-';
  }

  return `...${text.slice(-33)}`;
}

function renderStocks() {
  const decoratedStocks = state.stocks.map((stock) => ({
    stock,
    watchStatus: getWatchStatus(stock)
  }));
  const visibleStocks = filterWatchStocks(decoratedStocks).sort(compareWatchStocks);

  renderWatchSummary(decoratedStocks, visibleStocks.length);
  renderPortfolioSummary(decoratedStocks);
  renderWatchControls();

  if (!state.stocks.length) {
    elements.stockList.innerHTML = '<div class="empty">등록된 종목이 없습니다.</div>';
    return;
  }

  if (!visibleStocks.length) {
    elements.stockList.innerHTML = '<div class="empty">선택한 조건에 맞는 종목이 없습니다.</div>';
    return;
  }

  elements.stockList.replaceChildren(
    ...visibleStocks.map(({ stock, watchStatus }) => {
      const row = document.createElement('article');
      row.className = `stock-row ${watchStatus.level}`;
      const alertMetric = calculateAlertMetric(stock, stock.lastPrice);
      const thresholdPrice = calculateAlertThreshold(stock);
      const lastPrice = parseFiniteNumber(stock.lastPrice);
      const isTriggered = thresholdPrice !== null && lastPrice !== null && lastPrice <= thresholdPrice;
      const quoteSourceSummary = formatQuoteSourceSummary(stock);
      const quoteSourceDetail = formatQuoteSourceDetail(stock);
      const highPriceDetail = formatHighPriceDetail(stock);
      const stockMeta = [
        stock.symbol,
        stock.kisMarketDivCode ? `KIS ${formatKisMarketDivCodeLabel(stock.kisMarketDivCode)}` : '',
        stock.active ? '' : '알림 꺼짐'
      ].filter(Boolean).join(' · ');

      row.innerHTML = `
        <div class="stock-risk-line">
          <span class="stock-risk-badge ${watchStatus.level}">${escapeHtml(watchStatus.label)}</span>
          <span class="stock-risk-detail">${escapeHtml(watchStatus.detail)}</span>
        </div>
        <div class="stock-top">
          <div class="stock-title stock-info">
            <div class="stock-name">${escapeHtml(stock.displayName || stock.symbol)}</div>
            <div class="stock-symbol">${escapeHtml(stockMeta)}</div>
            ${renderPositionSummary(stock)}
          </div>
          <div class="metric price-block">
            <span class="metric-label price-label">현재가</span>
            <span class="metric-value price-value">${formatMoney(stock.lastPrice, stock.currency)}</span>
            ${quoteSourceSummary ? `<span class="metric-detail price-unit">${escapeHtml(quoteSourceSummary)}</span>` : ''}
          </div>
          <div class="metric price-block">
            <span class="metric-label price-label">${getHighPriceLabel(stock)}</span>
            <span class="metric-value price-value">${formatMoney(stock.highPrice, stock.currency)}</span>
            <span class="metric-detail price-unit">${escapeHtml(highPriceDetail)}</span>
          </div>
          <div class="metric price-block">
            <span class="metric-label price-label">${escapeHtml(getAlertThresholdLabel(stock))}</span>
            <span class="metric-value price-value">${formatMoney(thresholdPrice, stock.currency)}</span>
          </div>
          <div class="metric change-block">
            <span class="metric-label price-label">${escapeHtml(getAlertMetricLabel(stock))}</span>
            <span class="metric-value change-pct ${isTriggered ? 'down' : 'up'}">${formatAlertMetricPercent(alertMetric, getAlertType(stock) !== 'profit_retracement')}</span>
          </div>
        </div>
        ${renderHoldingSummary(stock)}
        ${renderAveragingCalculator(stock)}
        ${renderDividendEventSummary(stock)}
        ${renderRetryFailurePanel(stock)}
        ${renderInvestmentPlanCard(stock)}
        <div class="stock-bottom">
          <div class="status-block">
            <span class="status-badge ${getStockStatusClass(stock)}"><span class="dot"></span>${getStockStatusLabel(stock)}</span>
            <span class="status-time">${formatStockStatusDetail(stock)}</span>
            ${quoteSourceSummary ? `<span class="status-src">시세 ${escapeHtml(quoteSourceSummary)}</span>` : ''}
            ${quoteSourceDetail ? `<span class="status-src">${escapeHtml(quoteSourceDetail)}</span>` : ''}
            ${stock.quoteRegularMarketTime ? `<span class="status-src">시세 시각 ${escapeHtml(formatDate(stock.quoteRegularMarketTime))}</span>` : ''}
            ${stock.lastError ? `<span class="metric-error">${escapeHtml(stock.lastError)}</span>` : ''}
          </div>
        </div>
      `;

      const actions = document.createElement('div');
      actions.className = 'stock-actions';
      actions.append(
        alertToggle(stock),
        manualTestForm(stock),
        ...(stock.lastCheckStatus === 'error'
          ? [
              actionButton('시세 재시도', 'btn btn-outline btn-sm secondary-button', () =>
                retryStockQuote(stock)
              )
            ]
          : []),
        ...(stock.dividendLastError
          ? [
              actionButton('배당 재시도', 'btn btn-outline btn-sm secondary-button', () =>
                retryStockDividend(stock)
              )
            ]
          : []),
        actionButton(state.editingStockId === stock.id ? '편집 닫기' : '편집', 'btn btn-ghost btn-sm secondary-button', () => {
          state.editingStockId = state.editingStockId === stock.id ? null : stock.id;
          renderStocks();
        }),
        actionButton(stock.purchaseDate ? '최고가 재계산' : '감시 최고가 초기화', 'btn btn-ghost btn-sm secondary-button', () =>
          patchStock(stock.id, { resetHighPrice: true })
        ),
        actionButton('삭제', 'btn btn-danger btn-sm danger-button', () => deleteStock(stock.id))
      );
      row.querySelector('.stock-bottom').append(actions);
      attachAveragingCalculator(row, stock);

      if (state.editingStockId === stock.id) {
        row.append(editStockForm(stock));
      }

      return row;
    })
  );
}

function renderWatchSummary(items, visibleCount) {
  const counts = {
    total: items.length,
    alert: 0,
    warning: 0,
    error: 0,
    inactive: 0
  };

  for (const item of items) {
    counts[item.watchStatus.level] = (counts[item.watchStatus.level] || 0) + 1;
  }

  elements.summaryText.textContent = `${visibleCount}개 표시 · 전체 ${counts.total}개`;
  elements.watchSummaryBar.replaceChildren(
    createWatchSummaryItem('전체', counts.total, 'muted'),
    createWatchSummaryItem('알림', counts.alert, 'alert'),
    createWatchSummaryItem('주의', counts.warning, 'warning'),
    createWatchSummaryItem('조회 실패', counts.error, 'error'),
    createWatchSummaryItem('알림 꺼짐', counts.inactive, 'inactive')
  );
}

function createWatchSummaryItem(label, value, level) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = `watch-summary-item ${level}`;
  item.dataset.watchFilter =
    level === 'muted' ? 'all' : level === 'warning' ? 'attention' : level;
  item.innerHTML = `
    <span class="watch-summary-label">${escapeHtml(label)}</span>
    <span class="watch-summary-value">${Number(value || 0)}</span>
  `;
  item.addEventListener('click', () => {
    state.watchFilter = item.dataset.watchFilter;
    renderStocks();
  });
  return item;
}

function renderPortfolioSummary(items) {
  const groups = buildPortfolioSummaryGroups(items.map(({ stock }) => stock));

  if (!groups.length) {
    elements.portfolioSummaryBar.innerHTML =
      '<div class="portfolio-summary-empty">보유 수량을 입력하면 평가손익과 전체 평가금액이 표시됩니다.</div>';
    return;
  }

  elements.portfolioSummaryBar.replaceChildren(
    ...groups.map((group) => {
      const item = document.createElement('div');
      const profitClass = getProfitClass(group.profit);
      const totalReturnClass = getProfitClass(group.totalReturnAmount);
      const maximumProfitClass = getProfitClass(group.maximumProfitAmount);
      const maximumTotalReturnClass = getProfitClass(group.maximumTotalReturnAmount);
      const retracedProfitClass = group.retracedProfitAmount > 0 ? 'down' : 'flat';
      const totalReturnRetracedClass = group.totalReturnRetracedAmount > 0 ? 'down' : 'flat';
      const dividendGrowthClass = getProfitClass(group.dividendGrowthAmount);
      item.className = `portfolio-summary-item ${profitClass}`;
      item.innerHTML = `
        <div class="portfolio-summary-head">
          <span>${escapeHtml(group.currencyLabel)}</span>
          <strong>${escapeHtml(group.count)}개 보유</strong>
        </div>
        <div class="portfolio-summary-grid">
          <span>총 매수금액</span>
          <strong>${escapeHtml(formatMoney(group.investmentAmount, group.currency))}</strong>
          <span>현재 평가금액</span>
          <strong>${escapeHtml(group.marketValue === null ? '-' : formatMoney(group.marketValue, group.currency))}</strong>
          <span>평가손익</span>
          <strong class="${profitClass}">${escapeHtml(formatSignedMoney(group.profit, group.currency))}</strong>
          <span>수익률</span>
          <strong class="${profitClass}">${escapeHtml(formatSignedPercent(group.profitPercent))}</strong>
          ${
            group.expectedAnnualDividend !== null
              ? `
                <span>배당 포함 손익</span>
                <strong class="${totalReturnClass}">${escapeHtml(group.totalReturnAmount === null ? '-' : formatSignedMoney(group.totalReturnAmount, group.currency))}</strong>
                <span>배당 포함 수익률</span>
                <strong class="${totalReturnClass}">${escapeHtml(formatSignedPercent(group.totalReturnPercent))}</strong>
              `
              : ''
          }
          <span>총 최대 수익금</span>
          <strong class="${maximumProfitClass}">${escapeHtml(formatSignedMoney(group.maximumProfitAmount, group.currency))}</strong>
          ${
            group.expectedAnnualDividend !== null
              ? `
                <span>배당 포함 최대 수익</span>
                <strong class="${maximumTotalReturnClass}">${escapeHtml(group.maximumTotalReturnAmount === null ? '-' : formatSignedMoney(group.maximumTotalReturnAmount, group.currency))}</strong>
              `
              : ''
          }
          <span>총 반납 금액</span>
          <strong class="${retracedProfitClass}">${escapeHtml(group.retracedProfitAmount === null ? '-' : formatMoney(group.retracedProfitAmount, group.currency))}</strong>
          <span>계좌 총 반납률</span>
          <strong class="${retracedProfitClass}">${escapeHtml(formatPercent(group.retracedProfitPercent))}</strong>
          ${
            group.expectedAnnualDividend !== null
              ? `
                <span>배당 포함 반납률</span>
                <strong class="${totalReturnRetracedClass}">${escapeHtml(formatPercent(group.totalReturnRetracedPercent))}</strong>
              `
              : ''
          }
          <span>예상 연 배당금</span>
          <strong>${escapeHtml(group.expectedAnnualDividend === null ? '-' : formatMoney(group.expectedAnnualDividend, group.currency))}</strong>
          <span>배당수익률</span>
          <strong>${escapeHtml(formatPercent(group.dividendYieldPercent))}</strong>
          ${
            group.dividendGrowthPercent !== null
              ? `
                <span>배당 증감액</span>
                <strong class="${dividendGrowthClass}">${escapeHtml(formatSignedMoney(group.dividendGrowthAmount, group.currency))}</strong>
                <span>배당 성장률</span>
                <strong class="${dividendGrowthClass}">${escapeHtml(formatSignedPercent(group.dividendGrowthPercent))}</strong>
              `
              : ''
          }
        </div>
        ${renderDividendCashFlow(group)}
        ${group.pendingCount ? `<div class="portfolio-summary-note">${group.pendingCount}개 종목은 현재가 확인 후 평가금액에 반영됩니다.</div>` : ''}
      `;
      return item;
    })
  );
}

function buildPortfolioSummaryGroups(stocks) {
  const groups = new Map();

  for (const stock of stocks) {
    const metrics = calculateHoldingMetrics(stock);

    if (!metrics.hasQuantity || metrics.investmentAmount === null) {
      continue;
    }

    const currency = stock.currency || '';
    const key = currency || 'unknown';
    const group =
      groups.get(key) ||
      {
        currency,
        currencyLabel: currency || '통화 미정',
        count: 0,
        pendingCount: 0,
        investmentAmount: 0,
        valuedInvestmentAmount: 0,
        marketValue: 0,
        profit: 0,
        profitPercent: null,
        totalReturnAmount: 0,
        totalReturnInvestmentAmount: 0,
        totalReturnTrackedCount: 0,
        maximumProfitAmount: 0,
        maximumProfitInvestmentAmount: 0,
        maximumProfitTrackedCount: 0,
        maximumTotalReturnAmount: 0,
        maximumTotalReturnInvestmentAmount: 0,
        maximumTotalReturnTrackedCount: 0,
        retracedProfitAmount: 0,
        retracementBaseAmount: 0,
        retracementTrackedCount: 0,
        totalReturnRetracedAmount: 0,
        totalReturnRetracementBaseAmount: 0,
        totalReturnRetracementTrackedCount: 0,
        dividendInvestmentAmount: 0,
        expectedAnnualDividend: 0,
        dividendYieldPercent: null,
        previousAnnualDividend: 0,
        dividendGrowthAmount: 0,
        dividendGrowthBaseAmount: 0,
        dividendGrowthTrackedCount: 0,
        dividendCashFlow: Array(12).fill(0)
      };

    group.count += 1;
    group.investmentAmount += metrics.investmentAmount;

    if (metrics.marketValue === null || metrics.profit === null) {
      group.pendingCount += 1;
    } else {
      group.marketValue += metrics.marketValue;
      group.valuedInvestmentAmount += metrics.investmentAmount;
      group.profit += metrics.profit;

      if (metrics.totalReturnAmount !== null) {
        group.totalReturnAmount += metrics.totalReturnAmount;
        group.totalReturnInvestmentAmount += metrics.investmentAmount;
        group.totalReturnTrackedCount += 1;
      }
    }

    if (metrics.maximumProfitAmount !== null) {
      group.maximumProfitAmount += metrics.maximumProfitAmount;
      group.maximumProfitInvestmentAmount += metrics.investmentAmount;
      group.maximumProfitTrackedCount += 1;
    }

    if (metrics.maximumTotalReturnAmount !== null) {
      group.maximumTotalReturnAmount += metrics.maximumTotalReturnAmount;
      group.maximumTotalReturnInvestmentAmount += metrics.investmentAmount;
      group.maximumTotalReturnTrackedCount += 1;
    }

    if (
      metrics.retracedProfitAmount !== null &&
      metrics.maximumProfitAmount !== null &&
      metrics.maximumProfitAmount > 0
    ) {
      group.retracedProfitAmount += metrics.retracedProfitAmount;
      group.retracementBaseAmount += metrics.maximumProfitAmount;
      group.retracementTrackedCount += 1;
    }

    if (
      metrics.totalReturnRetracedAmount !== null &&
      metrics.maximumTotalReturnAmount !== null &&
      metrics.maximumTotalReturnAmount > 0
    ) {
      group.totalReturnRetracedAmount += metrics.totalReturnRetracedAmount;
      group.totalReturnRetracementBaseAmount += metrics.maximumTotalReturnAmount;
      group.totalReturnRetracementTrackedCount += 1;
    }

    if (metrics.expectedAnnualDividend !== null) {
      group.expectedAnnualDividend += metrics.expectedAnnualDividend;
      group.dividendInvestmentAmount += metrics.investmentAmount;
    }

    if (metrics.dividendGrowth.available) {
      const previousAnnualDividend =
        metrics.quantity * metrics.dividendGrowth.previousAnnualDividendPerShare;
      const currentAnnualDividend = metrics.quantity * metrics.dividendGrowth.annualDividendPerShare;
      group.previousAnnualDividend += previousAnnualDividend;
      group.dividendGrowthAmount += currentAnnualDividend - previousAnnualDividend;
      group.dividendGrowthBaseAmount += previousAnnualDividend;
      group.dividendGrowthTrackedCount += 1;
    }

    if (metrics.dividendPaymentAmount !== null && metrics.dividendMonths.length) {
      for (const month of metrics.dividendMonths) {
        group.dividendCashFlow[month - 1] += metrics.dividendPaymentAmount;
      }
    }

    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      marketValue: group.valuedInvestmentAmount > 0 ? group.marketValue : null,
      profit: group.valuedInvestmentAmount > 0 ? group.profit : null,
      profitPercent:
        group.valuedInvestmentAmount > 0 ? (group.profit / group.valuedInvestmentAmount) * 100 : null,
      totalReturnAmount:
        group.totalReturnTrackedCount > 0 ? group.totalReturnAmount : null,
      totalReturnPercent:
        group.totalReturnInvestmentAmount > 0
          ? (group.totalReturnAmount / group.totalReturnInvestmentAmount) * 100
          : null,
      maximumProfitAmount:
        group.maximumProfitTrackedCount > 0 ? group.maximumProfitAmount : null,
      maximumProfitPercent:
        group.maximumProfitInvestmentAmount > 0
          ? (group.maximumProfitAmount / group.maximumProfitInvestmentAmount) * 100
          : null,
      maximumTotalReturnAmount:
        group.maximumTotalReturnTrackedCount > 0 ? group.maximumTotalReturnAmount : null,
      maximumTotalReturnPercent:
        group.maximumTotalReturnInvestmentAmount > 0
          ? (group.maximumTotalReturnAmount / group.maximumTotalReturnInvestmentAmount) * 100
          : null,
      retracedProfitAmount:
        group.retracementTrackedCount > 0 ? group.retracedProfitAmount : null,
      retracedProfitPercent:
        group.retracementBaseAmount > 0
          ? (group.retracedProfitAmount / group.retracementBaseAmount) * 100
          : null,
      totalReturnRetracedAmount:
        group.totalReturnRetracementTrackedCount > 0 ? group.totalReturnRetracedAmount : null,
      totalReturnRetracedPercent:
        group.totalReturnRetracementBaseAmount > 0
          ? (group.totalReturnRetracedAmount / group.totalReturnRetracementBaseAmount) * 100
          : null,
      expectedAnnualDividend:
        group.dividendInvestmentAmount > 0 ? group.expectedAnnualDividend : null,
      dividendYieldPercent:
        group.dividendInvestmentAmount > 0
          ? (group.expectedAnnualDividend / group.dividendInvestmentAmount) * 100
          : null,
      previousAnnualDividend:
        group.dividendGrowthTrackedCount > 0 ? group.previousAnnualDividend : null,
      dividendGrowthAmount:
        group.dividendGrowthTrackedCount > 0 ? group.dividendGrowthAmount : null,
      dividendGrowthPercent:
        group.dividendGrowthBaseAmount > 0
          ? (group.dividendGrowthAmount / group.dividendGrowthBaseAmount) * 100
          : null,
      dividendGrowthTrackedCount: group.dividendGrowthTrackedCount,
      dividendCashFlow: group.dividendCashFlow
    }))
    .sort((left, right) => left.currencyLabel.localeCompare(right.currencyLabel, 'ko-KR'));
}

function renderDividendCashFlow(group) {
  const cashFlow = Array.isArray(group.dividendCashFlow) ? group.dividendCashFlow : [];
  const items = cashFlow
    .map((amount, index) => ({
      month: index + 1,
      amount
    }))
    .filter((item) => item.amount > 0);

  if (!items.length) {
    return '';
  }

  return `
    <div class="dividend-cashflow-list" aria-label="월별 예상 배당금">
      ${items
        .map(
          (item) => `
            <span class="dividend-cashflow-item">
              <span>${item.month}월</span>
              <strong>${escapeHtml(formatMoney(item.amount, group.currency))}</strong>
            </span>
          `
        )
        .join('')}
    </div>
  `;
}

function renderDividendCalendar(calendar) {
  if (!elements.dividendCalendarPanel) {
    return;
  }

  const months = Array.isArray(calendar?.months) ? calendar.months : [];
  const summary = calendar?.summary || {};
  const selectedFilter = normalizeDividendCalendarFilter(state.dividendCalendarFilter);

  if (!months.length || !summary.stocksWithDividends) {
    elements.dividendCalendarPanel.innerHTML =
      '<div class="portfolio-summary-empty">배당금과 배당 지급월을 입력하면 배당 캘린더가 표시됩니다.</div>';
    return;
  }

  const annualTotals = formatCurrencyTotals(summary.annualDividendTotals || []);
  const eventCount = Number(summary.eventCount || 0);
  const visibleMonths = months.map((month) => filterDividendCalendarMonth(month, selectedFilter));
  const viewSummary = summarizeDividendCalendarMonths(visibleMonths);
  const viewTotals = formatCurrencyTotals(viewSummary.totals || []);
  const filterLabel = getDividendCalendarFilterLabel(selectedFilter);

  elements.dividendCalendarPanel.innerHTML = `
    <div class="dividend-calendar-head">
      <div>
        <span class="dividend-calendar-eyebrow">Dividend Calendar</span>
        <strong>배당 캘린더</strong>
        <p>${escapeHtml(summary.stocksWithDividends)}개 배당 종목 · 향후 ${escapeHtml(summary.monthsAhead || months.length)}개월 · ${escapeHtml(eventCount)}개 일정</p>
      </div>
      <div class="dividend-calendar-total">
        <span>예상 연 배당금</span>
        <strong>${escapeHtml(annualTotals || '-')}</strong>
      </div>
    </div>
    <div class="dividend-calendar-toolbar">
      ${renderDividendCalendarFilters(summary, selectedFilter)}
      <div class="dividend-calendar-current-total">
        <span>${escapeHtml(filterLabel)} 월별 합계</span>
        <strong>${escapeHtml(viewTotals || '-')}</strong>
      </div>
    </div>
    <div class="dividend-calendar-summary-grid" aria-label="배당 캘린더 요약">
      ${renderDividendCalendarSummaryItem('표시 일정', `${viewSummary.eventCount}건`, filterLabel)}
      ${renderDividendCalendarSummaryItem('확정 지급', formatCurrencyTotals(viewSummary.confirmedTotals) || `${viewSummary.confirmedEventCount}건`, '지급일 확인')}
      ${renderDividendCalendarSummaryItem('예상 지급', formatCurrencyTotals(viewSummary.estimatedTotals) || `${viewSummary.estimatedEventCount}건`, '지급월 기준')}
      ${renderDividendCalendarSummaryItem('배당락', `${viewSummary.exDividendEventCount}건`, '배당락일 확인')}
    </div>
    ${
      eventCount && !viewSummary.eventCount
        ? `<div class="portfolio-summary-note">${escapeHtml(filterLabel)} 조건에 맞는 배당 일정이 없습니다.</div>`
        : ''
    }
    <div class="dividend-calendar-months">
      ${visibleMonths.map(renderDividendCalendarMonth).join('')}
    </div>
    ${
      summary.pendingScheduleCount
        ? `<div class="portfolio-summary-note">${escapeHtml(summary.pendingScheduleCount)}개 종목은 배당 지급월이 없어 캘린더에 배치하지 못했습니다.</div>`
        : ''
    }
  `;
}

function renderDividendCalendarMonth(month) {
  const events = Array.isArray(month.events) ? month.events : [];
  const totals = formatCurrencyTotals(month.totals || []);
  const eventCounts = month.eventCounts || {};
  const totalCount = Number(eventCounts.total || events.length || 0);
  const monthSummary = totals ? `${totals} · ${totalCount}건` : totalCount ? `${totalCount}건` : '일정 없음';

  return `
    <section class="dividend-calendar-month">
      <div class="dividend-calendar-month-head">
        <strong>${escapeHtml(month.label || `${month.month}월`)}</strong>
        <span>${escapeHtml(monthSummary)}</span>
      </div>
      ${events.length ? renderDividendCalendarMonthTotals(month) : ''}
      <div class="dividend-calendar-events">
        ${
          events.length
            ? events.map(renderDividendCalendarEvent).join('')
            : '<div class="dividend-calendar-empty">조건에 맞는 일정 없음</div>'
        }
      </div>
    </section>
  `;
}

function renderDividendCalendarEvent(event) {
  const eventClass = getDividendCalendarEventClass(event);
  const amount = event.amount === null || event.amount === undefined
    ? '-'
    : formatMoney(event.amount, event.currency);
  const dateText = event.paymentDate
    ? `지급 ${formatDateOnly(event.paymentDate)}`
    : event.exDividendDate
      ? `배당락 ${formatDateOnly(event.exDividendDate)}`
      : event.frequencyLabel || '예상';
  const sourceText = event.dividendProvider
    ? getProviderLabel(event.dividendProvider)
    : event.dividendDataSource
      ? getProviderLabel(event.dividendDataSource)
      : event.frequencyLabel || '예상';
  const typeText = getDividendCalendarEventTypeLabel(event);

  return `
    <div class="dividend-calendar-event ${eventClass}">
      <div>
        <strong>${escapeHtml(event.displayName || event.symbol)}</strong>
        <span>${escapeHtml(event.symbol)} · ${escapeHtml(dateText)} · ${escapeHtml(typeText)}</span>
      </div>
      <div>
        <strong>${escapeHtml(amount)}</strong>
        <span>${escapeHtml(sourceText)}</span>
      </div>
    </div>
  `;
}

function getDividendCalendarEventClass(event) {
  if (event.type === 'confirmed') {
    return 'confirmed';
  }

  if (event.type === 'payment') {
    return 'payment';
  }

  if (event.type === 'ex_dividend') {
    return 'ex-dividend';
  }

  return 'estimated';
}

function renderDividendCalendarFilters(summary, selectedFilter) {
  const filters = [
    ['all', '전체', Number(summary.eventCount || 0)],
    ['confirmed', '확정', Number(summary.confirmedEventCount || 0)],
    ['estimated', '예상', Number(summary.estimatedEventCount || 0)],
    ['ex_dividend', '배당락', Number(summary.exDividendEventCount || 0)]
  ];

  return `
    <div class="dividend-calendar-filters" role="group" aria-label="배당 일정 필터">
      ${filters
        .map(([value, label, count]) => {
          const active = value === selectedFilter ? ' active' : '';

          return `
            <button type="button" class="dividend-calendar-filter${active}" data-dividend-calendar-filter="${escapeHtml(value)}">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(count)}</strong>
            </button>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderDividendCalendarSummaryItem(label, value, detail) {
  return `
    <div class="dividend-calendar-summary-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || '-')}</strong>
      <em>${escapeHtml(detail || '')}</em>
    </div>
  `;
}

function renderDividendCalendarMonthTotals(month) {
  const eventCounts = month.eventCounts || {};
  const confirmedTotals = formatCurrencyTotals(month.confirmedTotals || []);
  const estimatedTotals = formatCurrencyTotals(month.estimatedTotals || []);

  return `
    <div class="dividend-calendar-month-totals" aria-label="월별 배당 요약">
      ${renderDividendCalendarTotalChip('확정', confirmedTotals || `${Number(eventCounts.confirmed || 0)}건`)}
      ${renderDividendCalendarTotalChip('예상', estimatedTotals || `${Number(eventCounts.estimated || 0)}건`)}
      ${renderDividendCalendarTotalChip('배당락', `${Number(eventCounts.exDividend || 0)}건`)}
    </div>
  `;
}

function renderDividendCalendarTotalChip(label, value) {
  return `
    <span class="dividend-calendar-total-chip">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || '-')}</strong>
    </span>
  `;
}

function filterDividendCalendarMonth(month, selectedFilter) {
  const events = (Array.isArray(month.events) ? month.events : []).filter((event) =>
    matchesDividendCalendarFilter(event, selectedFilter)
  );

  return {
    ...month,
    events,
    ...summarizeDividendCalendarEvents(events)
  };
}

function summarizeDividendCalendarMonths(months) {
  const events = [];

  for (const month of months) {
    events.push(...(Array.isArray(month.events) ? month.events : []));
  }

  return summarizeDividendCalendarEvents(events);
}

function summarizeDividendCalendarEvents(events) {
  const totals = new Map();
  const confirmedTotals = new Map();
  const estimatedTotals = new Map();
  const paymentTotals = new Map();
  const eventCounts = createDividendCalendarEventCounts();

  for (const event of events) {
    incrementDividendCalendarEventCounts(eventCounts, event);

    if (event.amount === null || event.amount === undefined) {
      continue;
    }

    addDividendCalendarCurrencyAmount(totals, event.currency, event.amount);

    if (isConfirmedDividendCalendarEvent(event)) {
      addDividendCalendarCurrencyAmount(confirmedTotals, event.currency, event.amount);
    }

    if (event.type === 'estimated') {
      addDividendCalendarCurrencyAmount(estimatedTotals, event.currency, event.amount);
    }

    if (isDividendCalendarPaymentEvent(event)) {
      addDividendCalendarCurrencyAmount(paymentTotals, event.currency, event.amount);
    }
  }

  return {
    totals: mapDividendCalendarCurrencyTotals(totals),
    confirmedTotals: mapDividendCalendarCurrencyTotals(confirmedTotals),
    estimatedTotals: mapDividendCalendarCurrencyTotals(estimatedTotals),
    paymentTotals: mapDividendCalendarCurrencyTotals(paymentTotals),
    eventCounts,
    eventCount: eventCounts.total,
    confirmedEventCount: eventCounts.confirmed,
    estimatedEventCount: eventCounts.estimated,
    paymentEventCount: eventCounts.payment,
    exDividendEventCount: eventCounts.exDividend
  };
}

function createDividendCalendarEventCounts() {
  return {
    total: 0,
    confirmed: 0,
    estimated: 0,
    payment: 0,
    exDividend: 0,
    amounted: 0
  };
}

function incrementDividendCalendarEventCounts(target, event) {
  target.total += 1;

  if (isConfirmedDividendCalendarEvent(event)) {
    target.confirmed += 1;
  }

  if (event.type === 'estimated') {
    target.estimated += 1;
  }

  if (isDividendCalendarPaymentEvent(event)) {
    target.payment += 1;
  }

  if (event.exDividendDate || event.type === 'ex_dividend') {
    target.exDividend += 1;
  }

  if (event.amount !== null && event.amount !== undefined) {
    target.amounted += 1;
  }
}

function matchesDividendCalendarFilter(event, selectedFilter) {
  const filter = normalizeDividendCalendarFilter(selectedFilter);

  if (filter === 'confirmed') {
    return isConfirmedDividendCalendarEvent(event);
  }

  if (filter === 'estimated') {
    return event.type === 'estimated';
  }

  if (filter === 'ex_dividend') {
    return Boolean(event.exDividendDate || event.type === 'ex_dividend');
  }

  return true;
}

function normalizeDividendCalendarFilter(value) {
  return ['all', 'confirmed', 'estimated', 'ex_dividend'].includes(value) ? value : 'all';
}

function getDividendCalendarFilterLabel(value) {
  const labels = {
    all: '전체',
    confirmed: '확정',
    estimated: '예상',
    ex_dividend: '배당락'
  };

  return labels[normalizeDividendCalendarFilter(value)];
}

function getDividendCalendarEventTypeLabel(event) {
  if (event.type === 'confirmed') {
    return '확정';
  }

  if (event.type === 'payment') {
    return '지급일';
  }

  if (event.type === 'ex_dividend') {
    return '배당락';
  }

  return '예상';
}

function isConfirmedDividendCalendarEvent(event) {
  return event.type === 'confirmed' || event.type === 'payment' || event.certainty === 'confirmed';
}

function isDividendCalendarPaymentEvent(event) {
  return event.eventKind === 'payment' || ['confirmed', 'estimated', 'payment'].includes(event.type);
}

function addDividendCalendarCurrencyAmount(map, currency, amount) {
  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return;
  }

  const key = currency || '';
  map.set(key, (map.get(key) || 0) + value);
}

function mapDividendCalendarCurrencyTotals(map) {
  return [...map.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((left, right) => String(left.currency).localeCompare(String(right.currency), 'ko-KR'));
}

function formatCurrencyTotals(totals) {
  const items = Array.isArray(totals) ? totals : [];

  return items
    .filter((item) => Number(item.amount) > 0)
    .map((item) => formatMoney(item.amount, item.currency))
    .join(' · ');
}

function renderWatchControls() {
  elements.watchFilterButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.watchFilter === state.watchFilter);
  });
  elements.watchSortSelect.value = state.watchSort;
}

function filterWatchStocks(items) {
  const filter = state.watchFilter;

  if (filter === 'all') {
    return items;
  }

  if (filter === 'attention') {
    return items.filter(({ watchStatus }) =>
      ['alert', 'warning', 'error'].includes(watchStatus.level)
    );
  }

  return items.filter(({ watchStatus }) => watchStatus.level === filter);
}

function compareWatchStocks(left, right) {
  const sort = state.watchSort;
  const leftStatus = left.watchStatus;
  const rightStatus = right.watchStatus;

  if (sort === 'name') {
    return getStockDisplayName(left.stock).localeCompare(getStockDisplayName(right.stock), 'ko-KR');
  }

  if (sort === 'checked') {
    return getTimeValue(right.stock.lastCheckedAt) - getTimeValue(left.stock.lastCheckedAt);
  }

  if (sort === 'distance') {
    return getDistanceSortValue(leftStatus) - getDistanceSortValue(rightStatus);
  }

  if (sort === 'profit') {
    return getProfitSortValue(right.stock) - getProfitSortValue(left.stock);
  }

  return (
    getRiskRank(leftStatus.level) - getRiskRank(rightStatus.level) ||
    getDistanceSortValue(leftStatus) - getDistanceSortValue(rightStatus) ||
    getStockDisplayName(left.stock).localeCompare(getStockDisplayName(right.stock), 'ko-KR')
  );
}

function getRiskRank(level) {
  const ranks = {
    alert: 0,
    error: 1,
    warning: 2,
    ok: 3,
    inactive: 4
  };

  return ranks[level] ?? 9;
}

function getDistanceSortValue(status) {
  const value = Number(status.distancePercent);

  if (!Number.isFinite(value)) {
    return Number.POSITIVE_INFINITY;
  }

  return value;
}

function getProfitSortValue(stock) {
  const metrics = calculateHoldingMetrics(stock);

  return Number.isFinite(metrics.profitPercent) ? metrics.profitPercent : Number.NEGATIVE_INFINITY;
}

function getStockDisplayName(stock) {
  return String(stock.displayName || stock.symbol || '');
}

function getTimeValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
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
      <span>보유 수량</span>
      <input name="quantity" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" value="${escapeHtml(stock.quantity || '')}" />
    </label>
    <label>
      <span>주당 연 배당금</span>
      <input name="annualDividendPerShare" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" value="${escapeHtml(stock.annualDividendPerShare || '')}" />
    </label>
    <label>
      <span>배당 주기</span>
      <select name="dividendFrequency">
        <option value="" ${getDividendFrequency(stock) === '' ? 'selected' : ''}>미입력</option>
        <option value="monthly" ${getDividendFrequency(stock) === 'monthly' ? 'selected' : ''}>월배당</option>
        <option value="quarterly" ${getDividendFrequency(stock) === 'quarterly' ? 'selected' : ''}>분기배당</option>
        <option value="semiannual" ${getDividendFrequency(stock) === 'semiannual' ? 'selected' : ''}>반기배당</option>
        <option value="annual" ${getDividendFrequency(stock) === 'annual' ? 'selected' : ''}>연배당</option>
        <option value="custom" ${getDividendFrequency(stock) === 'custom' ? 'selected' : ''}>직접 입력</option>
      </select>
    </label>
    <label>
      <span>배당 지급월</span>
      <input name="dividendMonths" type="text" inputmode="numeric" value="${escapeHtml(formatDividendMonthInput(stock.dividendMonths))}" placeholder="예: 3,6,9,12" />
    </label>
    <label>
      <span>매수일 선택</span>
      <input name="purchaseDate" type="date" max="${getTodayInputValue()}" value="${escapeHtml(stock.purchaseDate || '')}" />
    </label>
    <label>
      <span>KIS 시장 기준</span>
      <select name="kisMarketDivCode">
        ${renderKisMarketDivCodeOptions(stock.kisMarketDivCode)}
      </select>
    </label>
    <label>
      <span>알림 기준</span>
      <select name="alertType">
        <option value="high_drawdown" ${getAlertType(stock) === 'high_drawdown' ? 'selected' : ''}>최고가 대비 하락률</option>
        <option value="profit_retracement" ${getAlertType(stock) === 'profit_retracement' ? 'selected' : ''}>이익금 반납률</option>
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
    <label>
      <span>투자 목표가</span>
      <input name="investmentTargetPrice" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" value="${escapeHtml(stock.investmentTargetPrice || '')}" />
    </label>
    <label>
      <span>실적 체크일</span>
      <input name="reviewDate" type="date" value="${escapeHtml(stock.reviewDate || '')}" />
    </label>
    <label class="edit-notes">
      <span>매수 이유</span>
      <textarea name="investmentReason" rows="2">${escapeHtml(stock.investmentReason || '')}</textarea>
    </label>
    <label class="edit-notes">
      <span>매도 조건</span>
      <textarea name="sellCondition" rows="2">${escapeHtml(stock.sellCondition || '')}</textarea>
    </label>
    <label class="edit-notes">
      <span>기타 메모</span>
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

function alertToggle(stock) {
  const button = document.createElement('button');
  const enabled = stock.active !== false;
  const displayName = stock.displayName || stock.symbol;

  button.type = 'button';
  button.className = `alert-toggle ${enabled ? 'on' : 'off'}`;
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-checked', enabled ? 'true' : 'false');
  button.setAttribute('aria-label', `${displayName} 알림 ${enabled ? '끄기' : '켜기'}`);
  button.innerHTML = `
    <span class="alert-toggle-track" aria-hidden="true">
      <span class="alert-toggle-thumb"></span>
    </span>
    <span class="alert-toggle-text">${enabled ? '알림 켜짐' : '알림 꺼짐'}</span>
  `;

  button.addEventListener('click', () =>
    withBusy(button, async () => {
      await patchStock(stock.id, { active: !enabled });
      showMessage(`${displayName} 알림을 ${enabled ? '껐습니다.' : '켰습니다.'}`);
    })
  );

  return button;
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
      const isDividendEventAlert = alert.alertType === 'dividend_event';
      row.innerHTML = `
        <div class="metric">
          <span class="metric-label">종목</span>
          <span class="metric-value">${escapeHtml(alert.displayName || alert.symbol)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">${escapeHtml(alert.metricLabel || '하락률')}</span>
          <span class="metric-value down">${isDividendEventAlert ? escapeHtml(alert.dividendEventOffsetLabel || '-') : formatAlertMetricPercent(alert.drawdownPercent, alert.alertType !== 'profit_retracement')}</span>
          ${isDividendEventAlert ? renderDividendEventAlertDetail(alert) : ''}
          ${!isDividendEventAlert && alert.alertRepeatCount ? `<span class="metric-detail">${Number(alert.alertRepeatCount)}회차</span>` : ''}
          ${!isDividendEventAlert ? renderAlertProfitDetail(alert) : ''}
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

function renderDividendEventAlertDetail(alert) {
  const parts = [
    alert.dividendEventDate ? formatDateOnly(alert.dividendEventDate) : '',
    alert.expectedDividendAmount !== null && alert.expectedDividendAmount !== undefined
      ? `예상 ${formatMoney(alert.expectedDividendAmount, alert.currency)}`
      : ''
  ].filter(Boolean);

  return parts.length ? `<span class="metric-detail">${escapeHtml(parts.join(' · '))}</span>` : '';
}

function renderAlertProfitDetail(alert) {
  if (alert.alertType !== 'profit_retracement' || alert.maximumProfitAmount === null || alert.maximumProfitAmount === undefined) {
    return '';
  }

  const parts = [
    `최대 ${formatMoney(alert.maximumProfitAmount, alert.currency)}`,
    alert.retracedProfitAmount !== null && alert.retracedProfitAmount !== undefined
      ? `반납 ${formatMoney(alert.retracedProfitAmount, alert.currency)}`
      : ''
  ].filter(Boolean);

  return `<span class="metric-detail">${escapeHtml(parts.join(' · '))}</span>`;
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
        actionButton('복구', 'btn btn-danger btn-sm danger-button', () => restoreBackupItem(backup)),
        actionButton('삭제', 'btn btn-outline btn-sm secondary-button', () => deleteBackupItem(backup))
      );

      return row;
    })
  );
}

async function deleteBackupItem(backup) {
  const confirmed = window.confirm(
    [
      '선택한 백업 파일을 삭제합니다.',
      '',
      `백업: ${backup.name}`,
      `생성 시각: ${formatDate(backup.createdAt)}`,
      '',
      '삭제한 백업은 되돌릴 수 없습니다.',
      '계속할까요?'
    ].join('\n')
  );

  if (!confirmed) {
    return;
  }

  const result = await api(`/api/backups/${encodeURIComponent(backup.name)}`, {
    method: 'DELETE'
  });

  state.backups = result.backups || [];
  state.backupRetention = result.retention || state.backupRetention;
  renderBackups();
  showMessage('선택한 백업을 삭제했습니다.');
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
    high_initialized: '최고가 기준을 초기화했습니다.',
    checked: '테스트 가격을 확인했습니다. 아직 알림 기준에는 닿지 않았습니다.',
    skipped: '알림이 꺼진 종목이라 테스트 확인을 건너뛰었습니다.'
  };

  return labels[result.status] || '테스트 가격을 확인했습니다.';
}

async function retryStockQuote(stock) {
  const result = await api(`/api/stocks/${stock.id}/retry-quote`, {
    method: 'POST'
  });
  const stockResult = result.results?.[0];

  showMessage(renderQuoteRetryMessage(stock, stockResult), stockResult?.status === 'error');
  await loadData();
}

async function retryStockDividend(stock) {
  const result = await api(`/api/stocks/${stock.id}/retry-dividend`, {
    method: 'POST'
  });
  const stockResult = result.results?.[0];

  showMessage(renderDividendRetryMessage(stock, stockResult), stockResult?.status === 'error');
  await loadData();
}

function renderQuoteRetryMessage(stock, result) {
  const name = stock.displayName || stock.symbol;

  if (!result) {
    return `${name} 시세를 다시 확인했습니다.`;
  }

  const labels = {
    alert: `${name} 시세 재시도 완료: 알림 기준에 도달했습니다.`,
    recovered: `${name} 시세 재시도 완료: 알림 기준 위로 회복됐습니다.`,
    high_updated: `${name} 시세 재시도 완료: 새 최고가로 저장됐습니다.`,
    checked: `${name} 시세 재시도 완료: 아직 알림 기준에는 닿지 않았습니다.`,
    skipped: `${name} 알림이 꺼져 있어 시세 재시도를 건너뛰었습니다.`
  };

  if (result.status === 'error') {
    return `${name} 시세 재시도 실패: ${result.error || '가격 정보를 다시 가져오지 못했습니다.'}`;
  }

  return labels[result.status] || `${name} 시세를 다시 확인했습니다.`;
}

function renderDividendRetryMessage(stock, result) {
  const name = stock.displayName || stock.symbol;

  if (!result) {
    return `${name} 배당 정보를 다시 확인했습니다.`;
  }

  const labels = {
    updated: `${name} 배당 정보를 업데이트했습니다.`,
    checked: `${name} 배당 정보를 다시 확인했습니다. 변경된 값은 없습니다.`,
    skipped: `${name} 알림이 꺼져 있어 배당 재시도를 건너뛰었습니다.`
  };

  if (result.status === 'error') {
    return `${name} 배당 재시도 실패: ${result.error || '배당 정보를 다시 가져오지 못했습니다.'}`;
  }

  return labels[result.status] || `${name} 배당 정보를 다시 확인했습니다.`;
}

function getStockStatusLabel(stock) {
  if (!stock.active) {
    return '알림 꺼짐';
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

function getWatchStatus(stock) {
  const thresholdPrice = calculateAlertThreshold(stock);
  const lastPrice = parseFiniteNumber(stock.lastPrice);
  const distance =
    thresholdPrice !== null && lastPrice !== null ? lastPrice - thresholdPrice : null;
  const distancePercent =
    distance !== null && thresholdPrice && thresholdPrice > 0 ? (distance / thresholdPrice) * 100 : null;
  const distanceText = formatDistanceToThreshold(distance, distancePercent, stock.currency);

  if (!stock.active) {
    return {
      level: 'inactive',
      label: '알림 꺼짐',
      detail: '자동 가격 확인과 텔레그램 알림을 쉬고 있습니다.',
      distancePercent
    };
  }

  if (stock.lastCheckStatus === 'error') {
    return {
      level: 'error',
      label: '조회 실패',
      detail: stock.lastError || '최근 시세 조회에 실패했습니다.',
      distancePercent
    };
  }

  if (
    stock.alertState === 'triggered' ||
    (thresholdPrice !== null && lastPrice !== null && lastPrice <= thresholdPrice)
  ) {
    return {
      level: 'alert',
      label: '알림',
      detail: distanceText || '현재가가 알림 기준에 닿았습니다.',
      distancePercent
    };
  }

  if (distancePercent !== null && distancePercent <= 5) {
    return {
      level: 'warning',
      label: '주의',
      detail: distanceText,
      distancePercent
    };
  }

  return {
    level: 'ok',
    label: '정상',
    detail: distanceText || '아직 알림 기준까지 여유가 있습니다.',
    distancePercent
  };
}

function formatDistanceToThreshold(distance, distancePercent, currency) {
  if (!Number.isFinite(distance) || !Number.isFinite(distancePercent)) {
    return '';
  }

  if (distance <= 0) {
    return `기준가보다 ${formatMoney(Math.abs(distance), currency)} 낮음`;
  }

  return `기준가까지 ${formatMoney(distance, currency)} · ${distancePercent.toFixed(2)}%`;
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

function formatQuoteSourceSummary(source) {
  const provider =
    source?.providerLabel ||
    source?.quoteProviderLabel ||
    getProviderLabel(source?.provider || source?.quoteProvider);
  const parts = [
    provider,
    getQuoteDataDelayLabel(source?.dataDelay || source?.quoteDataDelay),
    getQuoteVenueLabel(source?.venue || source?.quoteVenue)
  ].filter(Boolean);

  return parts.join(' · ');
}

function formatQuoteSourceDetail(source) {
  return [
    getQuoteLicenseTypeLabel(source?.licenseType || source?.quoteLicenseType),
    source?.sourceNote || source?.quoteSourceNote || ''
  ]
    .filter(Boolean)
    .join(' · ');
}

function getQuoteDataDelayLabel(value) {
  const labels = {
    realtime_estimated: '실시간 추정',
    realtime_contract: '계약 실시간',
    realtime_polling: '실시간 조회',
    delayed: '지연',
    delayed_or_close: '지연/종가',
    eod: '일봉',
    manual: '수동',
    unknown: '성격 불명'
  };

  return labels[String(value || '').toLowerCase()] || '';
}

function getQuoteVenueLabel(value) {
  const labels = {
    krx_estimated: 'KRX 추정',
    nxt: 'NXT',
    nxt_estimated: 'NXT 추정',
    integrated: '통합',
    us: '미국',
    manual: '수동',
    unknown: '시장 불명'
  };

  return labels[String(value || '').toLowerCase()] || '';
}

function getQuoteLicenseTypeLabel(value) {
  const labels = {
    unofficial: '무료/비공식',
    public: '무료 공개',
    keyed: 'API 키',
    broker: '증권사',
    contract: '계약 필요',
    manual: '수동 입력',
    unknown: '라이선스 불명'
  };

  return labels[String(value || '').toLowerCase()] || '';
}

function getProviderLabel(provider) {
  const labels = {
    naver: 'Naver',
    stooq: 'Stooq',
    alphavantage: 'Alpha Vantage',
    publicdata: '공공데이터',
    opendart: 'OpenDART',
    kis: 'KIS',
    nxt: 'NXT',
    yahoo: 'Yahoo',
    manual: '수동'
  };

  return labels[String(provider || '').toLowerCase()] || provider;
}

function formatDividendRefreshStatus(stock) {
  if (stock.dividendLastError) {
    return `실패 ${formatDate(stock.dividendLastErrorAt)}`;
  }

  if (stock.dividendLastCheckedAt) {
    const source = stock.dividendDataSource ? ` · ${getProviderLabel(stock.dividendDataSource)}` : '';
    return `${formatDate(stock.dividendLastCheckedAt)}${source}`;
  }

  if (stock.dividendDataSource === 'manual') {
    return '수동 입력';
  }

  return '확인 전';
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

function renderHoldingSummary(stock) {
  const metrics = calculateHoldingMetrics(stock);

  if (!metrics.hasQuantity) {
    return '';
  }

  const profitClass = getProfitClass(metrics.profit);
  const totalReturnClass = getProfitClass(metrics.totalReturnAmount);
  const maximumTotalReturnClass = getProfitClass(metrics.maximumTotalReturnAmount);
  const totalReturnRetracedClass = metrics.totalReturnRetracedAmount > 0 ? 'down' : 'flat';
  const dividendGrowthClass = getProfitClass(metrics.dividendGrowth.changeAmount);
  const hasDividendReturn = metrics.expectedAnnualDividend !== null;

  return `
    <div class="stock-holding-grid">
      ${renderHoldingMetric('보유 수량', formatQuantity(metrics.quantity))}
      ${renderHoldingMetric('총 매수금액', formatMoney(metrics.investmentAmount, stock.currency))}
      ${renderHoldingMetric('현재 평가금액', metrics.marketValue === null ? '-' : formatMoney(metrics.marketValue, stock.currency))}
      ${renderHoldingMetric('평가손익', formatSignedMoney(metrics.profit, stock.currency), profitClass)}
      ${renderHoldingMetric('수익률', formatSignedPercent(metrics.profitPercent), profitClass)}
      ${
        hasDividendReturn && metrics.totalReturnAmount !== null
          ? renderHoldingMetric(
              '배당 포함 손익',
              formatSignedMoney(metrics.totalReturnAmount, stock.currency),
              totalReturnClass
            )
          : ''
      }
      ${
        hasDividendReturn && metrics.totalReturnPercent !== null
          ? renderHoldingMetric('배당 포함 수익률', formatSignedPercent(metrics.totalReturnPercent), totalReturnClass)
          : ''
      }
      ${
        metrics.maximumProfitAmount !== null
          ? renderHoldingMetric(
              '최대 수익금',
              formatSignedMoney(metrics.maximumProfitAmount, stock.currency),
              metrics.maximumProfitAmount > 0 ? 'up' : 'flat'
            )
          : ''
      }
      ${
        hasDividendReturn && metrics.maximumTotalReturnAmount !== null
          ? renderHoldingMetric(
              '배당 포함 최대 수익',
              formatSignedMoney(metrics.maximumTotalReturnAmount, stock.currency),
              maximumTotalReturnClass
            )
          : ''
      }
      ${
        getAlertType(stock) === 'profit_retracement' && metrics.retracedProfitAmount !== null
          ? renderHoldingMetric(
              '반납 금액',
              formatMoney(metrics.retracedProfitAmount, stock.currency),
              metrics.retracedProfitAmount > 0 ? 'down' : 'flat'
            )
          : ''
      }
      ${
        hasDividendReturn &&
        getAlertType(stock) === 'profit_retracement' &&
        metrics.totalReturnRetracedPercent !== null
          ? renderHoldingMetric(
              '배당 포함 반납률',
              formatPercent(metrics.totalReturnRetracedPercent),
              totalReturnRetracedClass
            )
          : ''
      }
      ${renderHoldingMetric('예상 연 배당금', metrics.expectedAnnualDividend === null ? '-' : formatMoney(metrics.expectedAnnualDividend, stock.currency))}
      ${renderHoldingMetric('배당수익률', formatPercent(metrics.dividendYieldPercent))}
      ${
        metrics.dividendGrowth.available
          ? renderHoldingMetric(
              '배당 성장률',
              formatSignedPercent(metrics.dividendGrowth.changePercent),
              dividendGrowthClass
            )
          : ''
      }
      ${renderHoldingMetric('1회 예상 배당금', metrics.dividendPaymentAmount === null ? '-' : formatMoney(metrics.dividendPaymentAmount, stock.currency))}
      ${renderHoldingMetric('배당 지급월', formatDividendMonths(metrics.dividendMonths))}
      ${renderHoldingMetric('배당 갱신', formatDividendRefreshStatus(stock), stock.dividendLastError ? 'down' : '')}
    </div>
  `;
}

function renderAveragingCalculator(stock) {
  const quantity = parseFiniteNumber(stock.quantity);
  const purchasePrice = parseFiniteNumber(stock.purchasePrice);

  if (quantity === null || quantity <= 0 || purchasePrice === null || purchasePrice <= 0) {
    return '';
  }

  const suggestedPrice = parseFiniteNumber(stock.lastPrice) ?? purchasePrice;

  return `
    <form class="averaging-calculator" data-average-form aria-label="추가매수 계산기">
      <div class="averaging-calculator-head">
        <div>
          <span>Average Down</span>
          <strong>추가매수 계산기</strong>
        </div>
        <button type="submit" class="btn btn-outline btn-sm secondary-button" data-average-apply disabled>보유 정보 반영</button>
      </div>
      <div class="averaging-input-grid">
        <label>
          <span>추가 매수가</span>
          <input name="additionalPrice" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" value="${escapeHtml(suggestedPrice)}" />
        </label>
        <label>
          <span>추가 수량</span>
          <input name="additionalQuantity" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" placeholder="0" />
        </label>
        <label>
          <span>목표 평단가</span>
          <input name="targetAveragePrice" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" placeholder="선택" />
        </label>
      </div>
      <div class="averaging-result" data-average-result></div>
    </form>
  `;
}

function attachAveragingCalculator(row, stock) {
  const form = row.querySelector('[data-average-form]');

  if (!form) {
    return;
  }

  const result = form.querySelector('[data-average-result]');
  const applyButton = form.querySelector('[data-average-apply]');
  const inputs = [
    form.elements.additionalPrice,
    form.elements.additionalQuantity,
    form.elements.targetAveragePrice
  ].filter(Boolean);
  const readPlan = () =>
    buildAveragingPlan({
      currentQuantity: stock.quantity,
      currentAveragePrice: stock.purchasePrice,
      additionalQuantity: form.elements.additionalQuantity.value,
      additionalPrice: form.elements.additionalPrice.value,
      targetAveragePrice: form.elements.targetAveragePrice.value,
      currentPrice: stock.lastPrice,
      highPrice: stock.highPrice,
      alertType: getAlertType(stock),
      thresholdPercent: stock.thresholdPercent,
      targetPrice: stock.targetPrice
    });
  const update = () => {
    const plan = readPlan();
    result.innerHTML = renderAveragingResult(plan, stock);
    applyButton.disabled = !plan.canApply;
  };

  inputs.forEach((input) => input.addEventListener('input', update));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const plan = readPlan();

    if (!plan.canApply) {
      showMessage('추가 매수가와 추가 수량을 입력하세요.', true);
      return;
    }

    const confirmed = window.confirm(
      [
        `${stock.displayName || stock.symbol} 보유 정보를 추가매수 결과로 바꿉니다.`,
        '',
        `새 평단가: ${formatMoney(plan.newAveragePrice, stock.currency)}`,
        `새 보유 수량: ${formatQuantity(plan.newQuantity)}`,
        '',
        '실제 추가매수를 완료한 뒤에만 반영하세요.'
      ].join('\n')
    );

    if (!confirmed) {
      return;
    }

    await withBusy(applyButton, async () => {
      await patchStock(stock.id, {
        purchasePrice: plan.newAveragePrice,
        quantity: plan.newQuantity
      });
      showMessage('추가매수 결과를 보유 정보에 반영했습니다.');
    });
  });
  update();
}

function renderAveragingResult(plan, stock) {
  if (!plan.validBase) {
    return '<div class="averaging-empty">매수가와 보유 수량을 입력하면 계산됩니다.</div>';
  }

  if (!plan.canCalculate) {
    return '<div class="averaging-empty">추가 매수가와 추가 수량을 입력하세요.</div>';
  }

  const averageChangeClass = getProfitClass(-Number(plan.averagePriceChange || 0));
  const profitClass = getProfitClass(plan.newProfit);
  const thresholdChangeClass = getProfitClass(-Number(plan.alertThresholdChange || 0));
  const target = plan.requiredForTargetAverage;

  return `
    <div class="averaging-result-grid">
      ${renderAveragingMetric('추가 매수금액', formatMoney(plan.additionalInvestment, stock.currency))}
      ${renderAveragingMetric(
        '새 평단가',
        formatMoney(plan.newAveragePrice, stock.currency),
        `${formatSignedMoney(plan.averagePriceChange, stock.currency)} · ${formatSignedPercent(plan.averagePriceChangePercent)}`,
        averageChangeClass
      )}
      ${renderAveragingMetric('새 보유 수량', formatQuantity(plan.newQuantity))}
      ${renderAveragingMetric('손익분기점', formatMoney(plan.breakEvenPrice, stock.currency))}
      ${
        plan.newProfit !== null
          ? renderAveragingMetric(
              '현재가 기준 손익',
              formatSignedMoney(plan.newProfit, stock.currency),
              formatSignedPercent(plan.newProfitPercent),
              profitClass
            )
          : ''
      }
      ${
        plan.alertThresholdAfter !== null
          ? renderAveragingMetric(
              '알림 기준 변화',
              formatMoney(plan.alertThresholdAfter, stock.currency),
              `${formatSignedMoney(plan.alertThresholdChange, stock.currency)} · ${getAlertTypeLabel(stock)}`,
              thresholdChangeClass
            )
          : ''
      }
      ${
        target
          ? renderAveragingMetric(
              '목표 평단 필요',
              formatQuantity(target.quantity),
              `${formatMoney(target.investmentAmount, stock.currency)} 추가`,
              'flat'
            )
          : ''
      }
    </div>
  `;
}

function renderAveragingMetric(label, value, detail = '', valueClass = '') {
  return `
    <div class="averaging-metric">
      <span>${escapeHtml(label)}</span>
      <strong class="${escapeHtml(valueClass)}">${escapeHtml(value)}</strong>
      ${detail ? `<em>${escapeHtml(detail)}</em>` : ''}
    </div>
  `;
}

function renderDividendEventSummary(stock) {
  const history = Array.isArray(stock.dividendHistory) ? stock.dividendHistory : [];
  const dividendGrowth = calculateDividendGrowth(stock);
  const dividendGrowthClass = getProfitClass(dividendGrowth.changeAmount);
  const dividendCurrency = stock.dividendCurrency || stock.currency;
  const hasDividendEvent =
    stock.lastDividendValue ||
    stock.exDividendDate ||
    stock.dividendDate ||
    dividendGrowth.available ||
    history.length;

  if (!hasDividendEvent) {
    return '';
  }

  return `
    <div class="stock-dividend-panel">
      <div class="stock-dividend-grid">
        ${renderHoldingMetric('최근 1주 배당', stock.lastDividendValue ? formatMoney(stock.lastDividendValue, dividendCurrency) : '-')}
        ${renderHoldingMetric('배당락일', formatDateOnly(stock.exDividendDate))}
        ${renderHoldingMetric('지급일', formatDateOnly(stock.dividendDate))}
        ${renderHoldingMetric('배당 출처', stock.dividendProvider ? getProviderLabel(stock.dividendProvider) : stock.dividendDataSource ? getProviderLabel(stock.dividendDataSource) : '-')}
        ${
          dividendGrowth.available
            ? renderHoldingMetric(
                '배당 성장률',
                formatSignedPercent(dividendGrowth.changePercent),
                dividendGrowthClass
              )
            : ''
        }
        ${
          dividendGrowth.available
            ? renderHoldingMetric(
                '주당 증감',
                formatSignedMoney(dividendGrowth.changeAmount, dividendGrowth.currency || dividendCurrency),
                dividendGrowthClass
              )
            : ''
        }
      </div>
      ${
        history.length
          ? `<div class="dividend-history-list">${history.slice(0, 3).map((item) => renderDividendHistoryItem(item, stock)).join('')}</div>`
          : ''
      }
    </div>
  `;
}

function renderRetryFailurePanel(stock) {
  const quoteFailure =
    stock.lastCheckStatus === 'error' || String(stock.lastError || '').trim()
      ? renderRetryFailureItem({
          title: '시세 조회 실패',
          detail: stock.lastError || '최근 시세 조회에 실패했습니다.',
          time: stock.lastErrorAt || stock.lastCheckedAt,
          meta: stock.quoteProvider ? `마지막 출처 ${getProviderLabel(stock.quoteProvider)}` : '',
          stock
        })
      : '';
  const dividendFailure = stock.dividendLastError
    ? renderRetryFailureItem({
        title: '배당 조회 실패',
        detail: stock.dividendLastError,
        time: stock.dividendLastErrorAt || stock.dividendLastCheckedAt,
        meta: stock.dividendLastDiagnostic?.preservedAnnualDividendPerShare
          ? `기존 배당 ${formatMoney(
              stock.dividendLastDiagnostic.preservedAnnualDividendPerShare,
              stock.dividendLastDiagnostic.currency || stock.dividendCurrency || stock.currency
            )} 유지`
          : '',
        attempts: Array.isArray(stock.dividendLastDiagnostic?.attempts)
          ? stock.dividendLastDiagnostic.attempts
          : [],
        stock
      })
    : '';
  const items = [quoteFailure, dividendFailure].filter(Boolean);

  if (!items.length) {
    return '';
  }

  return `<div class="retry-failure-panel">${items.join('')}</div>`;
}

function renderRetryFailureItem({ title, detail, time, meta = '', attempts = [], stock = {} }) {
  return `
    <div class="retry-failure-item">
      <div class="retry-failure-head">
        <strong>${escapeHtml(title)}</strong>
        ${time ? `<span>${escapeHtml(formatDate(time))}</span>` : ''}
      </div>
      <div class="retry-failure-detail">${escapeHtml(detail)}</div>
      ${meta ? `<div class="retry-failure-meta">${escapeHtml(meta)}</div>` : ''}
      ${
        attempts.length
          ? `<div class="retry-attempt-list">${attempts.slice(0, 3).map((attempt) => renderDividendAttempt(attempt, stock)).join('')}</div>`
          : ''
      }
    </div>
  `;
}

function renderInvestmentPlanCard(stock) {
  const reason = String(stock.investmentReason || '').trim();
  const sellCondition = String(stock.sellCondition || '').trim();
  const reviewDate = String(stock.reviewDate || '').trim();
  const notes = String(stock.notes || '').trim();
  const targetPrice = parseFiniteNumber(stock.investmentTargetPrice);
  const items = [
    reason ? renderInvestmentPlanItem('매수 이유', reason) : '',
    targetPrice !== null ? renderInvestmentPlanItem('투자 목표가', formatMoney(targetPrice, stock.currency)) : '',
    sellCondition ? renderInvestmentPlanItem('매도 조건', sellCondition) : '',
    reviewDate ? renderInvestmentPlanItem('실적 체크일', formatReviewDateStatus(reviewDate), formatDateOnly(reviewDate)) : '',
    notes ? renderInvestmentPlanItem('기타 메모', notes) : ''
  ].filter(Boolean);

  if (!items.length) {
    return '';
  }

  return `
    <section class="investment-plan-panel" aria-label="매수 이유와 매도 조건">
      <div class="investment-plan-head">
        <span>Investment Plan</span>
        <strong>매수 이유 / 매도 조건</strong>
      </div>
      <div class="investment-plan-grid">
        ${items.join('')}
      </div>
    </section>
  `;
}

function renderInvestmentPlanItem(label, value, detail = '') {
  return `
    <div class="investment-plan-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${detail ? `<em>${escapeHtml(detail)}</em>` : ''}
    </div>
  `;
}

function formatReviewDateStatus(value) {
  if (!value) {
    return '-';
  }

  const today = getTodayInputValue();
  const date = String(value).slice(0, 10);

  if (date < today) {
    return '점검 지남';
  }

  if (date === today) {
    return '오늘 점검';
  }

  const diffDays = Math.round(
    (new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
      86400000
  );

  return diffDays <= 7 ? `${diffDays}일 뒤 점검` : '점검 예정';
}

function renderDividendHistoryItem(item, stock) {
  const currency = item.currency || stock.dividendCurrency || stock.currency;
  const amountChanged = item.previousAnnualDividendPerShare !== item.annualDividendPerShare;
  const lastValueChanged = item.previousLastDividendValue !== item.lastDividendValue;
  const dateChanged =
    item.previousExDividendDate !== item.exDividendDate ||
    item.previousDividendDate !== item.dividendDate;
  const changeParts = [];

  if (amountChanged) {
    const growth = calculateDividendGrowthFromEntry(item, stock);
    const growthText = growth.available ? ` (${formatSignedPercent(growth.changePercent)})` : '';
    changeParts.push(
      `연 ${formatMoney(item.previousAnnualDividendPerShare, currency)} -> ${formatMoney(item.annualDividendPerShare, currency)}${growthText}`
    );
  }

  if (lastValueChanged) {
    changeParts.push(
      `1주 ${formatMoney(item.previousLastDividendValue, currency)} -> ${formatMoney(item.lastDividendValue, currency)}`
    );
  }

  if (dateChanged) {
    changeParts.push(
      `락 ${formatDateOnly(item.previousExDividendDate)} -> ${formatDateOnly(item.exDividendDate)}`
    );
    changeParts.push(
      `지급 ${formatDateOnly(item.previousDividendDate)} -> ${formatDateOnly(item.dividendDate)}`
    );
  }

  return `
    <div class="dividend-history-item">
      <span>${escapeHtml(formatDate(item.checkedAt))}</span>
      <strong>${escapeHtml(changeParts.filter(Boolean).join(' · ') || '배당 정보 변경')}</strong>
      <span>${escapeHtml(item.provider ? getProviderLabel(item.provider) : '-')}</span>
    </div>
  `;
}

function renderHoldingMetric(label, value, valueClass = '') {
  return `
    <div class="stock-holding-metric">
      <span>${escapeHtml(label)}</span>
      <strong class="${escapeHtml(valueClass)}">${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderPositionSummary(stock) {
  if (!stock.purchaseDate && !stock.purchasePrice && !stock.quantity) {
    return '';
  }

  const parts = [];

  if (stock.purchaseDate) {
    parts.push(`매수일 ${formatDateOnly(stock.purchaseDate)}`);
  }

  if (stock.purchasePrice) {
    parts.push(`매수가 ${formatMoney(stock.purchasePrice, stock.currency)}`);
  }

  if (stock.quantity) {
    parts.push(`수량 ${formatQuantity(stock.quantity)}`);
  }

  if (stock.annualDividendPerShare) {
    parts.push(`주당 배당 ${formatMoney(stock.annualDividendPerShare, stock.currency)}`);
  }

  if (stock.dividendFrequency) {
    parts.push(getDividendFrequencyLabel(stock.dividendFrequency));
  }

  if (stock.dividendDataSource && stock.dividendDataSource !== 'manual') {
    parts.push(`배당 ${getProviderLabel(stock.dividendDataSource)}`);
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
    monitoring_start: '감시 시작',
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

function formatHighPriceDetail(stock) {
  return [formatHighPriceAt(stock), formatHighSourceDetail(stock)].filter(Boolean).join(' · ');
}

function formatHighSourceDetail(stock) {
  if (!stock.highPriceSource && !stock.highPriceProvider) {
    return '';
  }

  const provider = stock.highPriceProviderLabel || getProviderLabel(stock.highPriceProvider);
  return [
    getHighSourceLabel(stock.highPriceSource),
    provider,
    getQuoteDataDelayLabel(stock.highPriceDataDelay),
    getQuoteVenueLabel(stock.highPriceVenue)
  ]
    .filter(Boolean)
    .join(' · ');
}

function getAlertType(stock) {
  const type = String(stock?.alertType || 'high_drawdown');
  const validTypes = ['high_drawdown', 'profit_retracement', 'purchase_loss', 'target_price'];

  return validTypes.includes(type) ? type : 'high_drawdown';
}

function getAlertTypeLabel(stock) {
  const labels = {
    high_drawdown: '최고가 대비 하락률',
    profit_retracement: '이익금 반납률',
    purchase_loss: '매수가 대비 손절률',
    target_price: '직접 기준가'
  };

  return labels[getAlertType(stock)];
}

function getAlertThresholdLabel(stock) {
  const labels = {
    high_drawdown: '알림 기준가',
    profit_retracement: '이익 반납 기준가',
    purchase_loss: '손절 기준가',
    target_price: '직접 기준가'
  };

  return labels[getAlertType(stock)];
}

function getAlertMetricLabel(stock) {
  const labels = {
    high_drawdown: '하락률',
    profit_retracement: '반납률',
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
  const messageElement = isAdminMode() && elements.adminMessage ? elements.adminMessage : elements.message;

  if (!messageElement) {
    return;
  }

  messageElement.textContent = text;
  messageElement.className = `message show${isError ? ' error' : ''}`;

  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => {
    messageElement.className = 'message';
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

function getDividendSchedule(input) {
  const frequency = getDividendFrequency(input);
  const explicitMonths = parseDividendMonths(input?.dividendMonths);
  const months = explicitMonths.length ? explicitMonths : getDefaultDividendMonths(frequency);
  const quantity = parseFiniteNumber(input?.quantity);
  const annualDividendPerShare = parseFiniteNumber(input?.annualDividendPerShare);
  const expectedAnnualDividend =
    quantity !== null && quantity > 0 && annualDividendPerShare !== null && annualDividendPerShare > 0
      ? quantity * annualDividendPerShare
      : null;
  const paymentCount = months.length;
  const paymentAmount =
    expectedAnnualDividend !== null && paymentCount > 0 ? expectedAnnualDividend / paymentCount : null;

  return {
    frequency,
    months,
    paymentCount,
    paymentAmount
  };
}

function getDividendFrequency(input) {
  const value = typeof input === 'string' ? input : input?.dividendFrequency;
  const frequency = String(value || '').trim().toLowerCase();
  const allowed = ['', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom'];

  return allowed.includes(frequency) ? frequency : '';
}

function getDividendFrequencyLabel(value) {
  const labels = {
    monthly: '월배당',
    quarterly: '분기배당',
    semiannual: '반기배당',
    annual: '연배당',
    custom: '직접 입력',
    '': '-'
  };

  return labels[getDividendFrequency(value)] || '-';
}

function getDefaultDividendMonths(frequency) {
  const normalized = getDividendFrequency(frequency);

  if (normalized === 'monthly') {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }

  if (normalized === 'quarterly') {
    return [3, 6, 9, 12];
  }

  if (normalized === 'semiannual') {
    return [6, 12];
  }

  if (normalized === 'annual') {
    return [12];
  }

  return [];
}

function parseDividendMonths(value) {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  const rawItems = Array.isArray(value)
    ? value
    : String(value)
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean);

  const months = rawItems
    .map((item) => Number(item))
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);

  return [...new Set(months)].sort((left, right) => left - right);
}

function formatDividendMonthInput(value) {
  return parseDividendMonths(value).join(',');
}

function formatDividendMonths(value) {
  const months = parseDividendMonths(value);

  if (!months.length) {
    return '-';
  }

  if (months.length === 12) {
    return '매월';
  }

  return months.map((month) => `${month}월`).join(', ');
}

function calculateDividendGrowth(stock = {}) {
  const history = Array.isArray(stock.dividendHistory) ? stock.dividendHistory : [];
  const entry = findLatestDividendGrowthEntry(history);

  if (!entry) {
    return createEmptyDividendGrowth(stock, history.length);
  }

  return calculateDividendGrowthFromEntry(entry, stock, { preferStockValue: true });
}

function calculateDividendGrowthFromEntry(entry, stock = {}, options = {}) {
  const history = Array.isArray(stock.dividendHistory) ? stock.dividendHistory : [];
  const previousAnnualDividendPerShare = normalizePreviousDividend(entry?.previousAnnualDividendPerShare);
  const annualDividendPerShare = resolveCurrentAnnualDividend(entry, stock, options);

  if (previousAnnualDividendPerShare === null || annualDividendPerShare === null) {
    return createEmptyDividendGrowth(stock, history.length);
  }

  const changeAmount = annualDividendPerShare - previousAnnualDividendPerShare;

  if (Math.abs(changeAmount) < 0.000001) {
    return createEmptyDividendGrowth(stock, history.length);
  }

  return {
    available: true,
    previousAnnualDividendPerShare,
    annualDividendPerShare,
    changeAmount,
    changePercent: (changeAmount / previousAnnualDividendPerShare) * 100,
    checkedAt: entry.checkedAt || stock.dividendUpdatedAt || stock.dividendLastCheckedAt || null,
    provider: entry.provider || stock.dividendProvider || stock.dividendDataSource || '',
    currency: entry.currency || stock.dividendCurrency || stock.currency || '',
    historyCount: history.length
  };
}

function findLatestDividendGrowthEntry(history = []) {
  return (Array.isArray(history) ? history : []).find(hasAnnualDividendAmountChange) || null;
}

function hasAnnualDividendAmountChange(entry) {
  const previousAnnualDividendPerShare = normalizePreviousDividend(entry?.previousAnnualDividendPerShare);
  const annualDividendPerShare = normalizeCurrentDividend(entry?.annualDividendPerShare);

  return (
    previousAnnualDividendPerShare !== null &&
    annualDividendPerShare !== null &&
    Math.abs(annualDividendPerShare - previousAnnualDividendPerShare) >= 0.000001
  );
}

function resolveCurrentAnnualDividend(entry, stock, options) {
  if (options.preferStockValue) {
    const stockValue = normalizeCurrentDividend(stock?.annualDividendPerShare);

    if (stockValue !== null) {
      return stockValue;
    }
  }

  return normalizeCurrentDividend(entry?.annualDividendPerShare);
}

function normalizePreviousDividend(value) {
  const number = normalizeNonNegativeDividend(value);
  return number !== null && number > 0 ? number : null;
}

function normalizeCurrentDividend(value) {
  if (value === undefined) {
    return null;
  }

  if (value === null || value === '') {
    return 0;
  }

  return normalizeNonNegativeDividend(value);
}

function normalizeNonNegativeDividend(value) {
  const number = parseFiniteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function createEmptyDividendGrowth(stock = {}, historyCount = 0) {
  return {
    available: false,
    previousAnnualDividendPerShare: null,
    annualDividendPerShare: normalizeCurrentDividend(stock.annualDividendPerShare),
    changeAmount: null,
    changePercent: null,
    checkedAt: null,
    provider: '',
    currency: stock.dividendCurrency || stock.currency || '',
    historyCount
  };
}

function calculateHoldingMetrics(stock) {
  const quantity = parseFiniteNumber(stock.quantity);
  const purchasePrice = parseFiniteNumber(stock.purchasePrice);
  const lastPrice = parseFiniteNumber(stock.lastPrice);
  const annualDividendPerShare = parseFiniteNumber(stock.annualDividendPerShare);
  const dividendSchedule = getDividendSchedule(stock);
  const dividendGrowth = calculateDividendGrowth(stock);
  const hasQuantity = quantity !== null && quantity > 0;
  const investmentAmount =
    hasQuantity && purchasePrice !== null && purchasePrice > 0 ? quantity * purchasePrice : null;
  const marketValue = hasQuantity && lastPrice !== null && lastPrice > 0 ? quantity * lastPrice : null;
  const profit =
    investmentAmount !== null && marketValue !== null ? marketValue - investmentAmount : null;
  const profitPercent =
    profit !== null && investmentAmount > 0 ? (profit / investmentAmount) * 100 : null;
  const expectedAnnualDividend =
    hasQuantity && annualDividendPerShare !== null && annualDividendPerShare > 0
      ? quantity * annualDividendPerShare
      : null;
  const dividendReturnAmount = expectedAnnualDividend ?? 0;
  const totalReturnAmount = profit !== null ? profit + dividendReturnAmount : null;
  const totalReturnPercent =
    totalReturnAmount !== null && investmentAmount > 0
      ? (totalReturnAmount / investmentAmount) * 100
      : null;
  const highPrice = parseFiniteNumber(stock.highPrice);
  const maximumProfitAmount =
    hasQuantity && highPrice !== null && highPrice > 0 && purchasePrice !== null && purchasePrice > 0
      ? Math.max(0, (highPrice - purchasePrice) * quantity)
      : null;
  const maximumProfitPercent =
    maximumProfitAmount !== null && investmentAmount > 0
      ? (maximumProfitAmount / investmentAmount) * 100
      : null;
  const maximumTotalReturnAmount =
    maximumProfitAmount !== null ? maximumProfitAmount + dividendReturnAmount : null;
  const maximumTotalReturnPercent =
    maximumTotalReturnAmount !== null && investmentAmount > 0
      ? (maximumTotalReturnAmount / investmentAmount) * 100
      : null;
  const retracedProfitAmount =
    maximumProfitAmount !== null && profit !== null
      ? Math.max(0, maximumProfitAmount - profit)
      : null;
  const retracedProfitPercent =
    retracedProfitAmount !== null && maximumProfitAmount > 0
      ? (retracedProfitAmount / maximumProfitAmount) * 100
      : null;
  const totalReturnRetracedAmount =
    maximumTotalReturnAmount !== null && totalReturnAmount !== null
      ? Math.max(0, maximumTotalReturnAmount - totalReturnAmount)
      : null;
  const totalReturnRetracedPercent =
    totalReturnRetracedAmount !== null && maximumTotalReturnAmount > 0
      ? (totalReturnRetracedAmount / maximumTotalReturnAmount) * 100
      : null;
  const dividendYieldPercent =
    expectedAnnualDividend !== null && investmentAmount > 0
      ? (expectedAnnualDividend / investmentAmount) * 100
      : null;
  const dividendPaymentAmount =
    expectedAnnualDividend !== null && dividendSchedule.paymentCount > 0
      ? expectedAnnualDividend / dividendSchedule.paymentCount
      : null;

  return {
    hasQuantity,
    quantity,
    purchasePrice,
    lastPrice,
    annualDividendPerShare,
    investmentAmount,
    marketValue,
    profit,
    profitPercent,
    totalReturnAmount,
    totalReturnPercent,
    maximumProfitAmount,
    maximumProfitPercent,
    maximumTotalReturnAmount,
    maximumTotalReturnPercent,
    retracedProfitAmount,
    retracedProfitPercent,
    totalReturnRetracedAmount,
    totalReturnRetracedPercent,
    expectedAnnualDividend,
    dividendYieldPercent,
    dividendFrequency: dividendSchedule.frequency,
    dividendMonths: dividendSchedule.months,
    dividendPaymentAmount,
    dividendGrowth
  };
}

function calculateThreshold(highPrice, thresholdPercent) {
  const high = parseFiniteNumber(highPrice);
  const threshold = Number(thresholdPercent);

  if (high === null || !Number.isFinite(threshold)) {
    return null;
  }

  return high * (1 - threshold / 100);
}

function calculateProfitRetracementThreshold(stock) {
  const high = parseFiniteNumber(stock.highPrice);
  const purchase = parseFiniteNumber(stock.purchasePrice);
  const threshold = Number(stock.thresholdPercent);

  if (
    high === null ||
    purchase === null ||
    high <= purchase ||
    !Number.isFinite(threshold)
  ) {
    return null;
  }

  return high - (high - purchase) * (threshold / 100);
}

function calculateProfitRetracement(stock, lastPrice) {
  const high = parseFiniteNumber(stock.highPrice);
  const purchase = parseFiniteNumber(stock.purchasePrice);
  const last = parseFiniteNumber(lastPrice);

  if (high === null || purchase === null || last === null || high <= purchase) {
    return 0;
  }

  return Math.max(0, ((high - last) / (high - purchase)) * 100);
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

  if (getAlertType(stock) === 'profit_retracement') {
    return calculateProfitRetracementThreshold(stock);
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

  if (getAlertType(stock) === 'profit_retracement') {
    return calculateProfitRetracement(stock, lastPrice);
  }

  return calculateDrawdown(stock.highPrice, lastPrice);
}

function formatAlertMetricPercent(value, useNegativePrefix = true) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '-';
  }

  if (number <= 0) {
    return '0.00%';
  }

  return `${useNegativePrefix ? '-' : ''}${number.toFixed(2)}%`;
}

function formatMetricPercent(position) {
  return formatAlertMetricPercent(
    position.metricPercent ?? position.drawdownPercent,
    position.alertType !== 'profit_retracement'
  );
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

function formatSignedMoney(value, currency) {
  const number = parseFiniteNumber(value);

  if (number === null) {
    return '-';
  }

  const prefix = number > 0 ? '+' : '';
  return `${prefix}${formatMoney(number, currency)}`;
}

function formatQuantity(value) {
  const number = parseFiniteNumber(value);

  if (number === null) {
    return '-';
  }

  return number.toLocaleString('ko-KR', {
    maximumFractionDigits: 6
  });
}

function formatSignedPercent(value) {
  const number = parseFiniteNumber(value);

  if (number === null) {
    return '-';
  }

  const prefix = number > 0 ? '+' : '';
  return `${prefix}${number.toFixed(2)}%`;
}

function formatPercent(value) {
  const number = parseFiniteNumber(value);

  if (number === null) {
    return '-';
  }

  return `${number.toFixed(2)}%`;
}

function getProfitClass(value) {
  const number = parseFiniteNumber(value);

  if (number === null || number === 0) {
    return 'flat';
  }

  return number > 0 ? 'up' : 'down';
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

function formatDurationMs(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return '-';
  }

  if (number >= 1000) {
    return `${(number / 1000).toFixed(2)}초`;
  }

  return `${Math.round(number)}ms`;
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

function isSectionAvailableForMode(section) {
  const scope = section.dataset.pageScope;
  return !scope || scope === state.appMode;
}

function switchMobileTab(name) {
  if (!isMobileViewport() || isAdminMode()) {
    return;
  }

  elements.tabSections.forEach((section) => {
    section.classList.toggle(
      'active',
      isSectionAvailableForMode(section) && section.id === `tab-${name}`
    );
  });
  elements.mobileNavButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === name);
  });
}

function syncResponsiveTabs() {
  if (isAdminMode()) {
    elements.tabSections.forEach((section) => {
      section.classList.toggle('active', isSectionAvailableForMode(section));
    });
    return;
  }

  if (!isMobileViewport()) {
    elements.tabSections.forEach((section) => {
      section.classList.toggle('active', isSectionAvailableForMode(section));
    });
    return;
  }

  const activeButton =
    [...elements.mobileNavButtons].find((button) => button.classList.contains('active')) ||
    elements.mobileNavButtons[0];

  switchMobileTab(activeButton?.dataset.tab || 'watch');
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
initializeDashboard();
window.setInterval(() => {
  if (!isAdminMode() || canAccessAdminPanel()) {
    loadData();
  }
}, 15000);
window.setInterval(() => {
  if (isAdminMode() && canAccessAdminPanel()) {
    loadHealth();
  }
}, 15000);

async function initializeDashboard() {
  if (!isAdminMode()) {
    await loadData();
    return;
  }

  const canLoadAdminData = await loadAdminSession();

  if (canLoadAdminData) {
    await loadAdminData();
  }
}

async function loadAdminData() {
  await Promise.all([loadHealth(), loadData(), loadBackups()]);
}

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
