# NotePack CODEX v4.0.0

> **Claude·Gemini Plan을 공식 CLI 실행 방식으로 전환**하고, **Claude Team/Enterprise 계정 허용**, **2026년 10월 기준 모델 목록**, **OpenAI Plan 토큰 갱신 수정**까지 들어간 메이저 업데이트입니다.

> ⏰ OpenAI Plan의 GPT-5.5는 **2026-10-14에 종료**됩니다. 4.0.0은 GPT-5.5 선택을 이 연결에서 검증된 GPT-5.6 Sol로 자동으로 옮기고, GPT-6.1 Sol 등 GPT-6 계열을 새로 제공합니다.

---

## ✨ Highlights

### 🤖 Claude Plan — 이 컴퓨터의 Claude Code로 실행

3.x의 Claude Plan은 claude.ai 로그인 토큰을 플러그인이 저장해 API를 직접 호출했습니다. 4.0.0부터는 **이 컴퓨터에 설치한 Claude Code**가 로그인을 관리하고, NotePack은 그 CLI를 실행만 합니다. NotePack은 Claude 로그인 토큰을 읽거나 저장하지 않습니다.

- 설정 → 플랜 연결 → Claude 카드: **연결 확인** / **로그인 터미널 열기** / **설치 안내** / 컴퓨터별 실행 파일 경로
- 상태 표시: 설치되지 않음 / 로그인 필요 / 요청 차단 / 사용 가능 + 설치된 버전
- Claude Code는 도구·MCP 서버·사용자 설정 없이 한 번짜리 요청으로만 실행 (`--tools=`, `--strict-mcp-config`, `--setting-sources ""`)
- 모델: Sonnet·Opus·Haiku·Fable **최신(latest)** 항목 + **Opus 5.5 / Sonnet 5.5 / Fable 5.1** 고정 항목
- 고정 항목을 쓸 때 설치된 Claude Code가 필요한 버전(Opus·Sonnet 5.5는 2.1.280, Fable 5.1은 2.1.257)보다 낮으면 요청 전에 업데이트 안내

### 🏢 Claude Team / Enterprise — 컴퓨터별 허용

CMDS Achmage 이슈 #38과 같은 문제였습니다. Team 계정이 "API·helper·gateway 과금"이라는 엉뚱한 이유로 막혔습니다. 4.0.0은 조직 계정을 따로 알아보고, 고지를 확인한 뒤 허용할 수 있게 했습니다.

- 조직 계정은 처음엔 **"조직 계정입니다"** 안내와 함께 대기. 조직이 관리하는 Claude Code 설정이 NotePack 요청에도 적용될 수 있기 때문
- **Team/Enterprise 계정 허용…** → 고지 확인 → 그 컴퓨터에서 사용 가능. 동기화되는 vault 설정이 아니라 **컴퓨터별 저장**, 언제든 해제
- API 키·게이트웨이·클라우드 과금 경로는 허용 여부와 관계없이 계속 차단
- 허용한 조직 계정 요청은 Claude Code가 세션 설정(`system/init`)을 보고하지 않거나 MCP 서버가 붙으면 응답을 버림

### 💎 Gemini Plan — Antigravity CLI로 실행

3.x의 Gemini Plan은 Gemini CLI용 OAuth로 Code Assist API를 직접 호출했습니다. 4.0.0부터는 **이 컴퓨터에 설치한 Google Antigravity CLI(`agy`)** 로 실행합니다.

- 연결 확인 때 `agy models`가 알려 주는 **Gemini 모델을 목록에 자동 추가** (Antigravity가 함께 보여 주는 Claude·GPT-OSS 모델은 제외)
- 기본 항목: Gemini 3.1 Pro (High), Gemini 3.8 Flash (Medium)
- Antigravity 오류(`AGY_ERROR`)를 그대로 보여 줌
- Windows에서는 명령줄 길이 제한 때문에 한 요청에 약 24,000자까지. 넘으면 보내기 전에 안내

### 🟢 OpenAI Plan — GPT-6 계열 + 토큰 갱신 수정

- 모델: **GPT-6.1 Sol**, GPT-6 Sol, GPT-6 Astra, GPT-6 Luna, GPT-5.6 Sol. GPT-5.5 등 GPT-5.x Plan 항목은 제거
- 종료되는 GPT-5.x 선택은 **GPT-5.6 Sol (Plan)** 로 이동: 이 연결 경로에서 동작이 확인된 모델(CMDS Achmage R-001, 2026-07)이고, OpenAI 문서상 GPT-6 출시 기간에도 계속 제공됩니다. GPT-6 계열은 이 연결 경로에서 아직 실제 요청으로 검증하지 못해서 직접 고르도록 했습니다
- OpenAI가 GPT-6 계열을 "새 Codex 버전 필요" 오류로 거부하면 오류 메시지에 GPT-5.6 Sol로 바꾸라는 안내가 붙습니다
- 추론 effort 선택지 확장: none / minimal / low / medium / high / xhigh / max (모델마다 지원 범위가 다릅니다. 예: GPT-6.1 Sol·Astra는 none 미지원)
- 로그인 콜백을 공식 Codex CLI와 같은 `127.0.0.1:1455`로 변경. Codex CLI가 1455를 쓰고 있으면 `1457`로 대체

### 🧠 모델 목록 갱신 (API 키 제공자)

| 제공자 | 4.0.0 기본 목록 |
|---|---|
| OpenRouter | GPT-6.1 Sol (새 기본 모델), Claude Sonnet 5.5, Gemini 3.8 Flash |
| Anthropic | Claude Opus 5.5, Sonnet 5.5, Fable 5.1, Haiku 4.5 |
| OpenAI | GPT-6.1 Sol, GPT-6 Astra, GPT-6 Luna |
| Gemini | Gemini 3.8 Flash, 3.1 Pro Preview, 3.5 Flash-Lite |
| xAI | Grok 4.7, Grok 4.3 (Grok 4.1 Fast는 2026-05-15 종료) |
| DeepSeek | DeepSeek V4.1 Flash, V4 Pro (deepseek-chat·reasoner는 2026-07-24 종료) |

- Anthropic API 요청을 Claude 4.6 이후 모델의 형식으로 변경: thinking 예산 대신 **adaptive thinking + effort**, temperature 생략. Fable은 thinking 파라미터 생략, Haiku 4.5는 기존 예산 방식 유지
- 모델 편집기에 **Thinking effort**(Default / Low ~ Max) 선택 추가
- OpenAI 호환 경로에서 o 시리즈·GPT-5·GPT-6 같은 추론 모델에는 temperature를 보내지 않음

---

## 🐛 Bug Fixes

- **OpenAI Plan 갱신 토큰이 저장되지 않던 문제** — 요청이 설정의 사본을 들고 있어서 갱신한 토큰이 버려지고, 만료 뒤 매번 다시 갱신하거나 재연결이 필요했습니다. 이제 갱신 즉시 설정에 저장하고, 만료 1분 전에 미리 갱신하며, 동시에 여러 요청이 갱신하지 않도록 잠급니다. 요청 중 401이 나면 한 번 갱신하고 한 번 재시도합니다
- **OpenAI Plan이 실패한 응답의 일부 텍스트를 결과로 쓰던 문제** — `response.failed`면 오류로 처리
- **저장된 내장 모델 사본이 새 카탈로그를 덮어쓰던 문제** — 예전 라벨·모델 ID가 남아 업데이트가 적용되지 않았음. 이제 내장 항목은 항상 카탈로그 기준
- **카드 팩 창을 닫아도 생성 요청이 계속 돌던 문제** — 창을 닫으면 대기 중인 요청을 취소하고, Claude·Gemini Plan이면 CLI 프로세스도 종료
- **통합 인사이트(Synthesis) 생성이 취소되지 않던 문제** — 문서를 닫거나 새로 트리거하면 이전 요청 중단
- **통합 인사이트가 코드 블록으로 감싼 JSON을 읽지 못하던 문제**
- Anthropic API의 `refusal`·`max_tokens` 종료를 알아볼 수 있는 메시지로 표시

---

## 💥 Breaking / Behavior Changes

- **Claude Plan·Gemini Plan은 데스크톱 전용**이며 각각 Claude Code·Antigravity CLI 설치와 로그인이 필요합니다. 모바일에서는 "데스크톱 전용" 상태로 표시되니 API 키 제공자를 쓰세요
- **저장돼 있던 Claude·Gemini Plan 토큰 삭제** — 다시 연결할 필요 없이 CLI 로그인만 하면 됩니다
- **Gemini Plan BYO OAuth 입력란과 Code Assist 프로젝트 설정 제거**
- **Claude Team/Enterprise는 허용 전까지 차단**
- 새 설치의 기본 활성 모델: OpenRouter GPT-4o → **OpenRouter GPT-6.1 Sol**
- Claude·Gemini Plan 호출: 6초 간격 → CLI를 한 번에 하나씩 실행 (간격 없음). 실패해도 **자동 재시도하지 않음** — 실패한 CLI 요청을 통째로 다시 돌리면 구독 사용량을 한 번 더 쓰기 때문

---

## 🔁 자동 마이그레이션

v4.0.0 첫 실행 시 자동:

1. Claude Plan·Gemini Plan의 저장 토큰, Gemini BYO Client ID/Secret 삭제 → Notice 안내 (OpenAI Plan 연결은 유지). 예전 데이터 백업(`legacyDataBackup`) 안의 토큰도 함께 삭제
2. 종료·교체된 모델 선택을 후속 모델로 이동 — 활성 모델, 주석 에이전트, `.codex` 파일 안의 에이전트 모두
   - `openai-plan/gpt-5-5-plan` 등 GPT-5.x Plan → `openai-plan/gpt-5-6-sol-plan`
   - `anthropic-plan/claude-*-4-5-plan` → 같은 계열의 최신(latest) 항목
   - Gemini Plan 구 항목 → `gemini-3-1-pro-high-plan` / `gemini-3-8-flash-medium-plan`
   - OpenRouter GPT-4o, OpenAI GPT-4o·4.1·5·o4, Anthropic 4.5, Gemini 2.5 API 항목 → 현행 모델
   - xAI Grok 4.1 Fast 두 항목 → Grok 4.3 (xAI도 같은 곳으로 연결함), DeepSeek Chat·Reasoner → DeepSeek V4.1 Flash
3. 직접 추가한 사용자 모델은 그대로 유지

이 정리는 **로드할 때마다** 다시 확인합니다. Dropbox로 동기화되는 다른 기기의 3.x가 예전 값을 다시 써도 다음 로드에서 다시 정리됩니다.

---

## 🔐 보안 메모

- 3.x 빌드에 포함돼 있던 Gemini CLI용 Google OAuth 클라이언트 정보를 제거했고, 다시 들어오지 않도록 `npm run check:secrets`가 빌드 결과물까지 검사합니다
- 3.x의 `data.json`에는 Claude·Gemini Plan 토큰이 평문으로 저장돼 있었습니다. 4.0.0이 지워도 Dropbox 버전 기록이나 백업에 예전 파일이 남아 있을 수 있습니다. 걱정되면 Claude·Google 계정 보안 설정에서 해당 로그인 세션을 해제하세요
- Claude·Gemini Plan은 `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_BEDROCK`, `GEMINI_API_KEY`, `GOOGLE_GEMINI_BASE_URL`, `GOOGLE_CLOUD_PROJECT` 같은 과금 경로 환경 변수가 있으면 요청을 보내지 않고, CLI에도 넘기지 않습니다

> ⚖️ **왜 바뀌었나**: Claude·Google 계정 토큰을 서드파티 플러그인이 직접 저장하고 쓰는 방식은 각 서비스 정책상 허용되지 않거나 더 이상 동작하지 않습니다. 4.0.0은 공식 CLI가 로그인을 관리하고 NotePack은 그 CLI를 실행만 하도록 바꿨습니다. Claude Plan은 각자 본인 로그인으로 Claude Code를 실행하는 개인 사용 호환 경로이며 Anthropic 공식 연동이 아닙니다.

---

## 🧪 검증

- `npm test` 103건 통과 — 과금 안전 판정(Pro·Max·Team·Enterprise × 허용 여부, 환경 변수, 관리 설정), Claude Code·Antigravity 실행 인자와 스트림 파서, 검증 캐시 만료 뒤 재차단, 확인 도중 Team 허용을 해제했을 때의 차단, 모델 마이그레이션(반복 실행 포함), OpenAI Plan 토큰 갱신, Anthropic 요청 형식
- OpenAI Plan 로그인 콜백: 실제 로컬 포트로 9가지 시나리오 확인 (로그인 재시도 시 이전 대기 취소, 1455 사용 중이면 1457, 시간 초과, state 불일치, 창 닫기)
- `npm run typecheck`(TypeScript `erasableSyntaxOnly` + `verbatimModuleSyntax`), `npm run build`, `npm run check:secrets`
- 실제 기기(Windows 11)에서 NotePack 런타임 코드로 연결 확인 실행 — 모델 요청 없이 버전·로그인 상태·모델 목록만 확인
  - Claude Code 2.1.285, Max 계정: **사용 가능**. 같은 셸에 `ANTHROPIC_BASE_URL`이 있으면 **요청 차단**으로 판정되는 것도 확인
  - Antigravity CLI 1.2.14: **사용 가능**, Gemini 모델 11개 발견 (Claude·GPT-OSS 항목은 제외됨)
- 실제 Plan 요청 1회씩 (구독 로그인, API 키 아님)
  - Claude Plan `claude-sonnet-5-5`(effort low): 성공. Claude Code가 보고한 실행 모델도 `claude-sonnet-5-5`
  - Gemini Plan `gemini-3.8-flash-medium`: 성공
  - OpenAI Plan GPT-6 계열은 이번 사이클에서 실제 요청으로 검증하지 못했습니다 (OpenAI Plan 로그인 토큰이 있는 Obsidian에서만 가능). 거부되면 GPT-5.6 Sol (Plan)을 쓰세요
- Team/Enterprise 흐름은 이 PC에 조직 계정이 없어 Claude Code 2.1.285 출력 형식의 테스트 픽스처로 검증

---

## 📦 설치 / 업데이트

1. [GitHub Releases](https://github.com/laguna821/Obsidian_NotePack-CODEX/releases)에서 v4.0.0의 `main.js` / `manifest.json` / `styles.css`를 받아 vault의 `.obsidian/plugins/achmage-notepack-codex/`에 덮어쓰기
2. 옵시디언 **재시작 또는 NotePack CODEX 플러그인 OFF→ON**
3. Claude·Gemini Plan을 쓴다면 [Claude Code](https://code.claude.com/docs/en/installation) / [Antigravity CLI](https://antigravity.google/docs/cli/install) 설치 → 설정 → 플랜 연결 → **로그인 터미널 열기** → **연결 확인**

⚠️ **Dropbox vault 주의**: vault가 Dropbox로 동기화되면 동기화 race로 옵시디언이 캐시된 구 main.js를 잡고 있을 수 있습니다. 덮어쓴 뒤 플러그인 OFF→5초→ON, 또는 옵시디언을 완전히 종료한 뒤 재시작하세요. 같은 vault를 쓰는 다른 기기도 4.0.0으로 올려 주세요.

---

## 🙏 감사

Claude·Gemini Plan의 CLI 실행, 과금 안전 판정, Team/Enterprise 허용 흐름은 공동개발 중인 [CMDS Achmage](https://github.com/CMDSPACE-DEV/CMDS-Achmage)(MIT)에서 가져왔고, Claude Code 실행 파일 탐색은 그 안의 Claudian(MIT) 코드에서 왔습니다. 라이선스 전문은 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다.

---

Made by **Achmage** (더베러 단톡방 ACH_안창현)
