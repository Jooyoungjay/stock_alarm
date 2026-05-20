# 스토어 제출 자산 최종 점검

날짜 기준: 2026-05-20

이 문서는 App Store와 Play Store 제출 직전에 확인해야 하는 아이콘, 스토어 메타데이터, 개인정보/지원 URL, 심사 메모, 실제 스크린샷 파일을 한 번에 점검하는 기준입니다.

## 실행 명령

기본 점검:

```powershell
npm run check:store-assets
```

JSON 출력:

```powershell
npm run check:store-assets -- --json
```

경고까지 실패로 처리:

```powershell
npm run check:store-assets -- --fail-on-warn
```

스크린샷 폴더 직접 지정:

```powershell
npm run check:store-assets -- --screenshot-dir mobile/store-assets/screenshots
```

## 환경변수

| 변수 | 예시 | 설명 |
|---|---|---|
| `PRIVACY_POLICY_URL` | `https://example.com/privacy` | 공개 HTTPS 개인정보 처리방침 URL |
| `SUPPORT_URL` | `https://example.com/support` | 공개 HTTPS 지원/문의 URL |
| `STORE_SCREENSHOT_DIR` | `mobile/store-assets/screenshots` | 실제 PNG/JPEG 스토어 스크린샷 파일 폴더 |

`PRIVACY_POLICY_URL`과 `SUPPORT_URL`은 `localhost`, `127.0.0.1`, `0.0.0.0` 주소가 아닌 공개 HTTPS 주소여야 합니다.

## 점검 항목

| 항목 | 기준 |
|---|---|
| 앱 설정 | `mobile/app.json`을 읽을 수 있어야 함 |
| iOS 번들 ID | `expo.ios.bundleIdentifier` 값 필요 |
| Android 패키지명 | `expo.android.package` 값 필요 |
| 앱 아이콘 | `expo.icon` 파일이 실제로 존재해야 함 |
| Android adaptive icon | `expo.android.adaptiveIcon.foregroundImage` 파일이 실제로 존재해야 함 |
| 스토어 메타데이터 | `mobile/store-listing.ko.json`의 앱 이름, 부제, 설명, 카테고리, 지원 이메일 필요 |
| 개인정보/지원 URL | 공개 HTTPS URL 필요 |
| 심사 메모 | 계정 없음, 데모 서버, 푸시 테스트, 투자 자문 아님 설명 필요 |
| Data safety | Google Play 입력 기준 필요 |
| 금융 고지 | 투자 자문, 매매 중개, 주문 실행 기능이 아님을 설명해야 함 |
| 문서 | 심사 준비, 개인정보 처리방침, 스크린샷 가이드 문서 필요 |
| 스크린샷 세트 | App Store와 Google Play 제출 세트 필요 |
| 스크린샷 문구 | 6장 이상의 제목, 설명, 140자 이하 대체 텍스트 필요 |
| 실제 스크린샷 파일 | 계획된 파일명과 같은 PNG/JPEG 파일 필요 |

## 스크린샷 파일명

`mobile/store-listing.ko.json`의 `storeScreenshots.screens[].fileName` 기준으로 파일을 찾습니다. 확장자는 `.png`, `.jpg`, `.jpeg`를 허용합니다.

현재 계획된 기본 파일명:

```text
01-portfolio-summary.png
02-watchlist-risk.png
03-stock-form.png
04-alert-toggle-push.png
05-dividend-calendar.png
06-alert-history.png
```

## 현재 저장소 상태

현재 저장소에는 스토어 스크린샷 문구와 체크리스트가 준비되어 있지만, 실제 PNG/JPEG 캡처 파일과 공개 개인정보/지원 URL은 아직 제출 직전에 채워야 합니다.

따라서 로컬 기본 환경에서 `npm run check:store-assets`가 `NOT READY`를 반환하는 것은 정상입니다. 제출 직전에는 실제 캡처 파일을 넣고 `PRIVACY_POLICY_URL`, `SUPPORT_URL`을 공개 HTTPS 주소로 설정한 뒤 다시 실행합니다.
