> **과거 기록** — 2026-05-21 당시 전수 테스트 실행 기록입니다. 모바일/Postgres/스토어 항목이 포함되어 있으며, 현재 회귀 기준은 [개인용 회귀 테스트 시나리오](full-regression-test-scenarios.md)(WBS 13.10·14.1, `npm test` 247개)를 따릅니다.

# Stock Alarm 전수 테스트 실행 기록 - 2026-05-21

## 요약

2026-05-21 로컬 PC 기준으로 전수 테스트 시나리오를 실행했습니다. 자동 회귀 테스트와 핵심 로컬 서버/API/브라우저 검증은 통과했습니다.

실행 중 저장소 쓰기 안정성 결함 1건을 발견했고 수정했습니다. 공개 배포, 스토어 제출 자산, KIS 실계정, 공공데이터 실호출은 현재 로컬 환경 또는 키 설정 상태 때문에 `NOT READY` 또는 실패로 남겼습니다.

## 실행 환경

| 항목 | 값 |
|---|---|
| 기준일 | 2026-05-21 |
| 실행 방식 | 로컬 PC |
| 서버 주소 | `http://127.0.0.1:3001` |
| 저장소 | JsonStore |
| 브라우저 검증 | Codex in-app browser |

## 자동 테스트 결과

| 구분 | 명령 | 결과 | 비고 |
|---|---|---|---|
| 전체 회귀 | `npm test` | 통과 | 238개 통과 |
| 저장소 회귀 | `node --test .\tests\storage.test.js` | 통과 | 14개 통과 |
| 저장소 문법 | `node --check src\storage.js` | 통과 | 문법 오류 없음 |
| 서버 문법 | `node --check src\server.js` | 통과 | 문법 오류 없음 |
| 웹앱 문법 | `node --check public\app.js` | 통과 | 문법 오류 없음 |

## CLI 점검 결과

| 구분 | 명령 | 결과 | 판단 |
|---|---|---|---|
| 증권사 adapter | `npm run check:broker-api` | READY, warn 1 | `BROKER_QUOTE_PROVIDER=none`은 로컬 기본값이라 허용 |
| HTTPS 데모 | `npm run check:demo` | NOT READY | 공개 HTTPS URL, 개인정보/지원 URL, `ADMIN_TOKEN` 필요. 로컬 개발 기준 예상 결과 |
| 스토어 자산 | `npm run check:store-assets` | NOT READY | 개인정보/지원 URL, 실제 스크린샷 6장 필요 |
| Railway 설정 | `node scripts\check-railway-config.js` | NOT READY | 현재는 로컬 실행 기준이라 `HOST=127.0.0.1`, `DATA_DIR=data` 경고가 정상 |
| 공공데이터 일봉 | `node scripts\check-publicdata-price.js 005930 2026-05-01 2026-05-15` | 실패 | `HTTP 403 Forbidden`. 서비스 키 또는 API 권한 확인 필요 |
| KIS 현재가 | `node scripts\check-kis-quote.js --symbol 336260 --market all` | 실패 | `KIS_APP_KEY`, `KIS_APP_SECRET` 미설정 |

## 서버/API 검증 결과

| 항목 | 결과 |
|---|---|
| 시작 전 상태 | 서버 미실행 |
| 서버 시작 | 성공, 포트 3001 |
| `/api/health` | 200 OK |
| `/api/roadmap` | 200 OK |
| `/api/data-model` | 200 OK |
| `/api/stocks` | 200 OK |
| `/api/dividend-calendar` | 200 OK |
| 서버 종료 | 성공 |
| 종료 확인 | 서버 미실행 |

## 브라우저 검증 결과

| 화면 | 확인 항목 | 결과 |
|---|---|---|
| `/` 사용자 화면 | `Stock Alarm`, `종목 등록`, `알림 기록`, `배당 캘린더` 표시 | 통과 |
| `/` 사용자 화면 | 가로 overflow 없음 | 통과 |
| `/` 사용자 화면 | 종목 등록 팝업 열림 | 통과 |
| `/` 사용자 화면 | 매수일 선택 입력 안내 표시 | 통과 |
| `/admin` 관리자 화면 | `Stock Alarm Admin`, `서버 상태`, `KIS/Naver 가격 비교` 표시 | 통과 |
| `/admin` 관리자 화면 | 다음 개발건 표시 | 통과 |
| `/admin` 관리자 화면 | 콘솔 오류 없음 | 통과 |

참고: 사용자 화면의 감시 영역은 현재 `감시 종목` 문구 대신 `내 계좌 상황` 중심으로 구성되어 있어, 시나리오 문구는 현행 화면 기준으로 해석했습니다.

## 발견 결함과 조치

| ID | 증상 | 원인 | 조치 | 상태 |
|---|---|---|---|---|
| REG-20260521-01 | 서버 시작 직후 `EPERM: operation not permitted, rename 'store.json.tmp' -> 'store.json'` 발생 | JsonStore가 고정 임시 파일명 `store.json.tmp`를 사용해 동시 저장 또는 Windows 파일 잠금에 취약 | 저장 임시 파일명을 고유하게 변경, rename 재시도 추가, JsonStore 쓰기 직렬화, 기존 `store.json.tmp` 자동 정리, 동시 쓰기 테스트 추가 | 완료 |

## 남은 미확인/후속 항목

| 항목 | 상태 | 다음 조치 |
|---|---|---|
| KIS 실계정 현재가 | 미확인 | KIS 앱 키/시크릿 설정 후 `check-kis-quote` 재실행 |
| 공공데이터 일봉 | 실패 | 공공데이터포털 서비스 키 권한, Encoding/Decoding 키, API 활용 신청 상태 재확인 |
| 텔레그램 실전송 | 부분 확인 | 네트워크 연결 상태에서 테스트 알림 재확인 |
| 모바일 실기기 | 미실행 | Expo 앱으로 실제 기기 등록, 종목 조회, 푸시 토큰 등록, 테스트 푸시 확인 |
| 스토어 제출 | 미준비 | 공개 개인정보/지원 URL, 앱 스크린샷 6장, 심사용 데모 URL 준비 |

## 최종 판정

로컬 MVP 핵심 기능은 자동 테스트와 브라우저/API 기준으로 통과했습니다. 발견된 저장소 쓰기 결함은 수정했고 회귀 테스트를 통과했습니다.

앱스토어/플레이스토어 제출 관점에서는 아직 공개 URL, 스크린샷, 실기기 푸시, 외부 API 실계정 검증이 남아 있습니다.
