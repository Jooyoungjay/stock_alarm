> **보관 문서 (WBS 13.5)** — 앱 출시·스토어·Railway 관련 산출물입니다. 개인 로컬 운영에서는 사용하지 않습니다.

# 앱 심사 준비 체크리스트

날짜 기준: 2026-05-20

이 문서는 Stock Alarm을 App Store와 Play Store에 올리기 전에 확인해야 하는 심사 준비 항목을 정리합니다. 현재 앱은 로컬 MVP와 Expo 모바일 앱 기반이며, 실제 제출 전에는 리뷰어가 접근 가능한 HTTPS 서버 또는 데모 환경이 필요합니다.

## 공식 기준

- Apple App Store Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple App privacy details: https://developer.apple.com/app-store/app-privacy-details/
- Apple Screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- Google Play User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Google Play Data safety section: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play preview assets: https://support.google.com/googleplay/android-developer/answer/9866151

## 앱 성격

- 앱 유형: 금융 카테고리의 개인 알림/포트폴리오 보조 앱
- 계정 방식: 계정 가입 없음, 익명 기기 ID 기반
- 핵심 기능: 사용자가 입력한 종목, 평단가, 수량, 알림 기준에 따라 가격 알림과 배당 일정 표시
- 제공하지 않는 기능: 투자 자문, 자동 매매, 주문 실행, 증권 계좌 연결, 수익 보장
- 시세 성격: 무료/공개 provider 기반이므로 지연, 누락, provider 장애 가능성이 있음

## 제출 전 필수 결정

| 항목 | 현재 상태 | 제출 전 필요 조치 |
|---|---|---|
| 서버 접속 | 사용자가 로컬 서버 주소를 입력 | 리뷰어가 접근 가능한 HTTPS 데모 서버 또는 TestFlight/내부 테스트 안내 필요. `npm run check:demo`로 제출 전 점검 |
| 개인정보 처리방침 URL | 문서 초안 있음 | `docs/privacy-policy-ko.md`를 공개 HTTPS URL로 게시 |
| 지원 URL | 미정 | GitHub README, 별도 고객지원 페이지, 또는 문의 페이지 URL 확정 |
| 지원 이메일 | `jumanz2@naver.com` | 실제 운영 문의 수신 가능 여부 확인 |
| 앱 아이콘 | Expo asset 경로 존재 | iOS/Android 해상도별 실제 아이콘 렌더링 확인 |
| 스크린샷 | 제작 가이드 작성 | [스토어 스크린샷 제작 가이드](store-screenshots.md) 기준으로 iPhone, iPad, Android phone 실제 캡처 파일 제작 |
| 데이터 삭제 | 로컬 기기 연결 해제만 있음 | 클라우드/공용 서버 운영 시 서버 저장 데이터 삭제 기능 필요 |

## 권한 설명

| 권한/기능 | 사용 이유 | 사용자에게 보일 설명 |
|---|---|---|
| 푸시 알림 | 가격 조건 도달, 테스트 푸시, 배당 일정 알림 | 사용자가 설정한 종목 알림을 보내기 위해 사용 |
| SecureStore/기기 보안 저장소 | 익명 기기 ID와 deviceSecret 저장 | 로그인 없이 기기를 식별하고 내 종목만 조회하기 위해 사용 |
| 네트워크 | Stock Alarm 서버, 시세/배당 provider 연결 | 서버 상태 확인, 종목 조회, 알림 설정 저장에 사용 |

푸시 알림은 선택 권한입니다. 사용자가 권한을 거부해도 서버 연결과 종목 조회는 가능해야 하며, 알림 전송만 제한됩니다.

## 데이터 인벤토리

| 데이터 | 위치 | 목적 | 민감도 |
|---|---|---|---|
| 익명 기기 ID | 앱 SecureStore, 서버 JSON/DB | 기기별 종목 분리 | 중간 |
| deviceSecret | 앱 SecureStore, 서버에는 해시만 저장 | 모바일 API 인증 | 높음 |
| Expo Push Token | 서버 JSON/DB | 모바일 푸시 전송 | 중간 |
| 종목 코드/이름 | 서버 JSON/DB | 시세와 배당 조회 | 낮음 |
| 평단가/수량/메모 | 서버 JSON/DB | 포트폴리오 계산과 알림 기준 | 높음 |
| 알림 이력 | 서버 JSON/DB | 사용자가 받은 알림 확인 | 중간 |
| provider 진단 로그 | 서버 JSON/DB | API 장애 원인 확인 | 낮음 |
| 백업 파일 | 로컬 `data/backups/` | 복구 | 높음 |

## 제3자 처리

| 대상 | 전달 가능 정보 | 목적 | 조건 |
|---|---|---|---|
| Expo Push service | Push token, 알림 제목/본문 | 모바일 푸시 전송 | 사용자가 푸시 권한을 허용한 경우 |
| Telegram Bot API | 알림 메시지, 종목명/가격 정보 | 텔레그램 알림 | 운영자가 봇 토큰과 채팅 ID를 설정한 경우 |
| 시세/배당 provider | 종목 코드, 회사명 후보 | 가격/배당 조회 | 시세 또는 배당 갱신 시 |
| GitHub | 코드만 저장 | 개발 협업 | 토큰, `.env`, `data/`는 업로드 금지 |

## App Store Connect 준비

- 번들 ID: `com.jooyoungjay.stockalarm`
- 암호화: 비면제 암호화 미사용, `usesNonExemptEncryption=false`
- 카테고리: Finance
- 연령 등급: 금융 정보 앱 기준으로 설문 응답
- 개인정보 라벨: 기기 식별자, 사용자 입력 금융 정보, 앱 활동/진단성 데이터 항목 검토
- 심사 메모: 계정 없음, 데모 서버 주소, 테스트 푸시 방법, 매매/자문 기능 없음 명시

## Play Console 준비

- 패키지명: `com.jooyoungjay.stockalarm`
- 앱 카테고리: Finance
- Data safety: `mobile/store-listing.ko.json`의 `dataSafety`를 기준으로 입력
- 개인정보 처리방침 URL: 공개 HTTPS URL 필요
- 계정 삭제 항목: 계정 생성 없음으로 설명하되, 서버 데이터 삭제 방법은 운영 형태에 맞게 제공
- 권한: 알림 권한 목적을 가격/배당 알림으로 설명

## 심사 메모 초안

```text
Stock Alarm은 계정 가입 없이 익명 기기 ID로 동작하는 주식 알림 앱입니다.
사용자가 직접 서버 주소를 입력하고, 보유 종목/평단가/수량/알림 기준을 입력하면 가격 조건 도달 여부와 배당 일정을 확인합니다.
앱은 투자 자문, 매매 주문, 증권 계좌 연결 기능을 제공하지 않습니다.

테스트 순서:
1. 제공된 HTTPS 데모 서버 주소를 앱의 서버 주소 입력칸에 입력합니다.
2. '기기 연결'을 누릅니다.
3. 테스트 종목을 등록하거나 기존 샘플 종목을 조회합니다.
4. '테스트 푸시'를 눌러 푸시 권한과 알림 수신을 확인합니다.
```

## HTTPS 데모 서버 점검

제출 전 아래 명령으로 공개 URL과 필수 환경변수를 확인합니다.

```powershell
npm run check:demo
```

세부 기준은 [HTTPS 데모 서버 준비](https-demo-server.md)에 정리되어 있습니다.

## 스토어 스크린샷 기준

스크린샷 화면 후보, 데모 데이터, 제출용 문구, 대체 텍스트는 [스토어 스크린샷 제작 가이드](store-screenshots.md)에 정리했습니다.

현재 `mobile/app.json`은 iPad 지원이 켜져 있으므로 App Store 제출 전 iPad 세트까지 준비해야 합니다. 모바일 앱에는 배당 캘린더와 알림 기록 상세 화면을 추가했으므로, 실제 제출 전에는 샘플 데이터가 있는 데모 서버에 연결한 상태로 캡처합니다.

## 스토어 제출 자산 점검

제출 직전 아래 명령으로 아이콘, 스토어 메타데이터, 개인정보/지원 URL, 스크린샷 파일, 심사 메모를 확인합니다.

```powershell
npm run check:store-assets
```

세부 기준은 [스토어 제출 자산 최종 점검](store-submission-assets.md)에 정리되어 있습니다.

## 제출 전 남은 작업

1. 개인정보 처리방침 초안을 공개 URL로 게시
2. 지원 URL 확정
3. 리뷰어가 접근 가능한 HTTPS 데모 서버 또는 내부 테스트 방식 확정
4. 앱 아이콘과 스플래시 이미지 실제 기기 렌더링 확인
5. `npm run check:store-assets` 기준 오류 제거
6. 스토어 스크린샷 실제 파일 캡처와 업로드
7. 서버 저장 데이터 삭제 API 또는 명확한 로컬 삭제 안내 확정
8. 시세/배당 데이터의 지연 가능성과 투자 자문 아님 문구를 앱 내부에도 유지
