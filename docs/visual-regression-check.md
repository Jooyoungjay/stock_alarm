# 브라우저 시각 회귀 점검

사용자 화면과 관리자 화면을 실제 브라우저 폭으로 열어 빈 화면, 핵심 영역 누락, 스크린샷 생성, 가로 넘침, 콘솔 오류를 빠르게 확인하는 점검 절차입니다.

## 목적

- 사용자 화면(`/`)과 관리자 화면(`/admin`)을 데스크톱/모바일 폭으로 자동 캡처합니다.
- `내 계좌 상황`, 포트폴리오 요약, 감시 종목 목록, 알림 기록, 서버 상태, 개발 로드맵, 백업 영역 같은 핵심 UI가 보이는지 확인합니다.
- `Failed to fetch` 같은 콘솔 오류와 모바일 가로 스크롤 넘침을 조기에 잡습니다.
- 생성된 스크린샷은 로컬 확인용이며 Git에 올리지 않습니다.

## 실행 전 준비

서버를 먼저 켭니다.

```powershell
npm run local:start
```

실행 중인 주소를 확인합니다.

```powershell
npm run local:status
```

실제 브라우저 캡처에는 Playwright가 필요합니다. 아직 설치하지 않았다면 개발 PC에서 한 번만 설치합니다.

```powershell
npm install --save-dev playwright
npx playwright install chromium
```

네트워크 제한이 있는 환경에서는 설치가 실패할 수 있습니다. 이 경우 CLI는 `NOT READY`와 함께 Playwright가 필요하다는 사유를 출력합니다.

## 실행 방법

기본 서버 주소가 `http://127.0.0.1:3000`이면 아래 명령을 사용합니다.

```powershell
npm run check:visual
```

서버가 3001에서 실행 중이면 주소를 지정합니다.

```powershell
npm run check:visual -- --base-url http://127.0.0.1:3001
```

`ADMIN_TOKEN`을 설정한 관리자 화면까지 인증된 상태로 캡처하려면 토큰을 전달합니다.

```powershell
npm run check:visual -- --base-url http://127.0.0.1:3001 --admin-token "설정한_ADMIN_TOKEN"
```

JSON 출력이 필요하면 아래 옵션을 사용합니다.

```powershell
npm run check:visual -- --json
```

경고도 실패로 처리하려면 아래 옵션을 사용합니다.

```powershell
npm run check:visual -- --fail-on-warn
```

## 캡처 대상

| ID | 화면 | 경로 | 크기 | 핵심 확인 영역 |
|---|---|---|---|---|
| `user-desktop` | 사용자 데스크톱 | `/` | 1440x900 | 헤더, 내 계좌 상황, 종목 등록, 포트폴리오 요약, 감시 종목, 알림 기록 |
| `user-mobile` | 사용자 모바일 | `/` | 390x844 | 헤더, 내 계좌 상황, 모바일 등록 버튼, 포트폴리오 요약, 감시 종목, 하단 내비게이션 |
| `admin-desktop` | 관리자 데스크톱 | `/admin` | 1440x900 | 관리자 보호, 서버 상태, 운영 진단, 개발 로드맵, 백업 |
| `admin-mobile` | 관리자 모바일 | `/admin` | 390x844 | 관리자 보호, 서버 상태, 개발 로드맵, 백업 |

## 출력 위치

기본 스크린샷 저장 위치:

```text
data/visual-regression/latest/
```

다른 위치에 저장하려면 아래처럼 지정합니다.

```powershell
npm run check:visual -- --output-dir data/visual-regression/2026-05-21
```

## 결과 해석

- `READY`: 핵심 셀렉터가 보이고, 스크린샷 파일이 정상 크기로 저장됐으며, 치명 오류가 없습니다.
- `NOT READY`: 서버 주소 오류, Playwright 미설치, 화면 로딩 실패, 핵심 영역 누락, 빈 화면, 스크린샷 생성 실패 중 하나가 발생했습니다.
- `WARN`: 가로 넘침 또는 브라우저 콘솔 오류가 감지됐습니다. 실제 사용 화면을 확인하고 CSS 또는 API 오류를 보정해야 합니다.

## 주의사항

- 이 CLI는 서버를 자동으로 켜거나 끄지 않습니다. 회사 PC에서 다른 포트를 실수로 종료하지 않기 위해 실행 중인 서버 확인은 `npm run local:status`로 따로 수행합니다.
- 관리자 화면은 토큰이 없으면 잠금 상태를 캡처합니다. 인증된 관리자 화면까지 보려면 `--admin-token`을 사용합니다.
- 생성된 PNG 파일은 로컬 점검용입니다. 기본 경로 `data/visual-regression/`은 Git에서 제외합니다.
