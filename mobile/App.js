import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import {
  DEFAULT_API_BASE_URL,
  checkHealth,
  createDevice,
  createMobileStock,
  deleteMobileStock,
  getMobileSnapshot,
  normalizeBaseUrl,
  updateMobileStock
} from './src/api.js';
import { clearDeviceSession, loadBaseUrl, loadDeviceSession, saveBaseUrl, saveDeviceSession } from './src/deviceStorage.js';
import { formatCurrency, formatPercent, formatSignedPercent, summarizePortfolio } from './src/format.js';
import {
  ALERT_TYPE_OPTIONS,
  buildStockPayload,
  createEmptyStockForm,
  stockToForm,
  validateStockForm
} from './src/stockForm.js';

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
  const [stockFormOpen, setStockFormOpen] = useState(false);
  const [editingStockId, setEditingStockId] = useState('');
  const [stockForm, setStockForm] = useState(createEmptyStockForm);

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
    setStockFormOpen(false);
    setEditingStockId('');
    setStockForm(createEmptyStockForm());
    setMessage('기기 연결을 해제했습니다.');
  }), [runWithLoading]);

  const updateStockFormField = useCallback((field, value) => {
    setStockForm((current) => ({
      ...current,
      [field]: value
    }));
  }, []);

  const openNewStockForm = useCallback(() => {
    setEditingStockId('');
    setStockForm(createEmptyStockForm());
    setStockFormOpen(true);
    setMessage('새 종목 정보를 입력하세요.');
  }, []);

  const openEditStockForm = useCallback((stock) => {
    setEditingStockId(stock.id);
    setStockForm(stockToForm(stock));
    setStockFormOpen(true);
    setMessage(`${stock.displayName || stock.symbol} 편집 중입니다.`);
  }, []);

  const closeStockForm = useCallback(() => {
    setStockFormOpen(false);
    setEditingStockId('');
    setStockForm(createEmptyStockForm());
  }, []);

  const handleSubmitStock = useCallback(() => runWithLoading(async () => {
    if (!session) {
      throw new Error('먼저 기기를 연결하세요.');
    }

    const editing = Boolean(editingStockId);
    validateStockForm(stockForm, { editing });
    const payload = buildStockPayload(stockForm, { editing });
    const baseUrl = normalizeBaseUrl(apiBaseUrl);
    const result = editing
      ? await updateMobileStock({
        baseUrl,
        session,
        stockId: editingStockId,
        patch: payload
      })
      : await createMobileStock({
        baseUrl,
        session,
        stock: payload
      });

    const nextStock = result.stock;
    setApiBaseUrl(baseUrl);
    await saveBaseUrl(baseUrl);
    setStocks((current) => {
      if (editing) {
        return current.map((stock) => (stock.id === nextStock.id ? nextStock : stock));
      }

      return [nextStock, ...current];
    });
    refreshStocks({ silent: true }).catch(() => undefined);
    closeStockForm();
    setMessage(editing ? '종목을 수정했습니다.' : '종목을 등록했습니다.');
  }), [apiBaseUrl, closeStockForm, editingStockId, refreshStocks, runWithLoading, session, stockForm]);

  const handleToggleStockActive = useCallback((stock) => runWithLoading(async () => {
    if (!session) {
      throw new Error('먼저 기기를 연결하세요.');
    }

    const nextActive = stock.active === false;
    const baseUrl = normalizeBaseUrl(apiBaseUrl);
    const result = await updateMobileStock({
      baseUrl,
      session,
      stockId: stock.id,
      patch: { active: nextActive }
    });

    setStocks((current) =>
      current.map((item) => (item.id === result.stock.id ? result.stock : item))
    );
    setMessage(`${result.stock.displayName || result.stock.symbol} 알림을 ${nextActive ? '켰습니다.' : '껐습니다.'}`);
  }), [apiBaseUrl, runWithLoading, session]);

  const handleDeleteStock = useCallback((stock) => runWithLoading(async () => {
    if (!session) {
      throw new Error('먼저 기기를 연결하세요.');
    }

    const baseUrl = normalizeBaseUrl(apiBaseUrl);
    await deleteMobileStock({
      baseUrl,
      session,
      stockId: stock.id
    });

    setStocks((current) => current.filter((item) => item.id !== stock.id));
    if (editingStockId === stock.id) {
      closeStockForm();
    }
    setMessage(`${stock.displayName || stock.symbol} 종목을 삭제했습니다.`);
  }), [apiBaseUrl, closeStockForm, editingStockId, runWithLoading, session]);

  const confirmDeleteStock = useCallback((stock) => {
    Alert.alert(
      '종목 삭제',
      `${stock.displayName || stock.symbol} 종목을 삭제할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => handleDeleteStock(stock)
        }
      ]
    );
  }, [handleDeleteStock]);

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
          connected
            ? e(StockFormPanel, {
              open: stockFormOpen,
              editing: Boolean(editingStockId),
              form: stockForm,
              loading,
              onOpen: openNewStockForm,
              onCancel: closeStockForm,
              onSubmit: handleSubmitStock,
              onChange: updateStockFormField
            })
            : null,
          e(StatusLine, { message, loading })
        ),
        renderItem: ({ item }) => e(StockCard, {
          stock: item,
          loading,
          onEdit: openEditStockForm,
          onDelete: confirmDeleteStock,
          onToggleActive: handleToggleStockActive
        }),
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

function StockFormPanel({ open, editing, form, loading, onOpen, onCancel, onSubmit, onChange }) {
  if (!open) {
    return e(View, { style: styles.panel },
      e(View, { style: styles.panelHeader },
        e(View, null,
          e(Text, { style: styles.panelTitle }, '종목 관리'),
          e(Text, { style: styles.panelSubtitle }, '앱에서 내 기기의 감시 종목을 직접 관리합니다.')
        ),
        e(ActionButton, { label: '종목 추가', onPress: onOpen, disabled: loading, variant: 'primary' })
      )
    );
  }

  return e(View, { style: styles.panel },
    e(View, { style: styles.panelHeader },
      e(View, null,
        e(Text, { style: styles.panelTitle }, editing ? '종목 편집' : '종목 등록'),
        e(Text, { style: styles.panelSubtitle }, editing ? '종목 코드는 변경하지 않고 조건만 수정합니다.' : '필수값은 종목 코드와 알림 조건입니다.')
      )
    ),
    e(FormInput, {
      label: '종목 코드',
      value: form.symbol,
      onChangeText: (value) => onChange('symbol', value),
      placeholder: '336260, 33626L, AAPL',
      editable: !editing
    }),
    e(FormInput, {
      label: '표시 이름',
      value: form.displayName,
      onChangeText: (value) => onChange('displayName', value),
      placeholder: '두산퓨얼셀'
    }),
    e(View, { style: styles.formRow },
      e(FormInput, {
        label: '매수가',
        value: form.purchasePrice,
        onChangeText: (value) => onChange('purchasePrice', value),
        placeholder: '80000',
        keyboardType: 'decimal-pad'
      }),
      e(FormInput, {
        label: '보유 수량',
        value: form.quantity,
        onChangeText: (value) => onChange('quantity', value),
        placeholder: '10',
        keyboardType: 'decimal-pad'
      })
    ),
    e(View, { style: styles.formRow },
      e(FormInput, {
        label: '매수일',
        value: form.purchaseDate,
        onChangeText: (value) => onChange('purchaseDate', value),
        placeholder: 'YYYY-MM-DD'
      }),
      e(FormInput, {
        label: '반복 분',
        value: form.alertCooldownMinutes,
        onChangeText: (value) => onChange('alertCooldownMinutes', value),
        placeholder: '30',
        keyboardType: 'number-pad'
      })
    ),
    e(AlertTypeSelector, {
      value: form.alertType,
      onChange: (value) => onChange('alertType', value)
    }),
    e(View, { style: styles.formRow },
      e(FormInput, {
        label: '하락률/반납률 %',
        value: form.thresholdPercent,
        onChangeText: (value) => onChange('thresholdPercent', value),
        placeholder: '10',
        keyboardType: 'decimal-pad'
      }),
      e(FormInput, {
        label: '직접 기준가',
        value: form.targetPrice,
        onChangeText: (value) => onChange('targetPrice', value),
        placeholder: '95000',
        keyboardType: 'decimal-pad'
      })
    ),
    e(View, { style: styles.formRow },
      e(FormInput, {
        label: '투자 목표가',
        value: form.investmentTargetPrice,
        onChangeText: (value) => onChange('investmentTargetPrice', value),
        placeholder: '120000',
        keyboardType: 'decimal-pad'
      }),
      e(FormInput, {
        label: '실적 체크일',
        value: form.reviewDate,
        onChangeText: (value) => onChange('reviewDate', value),
        placeholder: 'YYYY-MM-DD'
      })
    ),
    e(FormInput, {
      label: '매수 이유',
      value: form.investmentReason,
      onChangeText: (value) => onChange('investmentReason', value),
      placeholder: '보유 이유',
      multiline: true
    }),
    e(FormInput, {
      label: '매도 조건',
      value: form.sellCondition,
      onChangeText: (value) => onChange('sellCondition', value),
      placeholder: '팔아야 하는 조건',
      multiline: true
    }),
    e(FormInput, {
      label: '기타 메모',
      value: form.notes,
      onChangeText: (value) => onChange('notes', value),
      placeholder: '추가 메모',
      multiline: true
    }),
    editing
      ? e(ToggleRow, {
        label: '알림 상태',
        value: form.active !== false,
        onChange: (value) => onChange('active', value)
      })
      : null,
    e(View, { style: styles.formActions },
      e(ActionButton, { label: '취소', onPress: onCancel, disabled: loading, variant: 'secondary' }),
      e(ActionButton, { label: editing ? '수정' : '등록', onPress: onSubmit, disabled: loading, variant: 'primary' })
    )
  );
}

function FormInput({ label, value, onChangeText, placeholder, keyboardType, multiline, editable = true }) {
  return e(View, { style: styles.formField },
    e(Text, { style: styles.formLabel }, label),
    e(TextInput, {
      style: [
        styles.input,
        multiline ? styles.textarea : null,
        editable ? null : styles.inputDisabled
      ],
      value,
      onChangeText,
      placeholder,
      placeholderTextColor: colors.dim,
      keyboardType,
      multiline,
      editable,
      autoCapitalize: 'none',
      autoCorrect: false
    })
  );
}

function AlertTypeSelector({ value, onChange }) {
  return e(View, { style: styles.formField },
    e(Text, { style: styles.formLabel }, '알림 기준'),
    e(View, { style: styles.segmentedControl },
      ...ALERT_TYPE_OPTIONS.map((option) => {
        const active = option.value === value;

        return e(Pressable, {
          key: option.value,
          onPress: () => onChange(option.value),
          style: [styles.segmentButton, active ? styles.segmentButtonActive : null]
        },
          e(Text, {
            style: [styles.segmentButtonText, active ? styles.segmentButtonTextActive : null]
          }, option.label)
        );
      })
    )
  );
}

function ToggleRow({ label, value, onChange }) {
  return e(View, { style: styles.toggleRow },
    e(Text, { style: styles.formLabel }, label),
    e(Pressable, {
      onPress: () => onChange(!value),
      style: [styles.toggleButton, value ? styles.toggleButtonOn : styles.toggleButtonOff]
    },
      e(Text, { style: styles.toggleButtonText }, value ? 'ON' : 'OFF')
    )
  );
}

function StockCard({ stock, loading, onEdit, onDelete, onToggleActive }) {
  const currentPrice = formatCurrency(stock.lastPrice ?? stock.currentPrice, stock.currency || 'KRW');
  const thresholdPrice = formatCurrency(getThresholdPrice(stock), stock.currency || 'KRW');
  const drawdown = formatSignedPercent(stock.drawdownPercent);
  const profitRetracement = stock.profitRetracementPercent === null || stock.profitRetracementPercent === undefined
    ? '-'
    : formatPercent(stock.profitRetracementPercent);
  const danger = stock.alertState === 'triggered';
  const active = stock.active !== false;

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
      `알림 ${active ? 'ON' : 'OFF'} · 기준 ${formatAlertType(stock.alertType)}`
    ),
    e(View, { style: styles.stockActions },
      e(InlineButton, {
        label: '편집',
        onPress: () => onEdit(stock),
        disabled: loading
      }),
      e(InlineButton, {
        label: active ? '알림 끄기' : '알림 켜기',
        onPress: () => onToggleActive(stock),
        disabled: loading
      }),
      e(InlineButton, {
        label: '삭제',
        onPress: () => onDelete(stock),
        disabled: loading,
        danger: true
      })
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

function InlineButton({ label, onPress, disabled, danger }) {
  return e(Pressable, {
    accessibilityRole: 'button',
    onPress,
    disabled,
    style: [
      styles.inlineButton,
      danger ? styles.inlineButtonDanger : null,
      disabled ? styles.buttonDisabled : null
    ]
  },
    e(Text, { style: [styles.inlineButtonText, danger ? styles.inlineButtonTextDanger : null] }, label)
  );
}

function EmptyState({ connected }) {
  return e(View, { style: styles.emptyState },
    e(Text, { style: styles.emptyTitle }, connected ? '등록된 종목이 없습니다.' : '기기 연결이 필요합니다.'),
    e(Text, { style: styles.emptyText }, connected ? '웹앱 또는 텔레그램에서 종목을 등록하면 여기에 표시됩니다.' : '서버 주소를 확인하고 기기를 연결하세요.')
  );
}

function getThresholdPrice(stock) {
  const alertType = stock.alertType || 'high_drawdown';
  const thresholdPercent = Number(stock.thresholdPercent || 0);
  const highPrice = Number(stock.highPrice);
  const purchasePrice = Number(stock.purchasePrice);
  const targetPrice = Number(stock.targetPrice);

  if (alertType === 'target_price' && Number.isFinite(targetPrice) && targetPrice > 0) {
    return targetPrice;
  }

  if (alertType === 'purchase_loss' && Number.isFinite(purchasePrice) && purchasePrice > 0) {
    return purchasePrice * (1 - thresholdPercent / 100);
  }

  if (
    alertType === 'profit_retracement' &&
    Number.isFinite(highPrice) &&
    Number.isFinite(purchasePrice) &&
    highPrice > purchasePrice
  ) {
    return highPrice - (highPrice - purchasePrice) * (thresholdPercent / 100);
  }

  if (Number.isFinite(highPrice) && highPrice > 0) {
    return highPrice * (1 - thresholdPercent / 100);
  }

  return stock.lastAlertThresholdPrice;
}

function formatAlertType(value) {
  const option = ALERT_TYPE_OPTIONS.find((item) => item.value === value);

  return option ? option.label : '최고가';
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
  panelHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  panelSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3
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
  inputDisabled: {
    opacity: 0.65
  },
  textarea: {
    minHeight: 76,
    paddingTop: 11,
    textAlignVertical: 'top'
  },
  formRow: {
    flexDirection: 'row',
    gap: 8
  },
  formField: {
    flex: 1,
    gap: 6
  },
  formLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800'
  },
  formActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2
  },
  segmentedControl: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  segmentButton: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  segmentButtonActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent
  },
  segmentButtonText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center'
  },
  segmentButtonTextActive: {
    color: colors.accent
  },
  toggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  toggleButton: {
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 64,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  toggleButtonOn: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent
  },
  toggleButtonOff: {
    backgroundColor: colors.surface2,
    borderColor: colors.border
  },
  toggleButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center'
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
  stockActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7
  },
  inlineButton: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  inlineButtonDanger: {
    backgroundColor: colors.redSoft,
    borderColor: colors.red
  },
  inlineButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800'
  },
  inlineButtonTextDanger: {
    color: colors.red
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
