export const JSON_LEGACY_POLICY_VERSION = 1;

export const JSON_LEGACY_REMOVAL_PHASES = Object.freeze([
  {
    id: 'documented',
    label: '문서화',
    status: 'completed',
    wbs: '14.8',
    description: 'deprecated 필드·엔터티·제거 기준을 문서와 코드 레지스트리에 고정합니다.'
  },
  {
    id: 'api_marked',
    label: 'API 표시',
    status: 'completed',
    wbs: '14.8',
    description: '`GET /api/data-model` 응답에 legacy 메타데이터를 포함합니다.'
  },
  {
    id: 'optional_migration',
    label: '선택적 정리',
    status: 'completed',
    wbs: '15.7',
    description:
      '백업 복구·수동 export 시 레거시 필드를 비우는 선택적 마이그레이션 CLI 또는 관리자 동작을 추가합니다.'
  },
  {
    id: 'removed',
    label: '제거',
    status: 'completed',
    wbs: '15.8',
    description:
      'schemaVersion bump와 함께 `devices`·푸시 필드·관련 storage contract 메서드를 제거합니다. 별도 WBS 승격 후 진행.'
  }
]);

export const JSON_LEGACY_ENTITIES = Object.freeze([
  {
    name: 'devices',
    storagePath: 'devices[]',
    deprecatedSince: 'WBS 13.4',
    reason: '모바일 앱·익명 기기 API 제거 후 개인 로컬·텔레그램 운영만 사용합니다.',
    replacement: '없음 — 단일 사용자 JSON 저장소',
    removalPhase: 'removed'
  },
  {
    name: 'push_tokens',
    storagePath: 'devices[].pushTokens[]',
    deprecatedSince: 'WBS 13.4',
    reason: 'Expo Push·FCM/APNS 토큰 등록 경로가 제거되었습니다.',
    replacement: '텔레그램 `deliveryStatus` / `sent` 필드',
    removalPhase: 'removed'
  }
]);

export const JSON_LEGACY_FIELDS = Object.freeze([
  {
    entity: 'stocks',
    name: 'deviceId',
    storagePath: 'stocks[].deviceId',
    deprecatedSince: 'WBS 13.4',
    reason: '기기별 종목 격리가 더 이상 필요하지 않습니다.',
    replacement: 'null 또는 생략',
    removalPhase: 'removed'
  },
  {
    entity: 'alerts',
    name: 'deviceId',
    storagePath: 'alerts[].deviceId',
    deprecatedSince: 'WBS 13.4',
    reason: '기기별 알림 기록 격리가 더 이상 필요하지 않습니다.',
    replacement: 'null 또는 생략',
    removalPhase: 'removed'
  },
  {
    entity: 'alerts',
    name: 'pushDeliveryStatus',
    storagePath: 'alerts[].pushDeliveryStatus',
    deprecatedSince: 'WBS 13.6',
    reason: '모바일 푸시 전송 경로가 제거되었습니다.',
    replacement: 'deliveryStatus (telegram) + sent',
    removalPhase: 'removed'
  },
  {
    entity: 'alerts',
    name: 'pushDeliveryError',
    storagePath: 'alerts[].pushDeliveryError',
    deprecatedSince: 'WBS 13.6',
    reason: '푸시 실패 사유 기록이 더 이상 갱신되지 않습니다.',
    replacement: 'deliveryStatus / sent',
    removalPhase: 'removed'
  },
  {
    entity: 'alerts',
    name: 'pushDeliverySent',
    storagePath: 'alerts[].pushDeliverySent',
    deprecatedSince: 'WBS 13.6',
    reason: '푸시 성공 카운트가 더 이상 갱신되지 않습니다.',
    replacement: 'sent (boolean)',
    removalPhase: 'removed'
  },
  {
    entity: 'alerts',
    name: 'pushDeliveryFailed',
    storagePath: 'alerts[].pushDeliveryFailed',
    deprecatedSince: 'WBS 13.6',
    reason: '푸시 실패 카운트가 더 이상 갱신되지 않습니다.',
    replacement: 'deliveryStatus',
    removalPhase: 'removed'
  }
]);

export const JSON_LEGACY_RELATIONSHIPS = Object.freeze([
  {
    from: 'stocks.deviceId',
    to: 'devices.id',
    deprecatedSince: 'WBS 13.4',
    removalPhase: 'removed'
  },
  {
    from: 'alerts.deviceId',
    to: 'devices.id',
    deprecatedSince: 'WBS 13.4',
    removalPhase: 'removed'
  },
  {
    from: 'devices.pushTokens',
    to: 'push_tokens',
    deprecatedSince: 'WBS 13.4',
    removalPhase: 'removed'
  }
]);

export const JSON_LEGACY_STORE_METHODS = Object.freeze([
  {
    name: 'createDevice',
    deprecatedSince: 'WBS 13.4',
    reason: '모바일 기기 등록 API 제거',
    removalPhase: 'removed'
  },
  {
    name: 'authenticateDevice',
    deprecatedSince: 'WBS 13.4',
    reason: '기기 시크릿 인증 경로 제거',
    removalPhase: 'removed'
  },
  {
    name: 'upsertDevicePushToken',
    deprecatedSince: 'WBS 13.4',
    reason: '푸시 토큰 등록 API 제거',
    removalPhase: 'removed'
  },
  {
    name: 'listDevicePushTokens',
    deprecatedSince: 'WBS 13.4',
    reason: '푸시 토큰 조회 API 제거',
    removalPhase: 'removed'
  }
]);

export const JSON_LEGACY_POLICY_DOC = 'docs/json-legacy-fields-deprecation.md';

export function getJsonLegacyFieldsPolicy() {
  return {
    policyVersion: JSON_LEGACY_POLICY_VERSION,
    documentation: JSON_LEGACY_POLICY_DOC,
    currentPhase: 'removed',
    phases: JSON_LEGACY_REMOVAL_PHASES.map(cloneEntry),
    entities: JSON_LEGACY_ENTITIES.map(cloneEntry),
    fields: JSON_LEGACY_FIELDS.map(cloneEntry),
    relationships: JSON_LEGACY_RELATIONSHIPS.map(cloneEntry),
    storeMethods: JSON_LEGACY_STORE_METHODS.map(cloneEntry),
    summary: {
      entityCount: JSON_LEGACY_ENTITIES.length,
      fieldCount: JSON_LEGACY_FIELDS.length,
      relationshipCount: JSON_LEGACY_RELATIONSHIPS.length,
      storeMethodCount: JSON_LEGACY_STORE_METHODS.length
    }
  };
}

export function isLegacyEntityName(name) {
  return JSON_LEGACY_ENTITIES.some((entry) => entry.name === name);
}

export function isLegacyFieldPath(storagePath) {
  const normalized = String(storagePath || '').trim();
  return JSON_LEGACY_FIELDS.some((entry) => entry.storagePath === normalized);
}

function cloneEntry(value) {
  return JSON.parse(JSON.stringify(value));
}
