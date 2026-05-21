# NotePack CODEX v3.0.0

> **멀티 시드 카드팩 + 오프라인 캡처 + 일괄 AI 주석** 신규 기능 세트, **Plan mode 3종(OpenAI / Claude / Gemini) 완전 검증**, 그리고 **Gemini Plan 안정성·셀렉션 UX 전면 강화**까지 들어간 메이저 업데이트입니다.

> ℹ️ v2.x에서 별도 minor로 릴리스됐던 **v2.1.0** (보드/UX) 과 **v2.2.0** (커스텀 에이전트·Gemini CLI) 사항도 3.0.0 한 번에 받는 사용자를 위해 본 노트에 함께 정리되어 있습니다.

---

## ✨ Highlights (3.0.0 신규)

### 🎴 멀티 시드 아이디어 카드 생성

기존 v2.0.0의 카드 생성은 단일 메모 기반이었지만, v3.0.0에서는 **여러 메모를 시드로 묶어** 한 번에 카드를 뽑을 수 있습니다.

- 보드 컨트롤 줄의 **"다중 선택" 토글** 진입 또는 카드에 **Ctrl/Shift-click**
- 카드 2~5장 select 후 **"선택 시드로 카드 팩"** 버튼
- PackModal이 다중 시드 입력을 자동 인식 — 각 시드별 컨텍스트 블록 + cross-seed 카테고리 큐 자동 탐지 (생성된 카드들이 최소 2개 이상 시드를 참고하도록 강제)
- 단일 시드와 다중 시드 모두 동일 모델·동일 등급 시스템(기본/주목/핵심/원형)으로 5장 생성

### 🔌 오프라인 캡처 모드

> "AI 주석 없이 순수 포스트잇 메모장처럼 쓰고 싶다" 는 사용자 대응

- 헤더 우측 provider 텍스트 바로 밑에 **토글 버튼** (`○ 오프라인 캡처` / `● 오프라인 캡처`)
- ON 상태에서 메모를 추가하면 카드가 즉시 `ready` 상태로 저장 — AI 주석 호출 자체를 스킵
- 토글 상태는 **.codex 워크벤치 단위 저장** — 벤치마다 다르게 설정 가능
- 오프라인으로 모아둔 메모는 나중에 멀티 셀렉트 → 일괄 주석으로 한꺼번에 처리 가능 (아래 항목)

### 📋 멀티 셀렉트 + 일괄 AI 주석

여러 카드를 한 번에 선택해 일괄 작업.

- **멀티 셀렉트 진입**: 컨트롤 줄 "다중 선택" 토글 / 카드에 Ctrl(또는 Cmd)-click / 범위 선택 Shift-click
- **선택된 카드**: 좌상단에 진한 indigo ✓ 디스크 + 외곽선 + 글로우 헤일로 (눈에 띄게 강화 — 자세한 건 아래 UX 항목)
- **액션 바** (선택 시 보드 상단에 등장): "선택 카드 주석" / "선택 시드로 카드 팩" / "실패 N개 재시도" / "선택 해제"
- **일괄 주석 큐**: 동시성 3으로 chunk 처리, 실패 카드는 자동 추적 → 한 번에 재시도 가능
- **시각 인디케이터**: 일괄 처리 중 카드에도 단일 주석과 동일한 shimmer 애니메이션이 뜸 (3.0.0 이전엔 일괄에서만 안 보였음)
- **자동 정리**: 일괄 주석 완료 시 multi-select 모드 자동 해제 — 즉시 일반 클릭으로 복귀

### 🤖 Plan mode 3종 완성 — OpenAI / Claude / Gemini

v2.0.0 카탈로그엔 셋 다 등재돼 있었지만 실제 end-to-end 동작은 OpenAI Plan만 가능한 상태였습니다. v2.1~2.2 사이클을 거쳐 v3.0.0에서 **셋 다 검증 완료**:

| Provider | 인증 방식 | 검증 상태 |
|---|---|---|
| **OpenAI Plan** (ChatGPT 구독) | PKCE-only OAuth | v2.0.0부터 정식 ✓ |
| **Claude Plan** (Anthropic 구독) | PKCE-only OAuth | v3.0.0 검증 완료 ✓ |
| **Gemini Plan** (Google Code Assist) | BYO OAuth + 자동 free-tier onboarding | v2.2.0~v3.0.0 검증·안정화 완료 ✓ |

**Gemini Plan 카탈로그 정비**:
- `Gemini 2.5 Flash (Plan)` 신규 추가 — Code Assist free-tier에서 가장 안정 (v3 기본 fallback)
- `Gemini 2.5 Pro (Plan)` 신규 추가
- `Gemini 3 Flash (Plan)` / `Gemini 3 Pro Preview (Plan)` 유지 — 쿼터 가용 시 사용 가능
- `Gemini 3.1 Flash Lite (Plan)` 제거 — Code Assist 카탈로그에 실재하지 않는 alias로 확인됨

> **핵심 교훈**: Google Code Assist API의 모델 카탈로그는 AI Studio API와 **별도 set**. AI Studio에 보이는 모델 이름이 Code Assist에는 없을 수 있음. v3.0.0부터는 카탈로그 추가 전 실 endpoint 검증을 거친 모델만 등재.

### 🛠 Gemini Plan 안정성 강화 — 404의 진짜 원인 잡기

- **Code Assist managed project onboarding** 이 silent로 실패하면 envelope에 `project: undefined`로 나가서 Google이 "프로젝트 없음" 의미의 404를 던지는데, 사용자에게는 모델 deprecation으로 오해됐습니다. v3.0.0:
  - `setupCodeAssistUser`가 onboarding 실패 시 **명확한 에러를 throw** (이전엔 `undefined` 반환만)
  - lazy self-heal 경로에서도 **doomed 요청을 사전 차단** + 한국어 에러 메시지로 surface ("Code Assist 프로젝트가 설정되지 않았습니다 …")
  - connect 모달도 onboarding 실패 시 "연결됨" 토스트 안 띄우고 에러 표시
- **Stored chatModels 자동 마이그레이션**: 옛 plugin 버전에서 저장된 stale model 필드 (예: `gemini-3-flash` — Code Assist는 `gemini-3-flash-preview`로 알고 있음) 를 catalog 기준으로 강제 교정. 사용자가 따로 손댈 필요 없음
- **죽은 모델 ID 자동 정리**: `gemini-plan/gemini-3-1-flash-lite-plan`을 사용 중이던 annotation agent는 v3 첫 실행 시 자동으로 `Gemini 2.5 Flash (Plan)`로 이동

### 🎨 셀렉션 시각 피드백 강화

이전에는 멀티 셀렉트된 카드의 시각 표시가 거의 안 보일 정도로 미약 (`2px dashed outline`). v3.0.0:

- **좌상단 indigo 체크 디스크** — 22px 원, 진한 인디고 배경(`#3b40cf`) + 두꺼운 흰 V 마크 SVG + 흰 외곽 링. 카드 배경이 어떤 파스텔 톤이든 무조건 보임
- **단일 셀렉트도 강화** — 3px solid 외곽선 + 글로우 헤일로 (`box-shadow` spread 4px)
- 둘 다 hardcoded 인디고 컬러로 통일 — 사용자 테마의 `--np-accent`가 투명/연한 색일 때도 일관 가시성 보장

### 🖱 UI 클릭 누락·thrashing 방지

- **액션 바 pointer-events**: 보드 스크롤 시 sticky 액션 바 뒤로 가려진 카드가 Ctrl-click 안 먹던 문제. `.np-board-action-bar { pointer-events: none }` + 버튼·카운트만 `pointer-events: auto` 로 분리 → 빈 영역 클릭이 카드까지 통과
- **render throttle (80ms)**: 일괄 주석 streaming(`onTurnComplete` 콜백) 도중 cards-changed가 초당 10~30번 발생 → BoardView.render의 `gridEl.empty()` → `appendChild` 반복으로 호버/클릭이 mid-cycle에 사라지던 lockout. NotePackShell.refreshView에 leading+trailing 80ms throttle 적용
- 결과: 일괄 주석 큐 진행 중에도 다른 카드 selection·hover action·dblclick 모두 정상 작동

---

## 🧠 함께 묶인 v2.1.0 + v2.2.0 내용

(별도 minor 릴리스됐던 항목들 — v3.0.0 한 번에 받는 사용자용 요약)

### v2.1.0 — 보드 / UX

- 보드 카드 크기 **4단계 조절** (S / M / L / XL) — 같은 보드에서 카드 본문 표시량 조정
- 즐겨찾기(고정) 카드 **상단 영구 고정** — 정렬 모드 무관
- **우측 Inspector 패널 접기/펴기** 토글 + 너비 드래그 resize
- 플러그인 설정 메뉴 UX/UI 정리 — 스크롤 압박 제거, 메뉴 가독성 개선
- **Google Keep 스타일** 메모 추가 편집기 + 라이브 뷰 — Composer에서 expand 시 별도 모달로 띄워 편집

### v2.2.0 — 커스텀 에이전트 + Plan mode 진전

- **커스텀 에이전트 전면 리뉴얼** — 커스텀 프롬프트 기반 작동, 페르소나 프리셋 확장
- **1~10개 에이전트** 동시 주석 (Single / Parallel / Sequential 모드별)
- 메모 UX/UI 세부 개선
- **Gemini CLI 연결 검증** — Plan mode 중 OpenAI + Gemini 정식 가동 (Claude Plan은 3.0.0 사이클에서 검증 마무리)

---

## 🐛 Bug Fixes (v3.0.0)

- 일괄 AI 주석 큐를 돌리는 도중 다른 카드 클릭·호버·더블클릭이 모두 안 먹는 lockout — render throttle + multi-select 자동 해제 두 단으로 해결
- 일괄 주석 진행 카드에 `enriching` shimmer 애니메이션이 안 뜨던 문제 — `enrichCardBackground` 시작부에 카드의 top-level `status: "enriching"` 명시 세팅, 단일 capture와 동일 시각
- Code Assist managed project가 비어 있는데 generateContent를 호출하면 404 NOT_FOUND가 나가서 사용자가 "모델이 없어진 줄" 오해하던 문제 — onboarding 실패 단계에서 명확한 에러로 가로채기
- Stored chatModels의 model 필드가 옛 catalog 시점 값으로 stale 박혀 카탈로그 업데이트가 무력화되던 문제 — `migrateLegacyPlanModels`에 `GEMINI_PLAN_MODEL_FIELD_OVERRIDES` 추가, server-side identifier에 한해 catalog 우선
- 액션 바 sticky 영역에 가려진 카드가 Ctrl-click 안 되던 위치 의존적 버그 — pointer-events 분리

---

## 💥 Breaking / Behavior Changes

- **Gemini Plan annotation agent 자동 이동**: 기존에 `gemini-plan/gemini-3-1-flash-lite-plan` 모델을 쓰는 agent가 있었다면 v3 첫 실행 시 자동으로 `gemini-plan/gemini-2-5-flash-plan`(Code Assist에 실재하는 안정 모델)로 modelId 교체됨. 사용자 액션 불필요. 다른 모델로 옮기고 싶으면 설정에서 변경 가능.
- **Gemini Plan 카탈로그**: `Gemini 3.1 Flash Lite (Plan)` 항목 제거 (Code Assist에 alias 부재). 사용자 stored chatModels에서도 이 ID는 자동 삭제됨.
- **stored chatModels 우선순위 변경**: gemini-plan ID에 한해서 **server-side `model` 필드는 catalog가 stored를 override** (이전엔 stored가 catalog 덮어씀). label·grounding 플래그 등 사용자 커스터마이즈는 그대로 보존.

---

## 🔁 자동 마이그레이션

v3.0.0 첫 실행 시 자동:

1. `gemini-plan/gemini-3-1-flash-lite-plan` 사용 중인 annotation agent → `gemini-plan/gemini-2-5-flash-plan`으로 modelId 교체
2. stored chatModels에서 `gemini-3-flash` 등 stale model 식별자 → `gemini-3-flash-preview` 같은 catalog 정식 이름으로 교정
3. activeChatModelId가 위 제거된 ID였다면 → `gemini-plan/gemini-2-5-flash-plan`로 fallback

---

## 📦 설치 / 업데이트

기존 v2.x 사용자:

1. vault의 `.obsidian/plugins/achmage-notepack-codex/`(또는 `notepack-codex/`) 폴더에 새 빌드의 `main.js` / `manifest.json` / `styles.css` 3개 파일 덮어쓰기
2. 옵시디언 **재시작 또는 NotePack CODEX 플러그인 OFF→ON 토글**
3. .codex 파일을 열면 자동 마이그레이션이 한 번 돌고 끝

⚠️ **Dropbox vault 주의**: vault 자체가 Dropbox로 sync되는 경우, Dropbox 동기화 race로 옵시디언이 캐시된 구 main.js를 메모리에 잡고 새 코드를 안 읽는 사례가 v2 사이클에서 확인됐습니다. 토글 OFF→5초→ON으로 강제 리로드하거나, 시스템 트레이의 옵시디언을 완전 종료 후 재시작 권장. 만성 재발 시 plugin 폴더만 Dropbox 밖에 두고 junction(symlink)으로 연결하는 방법이 가장 안정적입니다.

신규: [GitHub Releases](https://github.com/Achmage/achmage-notepack-codex/releases) → v3.0.0 zip → 위 경로에 압축 풀기 → Settings → 커뮤니티 플러그인에서 활성화.

---

## 🙏 감사

v2.0.0의 [Youngbin201/MikaNote](https://github.com/Youngbin201/MikaNote) 시각 영감, [mskayyali/Notepad](https://github.com/mskayyali/nodepad) bottom-up writing 흐름, [Smart Composer](https://github.com/glowingjade/obsidian-smart-composer) OAuth Plan 패턴 — 모두 v3.0.0에서도 변함없는 뿌리입니다. 이번 사이클에서 추가로 [johansan/notebook-navigator](https://github.com/johansan/notebook-navigator) DOM hook 호환성이 검증되어 file-tree 컨텍스트 메뉴 지원이 안정화됐습니다.

---

Made by **Achmage** (더베러 단톡방 ACH_안창현)
