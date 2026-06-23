> **보관 문서 (WBS 13.5)** — 앱 출시·스토어·Railway 관련 산출물입니다. 개인 로컬 운영에서는 사용하지 않습니다.

# HTTPS 데모 서버 준비

날짜 기준: 2026-05-19

이 문서는 App Store, Play Store 심사 또는 외부 테스트를 위해 리뷰어가 접속할 수 있는 HTTPS 데모 서버를 준비하는 기준입니다.

현재 기본 개발 방식은 로컬 PC 실행입니다. 데모 서버는 로컬 개발을 대체하는 운영 배포가 아니라, 앱 심사와 외부 확인을 위해 제한적으로 여는 별도 환경입니다.

## 목표

- 리뷰어가 모바일 앱에서 입력할 수 있는 공개 HTTPS 서버 URL을 준비합니다.
- 개인정보 처리방침 URL과 지원 URL을 HTTPS로 공개합니다.
- 관리자 화면과 운영 API를 `ADMIN_TOKEN`으로 보호합니다.
- 로컬 개발 데이터와 데모 서버 데이터를 분리합니다.
- 제출 전 누락된 환경변수를 `npm run check:demo`로 확인합니다.

## 권장 구조

```text
Mobile app reviewer
└─ HTTPS demo URL
   ├─ GET /api/health
   ├─ User app API
   ├─ Push token registration
   └─ /admin protected by ADMIN_TOKEN
```

데모 서버는 아래 중 하나로 준비합니다.

| 방식 | 용도 | 주의 |
|---|---|---|
| 임시 HTTPS 터널 | 짧은 내부 테스트 | PC가 꺼지면 접속 불가 |
| Railway/Render 계열 웹 서비스 | 앱 심사, 외부 테스트 | 환경변수와 데이터 보존 설정 필요 |
| 자체 HTTPS 서버 | 장기 운영 준비 | 인증서, 방화벽, 백업 운영 필요 |

현재 프로젝트 기준으로는 `railway.json`, `.env.railway.example`, `docs/railway-deploy.md`가 준비되어 있습니다. 실제 제출 직전에는 선택한 방식의 공개 HTTPS URL을 `REVIEW_DEMO_URL`에 넣고 점검합니다.

## 필수 환경변수

```text
REVIEW_DEMO_URL=https://your-demo.example.com
PRIVACY_POLICY_URL=https://your-demo.example.com/privacy
SUPPORT_URL=https://your-demo.example.com/support
REVIEW_NOTES_URL=https://your-demo.example.com/review-notes
ADMIN_TOKEN=long-random-review-token
HOST=0.0.0.0
DATA_DIR=/app/data
STORAGE_ENGINE=json
```

선택 기능까지 시연할 때:

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
MOBILE_PUSH_ENABLED=true
EXPO_PUSH_ENDPOINT=https://exp.host/--/api/v2/push/send
```

Postgres 데모를 사용할 경우:

```text
STORAGE_ENGINE=postgres
DATABASE_URL=postgres://...
```

PostgresStore의 기본 운영 테이블은 `stock_alarm_store`입니다. 실제 데모 서버에 연결하기 전에는 `npm run migrate:postgres:rehearsal`로 리허설 전용 테이블에서 import/export 건수를 먼저 확인합니다.

단, 기본 로컬 실행은 계속 `STORAGE_ENGINE=json`입니다.

## 준비 점검

사람이 읽는 보고서:

```powershell
npm run check:demo
```

JSON 출력:

```powershell
npm run check:demo -- --json
```

경고까지 실패로 처리:

```powershell
npm run check:demo -- --fail-on-warn
```

점검 항목:

- `REVIEW_DEMO_URL`이 localhost가 아닌 공개 HTTPS URL인지 확인
- `PRIVACY_POLICY_URL`과 `SUPPORT_URL`이 공개 HTTPS URL인지 확인
- `ADMIN_TOKEN` 설정 여부와 최소 길이 권장 확인
- 외부 서버용 `HOST=0.0.0.0` 권장 확인
- `STORAGE_ENGINE` 값과 `DATABASE_URL` 필요 여부 확인
- 푸시 알림 엔드포인트가 HTTPS인지 확인
- 텔레그램 시연용 토큰과 채팅 ID 누락 여부 확인

## 리뷰어 안내

앱 심사 메모에는 아래 정보를 넣습니다.

```text
Demo server: https://your-demo.example.com
Privacy policy: https://your-demo.example.com/privacy
Support: https://your-demo.example.com/support

Stock Alarm은 계정 가입 없이 익명 기기 ID로 동작합니다.
앱은 투자 자문, 매매 주문, 증권 계좌 연결 기능을 제공하지 않습니다.

테스트 순서:
1. 앱 첫 화면에서 Demo server URL을 입력합니다.
2. 기기 연결을 누릅니다.
3. 샘플 종목을 조회하거나 테스트 종목을 등록합니다.
4. 테스트 푸시 버튼으로 알림 권한과 푸시 수신을 확인합니다.
```

관리자 화면 주소는 리뷰어에게 기본 노출하지 않습니다. 필요한 경우에만 `/admin` 경로와 `ADMIN_TOKEN`을 별도 심사 메모에 적습니다.

## 운영 주의

- 데모 서버에는 실제 개인 투자 정보를 넣지 않습니다.
- 데모 데이터는 로컬 `data/`와 분리합니다.
- JSON 저장소를 쓰는 경우 재배포 후 데이터 보존을 위해 Volume 또는 영속 디스크가 필요합니다.
- 앱 제출 전에 `GET /api/health`가 HTTPS URL에서 정상 응답하는지 확인합니다.
- 개인정보 처리방침과 지원 URL은 앱 심사 중 계속 접근 가능해야 합니다.

## 남은 실제 제출 작업

1. 공개 HTTPS 데모 URL 확정
2. 개인정보 처리방침 공개 URL 확정
3. 지원 URL 확정
4. 앱 스크린샷 제작
5. 스토어 심사 메모에 데모 URL과 테스트 순서 입력
