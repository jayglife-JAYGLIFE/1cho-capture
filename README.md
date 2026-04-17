# 1초캡처

알캡처 스타일의 빠른 크로스플랫폼(Mac + Windows) 스크린 캡처 도구.

## 기능

- **영역 캡처 (직접 지정)** — `Ctrl+Shift+C` — 드래그로 원하는 영역 선택
- **전체 화면 캡처** — `Ctrl+Shift+Z`
- **창 캡처** — `Ctrl+Shift+X`
- **스크롤 캡처** — `Ctrl+Shift+V` — 긴 페이지 스티칭 (MVP: 반자동)
- **편집기** — 펜, 직선, 화살표, 사각형, 원, 텍스트, 모자이크, 되돌리기
- **클립보드 자동 복사** + **파일 저장**
- **트레이/메뉴바 상주**

> 단축키는 설정 창에서 자유롭게 변경할 수 있습니다.

## 개발 실행

```bash
npm install
npm run dev
```

앱이 트레이(Mac 메뉴바 / Windows 시스템 트레이)에 상주합니다. 단축키로 캡처하세요.

## 빌드

```bash
npm run build:mac    # macOS .dmg
npm run build:win    # Windows .exe (NSIS + portable)
```

## 플랫폼별 주의사항

### macOS
첫 실행 시 **화면 녹화 권한**을 요청합니다. 시스템 설정 → 개인정보 보호 및 보안 → 화면 녹화에서 허용하세요.

### Windows
관리자 권한 불필요. 단축키 충돌이 있을 경우 설정에서 변경하세요.

## 아이콘 교체

`resources/tray-icon.png`과 `resources/icon.png`을 원하는 이미지로 교체하세요. 트레이 아이콘은 **16x16** (Mac은 템플릿 이미지로 처리됨), 앱 아이콘은 **512x512** 권장.

## 기술 스택

- Electron 31 + electron-vite
- React 18 + TypeScript
- Tailwind CSS
- Konva.js (캔버스 편집기)
- electron-store (설정 영속화)
- 네이티브 캡처: macOS `screencapture`, Windows PowerShell `System.Drawing`
