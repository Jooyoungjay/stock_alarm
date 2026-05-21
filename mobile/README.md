# Stock Alarm Mobile

Expo 기반 모바일 앱 초기 프로젝트입니다. 현재 단계는 로컬 Stock Alarm 서버에 연결해서 익명 기기를 등록하고, 그 기기의 종목을 조회, 등록, 편집, 삭제하는 앱 골격입니다.

## 준비

Expo SDK 55는 Node.js `20.19.0` 이상이 필요합니다. 모바일 앱을 설치하거나 실행하기 전에 아래 명령으로 버전을 확인하세요.

```powershell
node -v
```

루트 서버를 먼저 실행합니다.

```powershell
cd "C:\My Web Sites\stock_alarm"
npm run local:start
```

실제 휴대폰에서 테스트하려면 같은 Wi-Fi에서 접속 가능한 주소가 필요합니다.

```powershell
npm run local:phone
```

실기기 테스트 전에는 루트에서 준비 상태를 점검합니다.

```powershell
npm run check:mobile-e2e
```

## 설치

```powershell
cd "C:\My Web Sites\stock_alarm\mobile"
npm install
```

루트에서도 실행할 수 있습니다.

```powershell
cd "C:\My Web Sites\stock_alarm"
npm run mobile:install
```

## 실행

```powershell
cd "C:\My Web Sites\stock_alarm\mobile"
npm start
```

또는 루트에서:

```powershell
npm run mobile:start
```

Expo 앱에서 서버 주소를 입력합니다.

| 환경 | 서버 주소 예시 |
|---|---|
| iOS 시뮬레이터 | `http://127.0.0.1:3001` |
| Android 에뮬레이터 | `http://10.0.2.2:3001` |
| 실제 휴대폰 | `start-phone.bat` 또는 `npm run local:phone`에 표시된 LAN 주소 |

## 현재 범위

- Expo SDK 55 앱 설정
- iOS/Android 앱 식별자 기본값
- SecureStore 기반 익명 기기 인증 정보 저장
- 서버 상태 확인
- `POST /api/devices` 기기 연결
- `GET /api/mobile/stocks` 내 종목 조회
- 배당 캘린더와 알림 기록 상세 표시
- `POST /api/mobile/push-token` Expo Push Token 등록
- `POST /api/mobile/push-test` 테스트 푸시 전송
- `POST /api/mobile/stocks` 내 종목 등록
- `PATCH /api/mobile/stocks/<stockId>` 내 종목 편집과 알림 ON/OFF
- `DELETE /api/mobile/stocks/<stockId>` 내 종목 삭제

실제 휴대폰에서 푸시가 도착하려면 Node.js `20.19.0` 이상, 같은 Wi-Fi LAN 서버 주소, OS 알림 권한, Expo Push Token 발급이 모두 맞아야 합니다. 상세 절차는 `docs/mobile-real-device-e2e.md`에 정리되어 있습니다.
