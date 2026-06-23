> **보관 문서 (WBS 13.4)** — `mobile/` 앱과 `/api/mobile/*` API는 제거되었습니다. 아래 내용은 2026-05-21 당시 실기기 E2E 절차 기록입니다.

# 모바일 실기기 E2E 테스트

날짜 기준: 2026-05-21

목적: 실제 iPhone/Android 휴대폰에서 Stock Alarm 모바일 앱이 로컬 서버와 연결되고, 익명 기기 등록, 종목 CRUD, 푸시 토큰 저장, 테스트 푸시까지 이어지는지 확인합니다.

## 사전 점검 명령

```powershell
npm run check:mobile-e2e
npm run check:mobile-e2e -- --json
npm run check:mobile-e2e -- --server-url http://192.168.x.x:3001
```

이 점검은 아래 항목을 확인합니다.

- Expo SDK 55 실행에 필요한 Node.js 버전
- `mobile/package.json`, `mobile/app.json`, 핵심 모바일 소스 파일
- `expo-secure-store`, `expo-notifications` 설정
- Stock Alarm 서버 실행 여부
- 실제 휴대폰에서 접근 가능한 LAN URL 존재 여부
- `/api/mobile/ping` 응답 여부
- Expo Push endpoint HTTPS 여부
- 실기기 테스트 문서 존재 여부

## 권장 실행 순서

1. 기존 PC 전용 서버를 안전 종료합니다.

```powershell
npm run stop
```

2. 휴대폰 접속 모드로 서버를 시작합니다.

```powershell
npm run local:phone
```

3. 출력에 표시된 LAN 주소를 확인합니다.

예시:

```text
같은 Wi-Fi 휴대폰 접속 주소:
- http://192.168.0.15:3001
```

4. 모바일 E2E 준비 점검을 실행합니다.

```powershell
npm run check:mobile-e2e
```

5. 모바일 앱 의존성을 설치합니다.

```powershell
npm run mobile:install
```

6. Expo 앱을 시작합니다.

```powershell
npm run mobile:start
```

7. 휴대폰의 Expo Go 또는 개발 빌드에서 QR 코드를 엽니다.

8. 앱의 서버 주소 입력칸에 `npm run local:phone`에서 나온 LAN URL을 입력합니다.

## 실기기 테스트 시나리오

| 순서 | 항목 | 기대 결과 |
|---:|---|---|
| 1 | 서버 연결 | `GET /api/mobile/ping` 성공, 앱에서 연결 완료 표시 |
| 2 | 기기 등록 | `POST /api/devices` 성공, `deviceId`와 `deviceSecret` 저장 |
| 3 | 내 종목 조회 | `GET /api/mobile/stocks` 성공, 내 기기 기준 종목/알림/배당 캘린더 표시 |
| 4 | 종목 등록 | 모바일 앱에서 테스트 종목 등록 성공 |
| 5 | 종목 편집 | 알림 기준, 수량, 알림 ON/OFF 수정 성공 |
| 6 | 종목 삭제 | 등록한 테스트 종목 삭제 성공 |
| 7 | 푸시 권한 | OS 알림 권한 허용 후 Expo Push Token 발급 |
| 8 | 푸시 토큰 저장 | `POST /api/mobile/push-token` 성공, 서버 기기 정보에 토큰 표시 |
| 9 | 테스트 푸시 | `POST /api/mobile/push-test` 후 휴대폰에 알림 도착 |
| 10 | 가격 알림 푸시 | 가격 알림 발생 시 텔레그램과 별도로 모바일 푸시 전송 기록 표시 |

## 현재 확인된 주의점

- PC 전용 서버인 `npm run local:start` 또는 `node scripts/local-server.js start` 상태에서는 실제 휴대폰이 `127.0.0.1`에 접근할 수 없습니다.
- 실제 휴대폰 테스트는 반드시 `npm run local:phone`으로 서버를 시작하고, 앱에는 `http://192.168.x.x:<포트>` 형태의 LAN URL을 입력해야 합니다.
- Windows 방화벽이 Node.js 접근 허용을 물어보면 같은 Wi-Fi 테스트를 위해 허용해야 합니다.
- Expo Push Token 발급은 기기, Expo Go/개발 빌드 상태, OS 알림 권한, EAS projectId 설정의 영향을 받습니다.
- 앱 기본 서버 URL은 개발 편의를 위해 `http://127.0.0.1:3001`이지만, 실기기에서는 이 값을 그대로 쓰면 안 됩니다.

## 판정 기준

- `READY`: 휴대폰 접속 가능한 LAN 서버, 모바일 ping API, Expo 설정이 모두 준비됨
- `NOT READY`: PC 전용 서버, 서버 미실행, ping 실패, 필수 모바일 설정 누락 중 하나 이상 존재

실제 알림 수신까지 완료하면 테스트 결과를 이 문서의 실행 기록 섹션에 추가합니다.

## 실행 기록

아직 실제 휴대폰 수신 테스트는 실행하지 않았습니다. 현재 개발 단계에서는 `npm run check:mobile-e2e` 점검 CLI와 테스트 절차를 추가했습니다.

2026-05-21 현재 PC에서 `npm run check:mobile-e2e`를 실행한 결과는 `NOT READY`입니다.

확인된 차단 항목:

- Node.js가 `v20.11.0`으로 확인되어 Expo SDK 55 권장 기준 `20.19.0` 이상을 만족하지 못합니다.
- 서버가 `http://127.0.0.1:3001` PC 전용 모드로 실행 중이라 같은 Wi-Fi 휴대폰 접속 주소가 없습니다.

확인된 정상 항목:

- 모바일 package와 Expo 앱 설정 파일은 존재합니다.
- `expo-secure-store`, `expo-notifications` 의존성과 플러그인이 설정되어 있습니다.
- PC 기준 `/api/mobile/ping`은 응답합니다.
- Expo Push endpoint는 HTTPS입니다.

다음 실제 테스트 전에 Node.js를 `20.19.0` 이상으로 올리고, `npm run stop` 후 `npm run local:phone`으로 서버를 다시 시작해야 합니다.

2026-05-21 추가 실행:

- `npm run local:phone`으로 서버를 휴대폰 접속 모드로 전환했습니다.
- 같은 Wi-Fi 접속 주소가 `http://172.29.45.46:3001`로 확인됐습니다.
- `http://172.29.45.46:3001/api/mobile/ping`은 `200 OK`로 응답했습니다.
- 기본 터미널의 `npm run check:mobile-e2e`는 Node.js `v20.11.0` 때문에 아직 `NOT READY`입니다.
- Node.js `22.12.0`을 `nvm install`로 설치 시도했으나, 명령은 성공 메시지를 냈지만 `nvm list`에는 반영되지 않았습니다. 현재 nvm root가 `C:\Program Files\nvm`이므로 관리자 권한 문제일 가능성이 있습니다.

남은 조치:

1. 관리자 권한 터미널에서 `nvm install 22.12.0`과 `nvm use 22.12.0`을 다시 실행하거나, Node.js `20.19.0` 이상 LTS를 직접 설치합니다.
2. 새 터미널에서 `node -v`가 `20.19.0` 이상인지 확인합니다.
3. `npm run check:mobile-e2e`가 error 0개로 바뀌는지 확인합니다.
4. 그 다음 `npm run mobile:install`, `npm run mobile:start`를 실행하고 실제 휴대폰에서 QR 코드를 엽니다.
