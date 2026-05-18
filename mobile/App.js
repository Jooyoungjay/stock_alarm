import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { DEFAULT_API_BASE_URL, checkHealth, createDevice, getMobileSnapshot, normalizeBaseUrl } from './src/api.js';
import { clearDeviceSession, loadBaseUrl, loadDeviceSession, saveBaseUrl, saveDeviceSession } from './src/deviceStorage.js';
import { formatCurrency, formatPercent, formatSignedPercent, summarizePortfolio } from './src/format.js';

const e = React.createElement;

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [deviceLabel, setDeviceLabel] = useState('Joo Mobile');
  const [session, setSession] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [health, setHealth] = useState(null);
  const [message, setMessage] = useState('서버 주소를 확인하세요.');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const portfolio = useMemo(() => summarizePortfolio(stocks), [stocks]);
  const connected = Boolean(session?.deviceId && session?.deviceSecret);

  useEffect(() => {
    let mounted = true;

    async function loadStoredState() {
      const [storedBaseUrl, storedSession] = await Promise.all([loadBaseUrl(), loadDeviceSession()]);

      if (!mounted) {
        return;
      }

      if (storedBaseUrl) {
        setApiBaseUrl(storedBaseUrl);
      }

      if (storedSession) {
        setSession(storedSession);
        setMessage('기기 인증 정보를 불러왔습니다.');
      }
    }

    loadStoredState().catch((error) => setMessage(error.message));

    return () => {
      mounted = false;
    };
  }, []);

  const runWithLoading = useCallback(async (task) => {
    setLoading(true);

    try {
      await task();
    } catch (error) {
      setMessage(error.message || '작업에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCheckServer = useCallback(() => runWithLoading(async () => {
    const baseUrl = normalizeBaseUrl(apiBaseUrl);
    const result = await checkHealth({ baseUrl });

    setApiBaseUrl(baseUrl);
    setHealth(result);
    await saveBaseUrl(baseUrl);
    setMessage(`서버 연결 확인: ${result.port || '-'}번 포트`);
  }), [apiBaseUrl, runWithLoading]);

  const handleConnectDevice = useCallback(() => runWithLoading(async () => {
    const baseUrl = normalizeBaseUrl(apiBaseUrl);
    const result = await createDevice({
      baseUrl,
      label: deviceLabel,
      platform: Platform.OS
    });
    const nextSession = {
      deviceId: result.device.id,
      deviceSecret: result.deviceSecret
    };

    await Promise.all([saveBaseUrl(baseUrl), saveDeviceSession(nextSession)]);
    setApiBaseUrl(baseUrl);
    setSession(nextSession);
    setMessage('이 기기가 서버에 연결되었습니다.');
  }), [apiBaseUrl, deviceLabel, runWithLoading]);

  const refreshStocks = useCallback(async ({ silent = false } = {}) => {
    if (!session) {
      setMessage('먼저 기기를 연결하세요.');
      return;
    }

    const baseUrl = normalizeBaseUrl(apiBaseUrl);
    const snapshot = await getMobileSnapshot({
      baseUrl,
      session
    });

    setStocks(Array.isArray(snapshot.stocks) ? snapshot.stocks : []);
    setAlerts(Array.isArray(snapshot.alerts) ? snapshot.alerts : []);
    await saveBaseUrl(baseUrl);

    if (!silent) {
      setMessage('내 종목을 새로 불러왔습니다.');
    }
  }, [apiBaseUrl, session]);

  const handleRefreshStocks = useCallback(() => runWithLoading(() => refreshStocks()), [refreshStocks, runWithLoading]);

  const handlePullRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await refreshStocks({ silent: true });
    } catch (error) {
      setMessage(error.message || '새로고침에 실패했습니다.');
    } finally {
      setRefreshing(false);
    }
  }, [refreshStocks]);

  const handleForgetDevice = useCallback(() => runWithLoading(async () => {
    await clearDeviceSession();
    setSession(null);
    setStocks([]);
    setAlerts([]);
    setMessage('기기 연결을 해제했습니다.');
  }), [runWithLoading]);

  return e(SafeAreaView, { style: styles.safeArea },
    e(KeyboardAvoidingView, {
      behavior: Platform.OS === 'ios' ? 'padding' : undefined,
      style: styles.keyboard
    },
      e(FlatList, {
        data: stocks,
        keyExtractor: (item) => item.id || item.symbol,
        contentContainerStyle: styles.content,
        refreshControl: e(RefreshControl, {
          refreshing,
          onRefresh: handlePullRefresh,
          tintColor: colors.accent
        }),
        ListHeaderComponent: e(View, null,
          e(Header, { connected }),
          e(ServerPanel, {
            apiBaseUrl,
            setApiBaseUrl,
            deviceLabel,
            setDeviceLabel,
            health,
            connected,
            onCheckServer: handleCheckServer,
            onConnectDevice: handleConnectDevice,
            onRefreshStocks: handleRefreshStocks,
            onForgetDevice: handleForgetDevice,
            loading
          }),
          e(PortfolioPanel, { portfolio, alertsCount: alerts.length }),
          e(StatusLine, { message, loading })
        ),
        renderItem: ({ item }) => e(StockCard, { stock: item }),
        ListEmptyComponent: e(EmptyState, { connected }),
        ListFooterComponent: e(View, { style: styles.footerSpacer })
      })
    )
  );
}

function Header({ connected }) {
  return e(View, { style: styles.header },
    e(View, null,
      e(Text, { style: styles.eyebrow }, 'STOCK ALARM'),
      e(Text, { style: styles.title }, '내 계좌 상황')
    ),
    e(View, { style: [styles.connectionBadge, connected ? styles.connectionBadgeOn : styles.connectionBadgeOff] },
      e(View, { style: [styles.connectionDot, connected ? styles.connectionDotOn : styles.connectionDotOff] }),
      e(Text, { style: styles.connectionText }, connected ? '연결됨' : '미연결')
    )
  );
}

function ServerPanel(props) {
  return e(View, { style: styles.panel },
    e(Text, { style: styles.panelTitle }, '서버 연결'),
    e(TextInput, {
      style: styles.input,
      value: props.apiBaseUrl,
      onChangeText: props.setApiBaseUrl,
      autoCapitalize: 'none',
      autoCorrect: false,
      keyboardType: 'url',
      placeholder: 'http://127.0.0.1:3001',
      placeholderTextColor: colors.dim
    }),
    e(TextInput, {
      style: styles.input,
      value: props.deviceLabel,
      onChangeText: props.setDeviceLabel,
      placeholder: '기기 이름',
      placeholderTextColor: colors.dim
    }),
    e(View, { style: styles.actionRow },
      e(ActionButton, { label: '서버 확인', onPress: props.onCheckServer, disabled: props.loading, variant: 'secondary' }),
      e(ActionButton, {
        label: props.connected ? '종목 새로고침' : '기기 연결',
        onPress: props.connected ? props.onRefreshStocks : props.onConnectDevice,
        disabled: props.loading,
        variant: 'primary'
      })
    ),
    props.connected
      ? e(Pressable, { onPress: props.onForgetDevice, style: styles.linkButton },
        e(Text, { style: styles.linkButtonText }, '기기 연결 해제')
      )
      : null,
    props.health
      ? e(Text, { style: styles.metaText }, `서버 PID ${props.health.pid || '-'} · 포트 ${props.health.port || '-'}`)
      : null
  );
}

function PortfolioPanel({ portfolio, alertsCount }) {
  return e(View, { style: styles.metricGrid },
    e(MetricItem, { label: '등록', value: String(portfolio.total) }),
    e(MetricItem, { label: '활성', value: String(portfolio.active) }),
    e(MetricItem, { label: '위험', value: String(portfolio.triggered) }),
    e(MetricItem, { label: '알림', value: String(alertsCount) })
  );
}

function StatusLine({ message, loading }) {
  return e(View, { style: styles.statusLine },
    loading ? e(ActivityIndicator, { color: colors.accent, size: 'small' }) : null,
    e(Text, { style: styles.statusText }, message)
  );
}

function StockCard({ stock }) {
  const currentPrice = formatCurrency(stock.currentPrice, stock.currency || 'KRW');
  const thresholdPrice = formatCurrency(stock.thresholdPrice, stock.currency || 'KRW');
  const drawdown = formatSignedPercent(stock.drawdownPercent);
  const profitRetracement = stock.profitRetracementPercent === null || stock.profitRetracementPercent === undefined
    ? '-'
    : formatPercent(stock.profitRetracementPercent);
  const danger = stock.alertState === 'triggered';

  return e(View, { style: [styles.stockCard, danger ? styles.stockCardDanger : null] },
    e(View, { style: styles.stockTop },
      e(View, { style: styles.stockTitleBlock },
        e(Text, { style: styles.stockName }, stock.displayName || stock.symbol),
        e(Text, { style: styles.stockSymbol }, stock.symbol)
      ),
      e(View, { style: [styles.stockBadge, danger ? styles.stockBadgeDanger : styles.stockBadgeNormal] },
        e(Text, { style: [styles.stockBadgeText, danger ? styles.stockBadgeTextDanger : styles.stockBadgeTextNormal] },
          danger ? '알림' : '정상'
        )
      )
    ),
    e(View, { style: styles.stockMetrics },
      e(StockMetric, { label: '현재가', value: currentPrice }),
      e(StockMetric, { label: '기준가', value: thresholdPrice }),
      e(StockMetric, { label: '하락률', value: drawdown, danger }),
      e(StockMetric, { label: '반납률', value: profitRetracement })
    ),
    e(Text, { style: styles.stockMeta },
      `알림 ${stock.alertEnabled === false ? 'OFF' : 'ON'} · 기준 ${stock.alertBasis || 'high_drawdown'}`
    )
  );
}

function StockMetric({ label, value, danger }) {
  return e(View, { style: styles.stockMetric },
    e(Text, { style: styles.metricLabel }, label),
    e(Text, { style: [styles.stockMetricValue, danger ? styles.dangerText : null] }, value)
  );
}

function MetricItem({ label, value }) {
  return e(View, { style: styles.metricItem },
    e(Text, { style: styles.metricLabel }, label),
    e(Text, { style: styles.metricValue }, value)
  );
}

function ActionButton({ label, onPress, disabled, variant }) {
  return e(Pressable, {
    accessibilityRole: 'button',
    onPress,
    disabled,
    style: [
      styles.button,
      variant === 'primary' ? styles.buttonPrimary : styles.buttonSecondary,
      disabled ? styles.buttonDisabled : null
    ]
  },
    e(Text, { style: variant === 'primary' ? styles.buttonPrimaryText : styles.buttonSecondaryText }, label)
  );
}

function EmptyState({ connected }) {
  return e(View, { style: styles.emptyState },
    e(Text, { style: styles.emptyTitle }, connected ? '등록된 종목이 없습니다.' : '기기 연결이 필요합니다.'),
    e(Text, { style: styles.emptyText }, connected ? '웹앱 또는 텔레그램에서 종목을 등록하면 여기에 표시됩니다.' : '서버 주소를 확인하고 기기를 연결하세요.')
  );
}

const colors = {
  bg: '#0d1117',
  surface: '#161b22',
  surface2: '#1c2330',
  border: '#30363d',
  text: '#e6edf3',
  muted: '#8b949e',
  dim: '#484f58',
  accent: '#1a9e6e',
  accentSoft: '#1a9e6e26',
  red: '#e05c5c',
  redSoft: '#e05c5c24'
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg
  },
  keyboard: {
    flex: 1
  },
  content: {
    padding: 18,
    paddingBottom: 36,
    gap: 14
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  connectionBadgeOn: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent
  },
  connectionBadgeOff: {
    backgroundColor: colors.surface,
    borderColor: colors.border
  },
  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: 999
  },
  connectionDotOn: {
    backgroundColor: colors.accent
  },
  connectionDotOff: {
    backgroundColor: colors.dim
  },
  connectionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700'
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    gap: 10
  },
  panelTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800'
  },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 44,
    paddingHorizontal: 12
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8
  },
  button: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12
  },
  buttonPrimary: {
    backgroundColor: colors.accent
  },
  buttonSecondary: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderWidth: 1
  },
  buttonDisabled: {
    opacity: 0.55
  },
  buttonPrimaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  buttonSecondaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800'
  },
  linkButton: {
    alignSelf: 'flex-start',
    paddingVertical: 2
  },
  linkButtonText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  metaText: {
    color: colors.muted,
    fontSize: 12
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 8
  },
  metricItem: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 12
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700'
  },
  metricValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 3
  },
  statusLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 24
  },
  statusText: {
    color: colors.muted,
    flex: 1,
    fontSize: 12
  },
  stockCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    gap: 12
  },
  stockCardDanger: {
    borderColor: colors.red
  },
  stockTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  stockTitleBlock: {
    flex: 1
  },
  stockName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900'
  },
  stockSymbol: {
    color: colors.dim,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2
  },
  stockBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  stockBadgeNormal: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent
  },
  stockBadgeDanger: {
    backgroundColor: colors.redSoft,
    borderColor: colors.red
  },
  stockBadgeText: {
    fontSize: 11,
    fontWeight: '800'
  },
  stockBadgeTextNormal: {
    color: colors.accent
  },
  stockBadgeTextDanger: {
    color: colors.red
  },
  stockMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  stockMetric: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    padding: 10
  },
  stockMetricValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4
  },
  dangerText: {
    color: colors.red
  },
  stockMeta: {
    color: colors.muted,
    fontSize: 12
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 24
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800'
  },
  emptyText: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center'
  },
  footerSpacer: {
    height: 12
  }
});
