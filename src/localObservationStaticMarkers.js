import {
  TODAY_ACTION_ADMIN_JUMP_TYPES,
  TODAY_ACTION_OBSERVATION_TYPES
} from './todayActionContract.js';

export const OBSERVATION_STATIC_MARKERS = Object.freeze({
  userHome: Object.freeze([
    'watchTitle',
    'portfolioSummaryBar',
    'todayActionPanel',
    'stockList'
  ]),
  adminHome: Object.freeze([
    'serverStatusPanel',
    'backupList',
    'observationIssuesPanel',
    'observationHistoryPanel',
    'runObservationCheckButton'
  ]),
  quoteQuality: Object.freeze(['function getQuoteQuality', 'quote-quality']),
  alertControls: Object.freeze([
    'function alertToggle',
    'snoozeStockAlert',
    'snoozeStockAlertUntilTomorrow',
    '\uC54C\uB9BC \uC7AC\uAC1C'
  ]),
  positionStatusFilters: Object.freeze([
    'data-watch-filter="holding"',
    'data-watch-filter="watch"',
    'data-watch-filter="sold"',
    'data-watch-filter="stale-quote"'
  ]),
  positionStatusApp: Object.freeze(['normalizePositionStatus']),
  watchViewPreference: Object.freeze([
    'WATCH_VIEW_STORAGE_KEY',
    'loadWatchViewPreference',
    'saveWatchViewPreference',
    'normalizeWatchFilter',
    'normalizeWatchSort'
  ]),
  csvImportExport: Object.freeze({
    indexHtml: Object.freeze([
      'csvImportInput',
      'csvImportResult',
      'CSV \uAC00\uC838\uC624\uAE30',
      'CSV \uB0B4\uBCF4\uB0B4\uAE30',
      'CSV \uC591\uC2DD'
    ]),
    appJs: Object.freeze([
      'CSV_STOCK_FIELDS',
      'parseCsvText',
      'validateCsvStockRows',
      'exportStocksCsv',
      'importStocksCsv',
      '/api/stocks'
    ])
  }),
  alertRuleGuide: Object.freeze({
    indexHtml: Object.freeze(['alertRuleSummary', 'data-alert-rule-guide']),
    appJs: Object.freeze([
      'buildAlertRuleGuides',
      'renderAlertRuleGuideComparison',
      '\uD544\uC694 \uC785\uB825',
      '\uACC4\uC0B0\uC2DD',
      '\uD22C\uC790 \uAD8C\uC720\uAC00 \uC544\uB2C8\uB77C'
    ]),
    stylesCss: Object.freeze(['alert-rule-guide'])
  }),
  dividendDashboard: Object.freeze({
    indexHtml: Object.freeze(['dividendDiagnosticsPanel', '\uBC30\uB2F9 provider \uC0C1\uD0DC']),
    appJs: Object.freeze([
      'buildDividendApiDashboard',
      'renderDividendApiDashboard',
      'dividend-provider-grid',
      'dividendFailureGuidance'
    ]),
    guidanceJs: Object.freeze([
      'buildDividendFailureNextActions',
      'DATA_GO_KR_SERVICE_KEY',
      'OPEN_DART_API_KEY',
      'ALPHA_VANTAGE_API_KEY'
    ]),
    stylesCss: Object.freeze([
      'dividend-api-dashboard',
      'dividend-provider-card',
      'dividend-next-actions'
    ])
  }),
  sellDecision: Object.freeze(['renderSellDecisionPanel', 'maximumProfitAmount', 'retracement']),
  backupPreview: Object.freeze(['previewBackupItem', '/api/backups/preview']),
  todayActionControls: Object.freeze([
    'buildSystemTodayActions',
    'applyObservationHistoryTodayActionJump',
    'getObservationHistoryFilterFromActionType',
    'observationHistoryListFilter',
    ...TODAY_ACTION_ADMIN_JUMP_TYPES,
    'focusStaleQuoteStocks',
    'data-today-action-filter',
    'data-today-action-stock',
    'data-today-action-admin-target',
    'data-today-action-type',
    'data-today-action-scroll-target',
    'data-observation-history-list-filter',
    ...TODAY_ACTION_OBSERVATION_TYPES
  ]),
  todayActionTypes: Object.freeze([...TODAY_ACTION_OBSERVATION_TYPES]),
  connectionFailure: Object.freeze([
    'connectionBanner',
    '\uB2E4\uC2DC \uC5F0\uACB0',
    '\uCE90\uC2DC \uCD08\uAE30\uD654',
    'getDisplayErrorMessage',
    'Failed to fetch'
  ])
});
