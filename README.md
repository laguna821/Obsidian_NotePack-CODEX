# NotePack CODEX v3

<img width="1164" height="592" alt="{36FB16DC-E931-481F-B5E4-FB2E096C9A29}" src="https://github.com/user-attachments/assets/c61e26eb-d74e-43e1-b2d6-1f376d4af4d6" />


> **Bottom-up writing tool** — 메모를 던지면 AI 페르소나들이 토론하며 주석을 달고, 사고가 막히면 **하스스톤식 아이디어 카드 뽑기**로 글쓰기 주제를 강제로 파생시켜주는 옵시디언 플러그인.

원래의 [mskayyali/Notepad](https://github.com/mskayyali/nodepad) 앱이 너무 강력해서 옵시디언 플러그인으로 옮겼고, **양자 프레임워크 기반 메타인지 난이도별 카드 뽑기** 시스템과 **MikaNote 스타일의 UX/UI** 까지 입혔습니다.

> 옵시디언 vault 안에서 `.codex` 파일 단위로 동작합니다. 일반 마크다운 노트와 분리된 **워크벤치 공간**에서 사고를 굴리다가, 마음에 드는 카드만 vault의 마크다운 노트로 promote합니다.

---

## 🧭 핵심 사용 흐름 — 딱 하나만 기억

> **질문하고 → 노트를 업데이트하고 → 더 빡센 노트를 쓰고 → 또 질문하고**, 이 사이클만 반복하세요.

1. 떠오르는 단상을 보드에 던집니다 (메모 추가).
2. AI 페르소나들이 자동으로 주석을 달고, 카테고리를 분류해 줍니다.
3. 메모가 좀 쌓이면 **통합 인사이트(Synthesis)** 가 카테고리 사이의 숨은 다리를 제안합니다.
4. 사고가 막히면 **아이디어 카드 생성**(구 "카드팩 뽑기")으로 일반/주목/핵심/원형 등급 카드 5장이 나옵니다.
5. keep / discard로 카드들을 솎아내며 새로운 메모를 파생시킵니다.
6. 충분히 발효된 카드는 vault의 마크다운 노트로 promote.

이 한 사이클이 인간 주도 bottom-up writing의 한계를 깨도록 강제로 사고력을 시험합니다.

---

## ✨ v3.0.0 신규 기능 한눈에

**멀티 시드 카드팩**, **오프라인 캡처 모드**, **멀티 셀렉트 일괄 AI 주석** 세트 신규 + **Plan mode 3종(OpenAI / Claude / Gemini) 정식 완성** + **Gemini Plan 안정성·셀렉션 UX 전면 강화**.

| 분류 | v3.0.0 신규 |
|---|---|
| 🎴 카드 팩 | **여러 노트 시드** 기반 카드 팩 (Ctrl/Shift-click 멀티 셀렉트 → "선택 시드로 카드 팩"), cross-seed 컨텍스트 자동 탐지 |
| 🔌 오프라인 | 헤더 우측 **오프라인 캡처 토글** — ON 시 AI 주석 스킵하고 순수 메모만 저장. 워크벤치 단위 |
| 📋 일괄 주석 | 멀티 셀렉트 후 **"선택 카드 주석"** — 동시성 3 큐, 실패 카드 자동 추적·재시도, shimmer 시각 인디케이터 |
| 🤖 Plan mode | **OpenAI / Claude / Gemini Plan 3종 정식 검증 완료** — v2.0.0엔 카탈로그만 있었음 |
| 🛠 Gemini 안정성 | Code Assist project onboarding 실패 시 명확한 에러, stored stale model 식별자 자동 마이그레이션, 죽은 모델 ID 자동 제거 |
| 🎨 셀렉션 시각 | 멀티 셀렉트 카드에 좌상단 **indigo ✓ 디스크** + 외곽선 + 글로우 헤일로 — 어떤 파스텔 카드 배경에서도 무조건 보임 |
| 🖱 UI 안정성 | 액션 바 가려진 카드 Ctrl-click 통과, 일괄 주석 streaming 중 render 80ms throttle로 lockout 차단 |

### 함께 묶인 v2.1.0 + v2.2.0 (별도 minor 릴리스 항목)

| 사이클 | 항목 |
|---|---|
| **v2.1.0** | 보드 카드 크기 4단계(S/M/L/XL), 즐겨찾기 상단 영구 고정, 우측 Inspector 패널 접기/펴기, 설정 메뉴 UX 정리, Google Keep 스타일 메모 편집기 |
| **v2.2.0** | 커스텀 에이전트 전면 리뉴얼(커스텀 프롬프트), 1~10개 동시 주석, Gemini CLI Plan mode 검증 |

> v3.0.0 변경 디테일은 [RELEASE_NOTES_3.0.0.md](RELEASE_NOTES_3.0.0.md) 참고. v2.0.0 base 기능들은 아래 섹션들에 그대로 문서화되어 있고 v3.0.0에서도 유효합니다.

---

## ✨ v2.0.0 base 기능 한눈에

[Youngbin201/MikaNote](https://github.com/Youngbin201/MikaNote)의 시각 미학에서 영감을 받아 보드 전체를 **바둑판형 컬러 타일**로 재설계했고, AI 분석 시스템을 **진짜 디베이트 기반**으로 갈아엎었으며, **학년별 난이도 시스템**과 **GPT-5.5 Plan** 같은 신모델 지원, **보안 강화**까지 들어간 메이저 base.

| 분류 | v2.0.0 base |
|---|---|
| 🎨 비주얼 | 220×220 정사각 컬러 타일 보드, content type별 14가지 자동 색상, 호버 액션, 긴 메모 접기, archived/trashed dim |
| ✏️ 편집기 | Markdown 단축키 (Ctrl+B/I/U + Ctrl+Shift+S/8/T), 상단 고정 툴바 + 선택 시 버블 메뉴, 리스트/할일 자동 이어쓰기 |
| 🤖 AI 분석 | Single / Parallel / **진짜 Sequential 디베이트** 모드, turn-by-turn 화면 등장, 커스텀 페르소나 |
| 📚 난이도 | **학년 기반 5단계** (1=초등 4-6학년 ~ 5=대학원), 어휘+주제 동시 제어, 카드 뽑기에도 동일 적용 |
| 🪟 팝아웃 | 카드를 별도 창으로 띄워 폰트/줄간격 슬라이더로 편안하게 쓰기 |
| 🗂️ 컨텍스트 메뉴 | 폴더 우클릭에 **"새 노트팩 코덱스"** 즉시 생성 (옵시디언 기본 + Notebook Navigator 지원) |
| 🔐 보안 | Gemini OAuth 평문 시크릿 제거 → **BYO OAuth**, AI 호출 rate limiter / retry / abort 도입 |
| 🧠 신모델 | **GPT-5.5 (Plan)** 기본 / GPT-5.5 / GPT-5.5 Instant / Claude 4.5 / Gemini 3 Pro Preview |

---

## 🪟 보드 — MikaNote에서 흡수한 시각 미학

- **정사각 220×220 타일** — 짧은 메모는 자연스럽게 여백, 긴 메모는 5줄 clamp + "더보기" 토글. **모든 타일 키 일치**해서 멀리서 보면 진짜 바둑판처럼 정돈.
- **Content type별 자동 색상** — 14종(entity / claim / question / task / idea / reference / quote / definition / opinion / reflection / narrative / comparison / thesis / general)이 각자 파스텔 톤. AI 분류만으로 카드 색이 결정되니 어떤 종류의 사고를 했는지 한눈에.
- **AI 주석은 어두운 chip 통일** — 카드 색깔 무관하게 일관 가독성. 기본은 접혀 있고 `🤖 AI 주석 N ▾` 토글로 펼치기.
- **Hover 액션** — 별(고정)·휴지통 아이콘이 우상단에 페이드인.
- **정렬 / 휴지통** — 고정 우선 / 최근 수정 / 생성일 / 제목 / 유형 정렬, 30일 후 자동 영구삭제.
- **Inspector** — 카드 클릭 시 우측 패널에 본문 + 풀 AI 주석 + 액션 버튼. 클릭으로 즉시 편집 모드.

---

## ✏️ 마크다운 편집기 — Composer & Inspector

기존 plain `<textarea>`를 새 `MarkdownEditor` 컨트롤로 전면 교체.

| 단축키 | 동작 |
|---|---|
| `Ctrl+B` | **굵게** `**...**` 토글 |
| `Ctrl+I` | *기울임* `*...*` 토글 |
| `Ctrl+U` | 밑줄 `<u>...</u>` 토글 (마크다운 표준 외 옵시디언 호환) |
| `Ctrl+Shift+S` | ~~취소선~~ `~~...~~` 토글 |
| `Ctrl+Shift+8` | 글머리 기호 `- ` |
| `Ctrl+Shift+T` | 할일 `- [ ] ` |
| `Ctrl+Shift+>` | 인용문 `> ` |
| `` Ctrl+` `` | 인라인 코드 \``...\`` |
| `Enter` | 리스트/할일/인용문 자동 이어쓰기 (빈 마커는 자동 종료) |

- **상단 고정 툴바**: 포커스 시 8개 버튼 노출, blur 시 숨김.
- **버블 메뉴**: 텍스트 선택 시 캐럿 위에 떠오르는 미니 툴바 (Notion 스타일).
- 모든 입력은 **순수 마크다운**으로 저장 → vault 노트로 promote 시 그대로 호환.

---

## 🤖 AI 분석 — Single / Parallel / 진짜 Sequential

세 모드 모두 **여러 페르소나(annotation agent)** 가 동일 메모에 주석을 달지만 작동 방식이 다릅니다.

### Single
한 페르소나만 빠르게 한 번 응답. 가벼운 일반 메모용.

### Parallel
여러 페르소나가 **동시 다발**로 응답. 빠르고 다양한 관점, 단 서로의 의견은 모름.

### Sequential (v2.0.0 핵심 개편)
**페르소나끼리 진짜 디베이트.** 이전 v1.x는 이름만 sequential이었고 사실 병렬이었지만, v2.0.0부터:

- **턴 1**: 첫 페르소나가 sharp한 첫 stance를 잡습니다.
- **턴 2~**: 다음 페르소나는 직전 턴의 한 주장을 **명시적으로 push back / probe**. "잠깐, 그건 좀 다른데", "그게 진짜 그래?" 같은 디베이트 톤. "OO 말에 덧붙이자면" 같은 회피 패턴은 **명시적으로 금지**.
- **마지막 턴**: 미해결 긴장을 한 줄로 짚고 사용자가 즉시 쓸 수 있는 한 가지 다음 행동을 제시.
- **화면 등장도 진짜 turn-by-turn**: 매 턴 완료 시 store가 업데이트되어 사용자는 메모 카드에서 주석이 한 개씩 차례로 등장하는 걸 봅니다 (이전엔 4개가 동시에 한꺼번에 나타났음).

같은 메모에서도 페르소나 구성·순서·난이도를 바꾸면 완전히 다른 토론이 나옵니다.

---

## 📚 학년 기반 난이도 5단계

기존 v1.x의 추상적 "Easy / Normal / Deep / Expert"를 **명확한 학년 단계**로 재정의. 어휘만 쉬워지는 게 아니라 **주제 자체의 복잡도도 학년에 맞춰지는 게 핵심**.

| Level | 대상 | 어휘 | 주제 |
|---|---|---|---|
| **1** | 초등 4-6학년 | 10세가 매일 쓰는 단어. 메타인지/인식론/존재론/프레임/메커니즘 같은 27개 학술 어휘 **명시 금지** | 친구·게임·간식·만화·일상 — 철학·전략·연구방법 같은 추상 주제는 어휘만 쉬운 척으로 위장하더라도 거부 |
| **2** | 중학교 | 일상어 + 학교 과목 용어 (필요 시 1개) | 학교 주제, 정체성, 가벼운 미디어 분석 |
| **3** | 고등학교 (기본값) | 일반 학술 용어 가능 | 논증/근거/가설, 윤리적 딜레마, 문화·시민 |
| **4** | 학부 | 분야 용어, 이론적 렌즈, 방법론적 구분 | 분과 학문 문제, 방법론적 선택 |
| **5** | 대학원/전문가 | 분과 어휘 풀 활용 | 전제·메타-수준, 모델 한계, 2차 함의 |

**카드 뽑기 시스템에도 동일한 학년 기준이 적용**됩니다. Level 1에서 "원형(legendary)" 카드를 뽑아도 어른스러운 단어로 위장한 어려운 질문이 아니라, **초등생이 진짜 답하고 싶을 큰 질문**이 5-10분 안에 답할 수 있는 형태로 나옵니다.

학년 명세가 페르소나의 default 톤을 **override**하도록 시스템 프롬프트 최상단에 배치 — Skeptical reader 같은 페르소나의 학술적 register가 Level 1을 무시하지 못합니다.

---

## 🎴 아이디어 카드 생성 (구 "카드팩 뽑기")

발효 중인 메모에 막히면 카드 뽑기를 누릅니다. 양자 프레임워크 기반 프롬프트가 **다양성 매트릭스(question type × lens)** 를 강제로 분산시켜, 같은 메모에서도 매번 다른 5장이 나옵니다.

- 등급 4단계: **기본 / 주목 / 핵심 / 원형** (v1.x의 일반/희귀/영웅/전설을 게임풍 톤 다운)
- 등급은 "원본 메모로부터의 개념적 거리"를 결정 (난이도와 별개)
- 각 카드는 hook + 큰 질문 + 브릿지 단계 + 즉시 쓸 수 있는 행동 + 확장 질문 + 추천 태그/링크 포함
- 카드를 **keep**하면 새 메모로 흡수, **discard**하면 다음 회전에서 카드 풀이 다시 섞임
- promote 시 vault에 정식 마크다운 노트로 저장

---

## 💡 통합 인사이트 (Synthesis / Ghost Notes)

엔리치된 카드가 일정량 쌓이면 자동으로 **카테고리 사이의 숨은 다리**를 찾는 ghost note가 생성됩니다. v2.0.0에서:

- **500ms debounce + in-flight guard** — 카드 상태 변경마다 fan-out하던 v1.x의 폭주 차단.
- 보이지 않는 곳에서 quietly 작업 → 결과만 카드 형태로 보드 위쪽 banner로 등장 → claim / dismiss.
- 학년 난이도 그대로 적용.

---

## 🪟 카드 팝아웃 창

Inspector의 **"별도 창"** 버튼으로 한 카드를 옵시디언 별도 윈도우에 띄울 수 있습니다.

- 폰트 크기 슬라이더 (12-32pt)
- 줄간격 슬라이더 (1.0-2.4)
- 슬라이더 값은 카드별로 저장 → 같은 카드 재오픈 시 복원
- 본문은 일반 MarkdownEditor 그대로 — 단축키·툴바·자동 이어쓰기 모두 동작

긴 글을 집중해서 쓰고 싶을 때 vault의 다른 노트와 분리된 별창에서 작업.

---

## 🗂️ 폴더 우클릭 메뉴 — "새 노트팩 코덱스"

옵시디언 파일 탐색기에서 폴더를 우클릭하면 **"새 노트팩 코덱스"** 항목이 새 드로잉 바로 밑에 자동 추가됩니다.

| 호환 | 작동 |
|---|---|
| 옵시디언 기본 file-explorer | ✅ 폴더·빈 영역 모두 |
| [Notebook Navigator](https://github.com/johansan/notebook-navigator) | ✅ 폴더·빈 영역 모두 (v2.0.0에서 DOM hook 우회로 지원) |
| 기타 file-tree plugin | 표준 file-menu 이벤트 emit하면 자동 호환, 자체 메뉴 빌드해도 DOM 기반 폴백으로 대부분 잡음 |
| **항상 동작하는 fallback** | 명령 팔레트 `Ctrl+P` → "Create new NotePack CODEX workbench" / 좌측 ribbon `layers` 아이콘 |

---

## 🧬 AI 모델 지원 (BYOK + OAuth Plan)

본 플러그인은 AI 연동 없이는 동작하지 않지만, **별도 API 충전 없이도 유료 구독으로 인증 가능**한 OAuth Plan 흐름을 제공합니다 (Smart Composer 영감).

### OAuth Plan (구독 인증)

| Provider | 인증 방식 | v2 기본 모델 |
|---|---|---|
| **OpenAI Plan** (ChatGPT 구독) | PKCE-only OAuth | **GPT-5.5 (Plan)** |
| **Claude Plan** (Anthropic 구독) | PKCE-only OAuth | Claude Sonnet 4.5 (Plan) |
| **Gemini Plan** | **BYO OAuth** (사용자가 GCP 콘솔에서 자신의 OAuth Desktop 클라이언트 발급 → Client ID/Secret 입력) | Gemini 3 Pro Preview (Plan) |

> ⚠️ **v2.0.0 보안 변경**: v1.x는 Gemini OAuth용 client_secret이 plugin 코드에 평문으로 박혀 있어 OSS 배포 시 누구나 추출 가능했습니다. v2.0.0에서 시크릿 완전 제거, 사용자가 GCP 콘솔에서 자기 OAuth 클라이언트(Desktop App)를 발급받아 Client ID + Secret을 settings에 입력하는 BYO 방식으로 전환. v1.x에서 Gemini Plan 토큰을 갖고 있던 사용자는 v2 첫 실행 시 자동 무효화 + Notice 안내됩니다.

### 단순 API Key (Direct API)

OAuth가 부담스러우면 일반 API Key 모드도 그대로 지원: OpenAI / Anthropic / Gemini (AI Studio) / xAI / DeepSeek / Mistral / Perplexity / OpenRouter / Azure OpenAI / Ollama / LM Studio.

### 페르소나 (커스텀 가능)

각 annotation agent는 **(모델 ID + 페르소나 프리셋 + 출력 언어 + 사용자 정의 지시)** 의 조합. 기본 제공 페르소나(Skeptical reader / Question generator / Friendly tutor 등) 외에 직접 만든 페르소나도 등록 가능 — Settings에서.

같은 메모에 다른 모델·다른 페르소나 4명이 sequential 디베이트하는 것도 OK.

---

## 🛡️ 신뢰성 — Rate limit / Retry / Abort

v1.x는 AI 호출에 어떤 throttle도 없어 카드 다발 입력 시 quota 폭주 위험이 있었습니다. v2.0.0에서:

- **Per-provider 동시성 제한** (공식 API 2건, Plan 엔드포인트 1건)
- **최소 호출 간격** (공식 API 2초, Plan 6초)
- **429/503/네트워크 오류 자동 재시도** — `Retry-After` 헤더 존중, exponential backoff + jitter
- **AbortController 풀 와이어링** — 카드 삭제·문서 닫힘·재분석 트리거 시 in-flight 요청 즉시 중단
- **Synthesis debounce 500ms** — 카드 상태 변경마다 호출되던 fan-out 차단

429 발생 시 카드 statusText에 표시 + 분당 1회 Notice 알림 (스팸 방지).

---

## 🔁 마크다운 라운드트립

`.codex` 파일은 JSON이지만 카드 본문은 **순수 마크다운**입니다. 카드를 vault 노트로 promote하면 그대로 마크다운 노트로 저장되며, 그 반대도 가능.

- 옵시디언 기본 마크다운 처리(`- [ ]` 체크박스, `**bold**`, `~~strike~~` 등)와 100% 호환
- 단 한 가지 예외: 밑줄(`<u>...</u>`) — CommonMark에 없으나 옵시디언이 인라인 HTML로 렌더하므로 라운드트립 OK

---

## 📦 설치

[GitHub Releases](https://github.com/Achmage/achmage-notepack-codex/releases)에서 **v3.0.0** zip 다운로드 → `<vault>/.obsidian/plugins/achmage-notepack-codex/`에 압축 풀기 → 옵시디언 Settings → 커뮤니티 플러그인 → 활성화.

⚠️ **Dropbox 안 vault 사용자 주의**: vault 자체가 Dropbox로 sync되는 경우 plugin 업데이트 시 sync race로 옵시디언이 캐시된 구 main.js를 메모리에 잡는 케이스가 확인됐습니다. 새 빌드를 덮어쓴 뒤에는 NotePack CODEX 플러그인 OFF→5초→ON으로 강제 리로드 (또는 시스템 트레이의 옵시디언 완전 종료 후 재시작). 만성 재발 시 plugin 폴더만 Dropbox 밖에 두고 junction(symlink)으로 묶는 방법이 가장 안정적.

또는 BRAT plugin으로 베타 트랙 설치도 가능.

---

## ⚠️ v1.x → v2.0.0 마이그레이션 안내

v2.0.0 첫 실행 시 자동으로 처리됩니다:

1. `.codex` 파일 schema v2 → v3 silent 업그레이드 (기존 카드 손실 없음)
2. 기존 Gemini Plan OAuth 토큰 자동 무효화 (보안 시크릿 제거 마이그레이션) → 사용자 재연결 안내 Notice
3. OpenAI Plan 활성 모델이 GPT-5.2 또는 GPT-5.4였다면 자동으로 GPT-5.5 (Plan)로 swap
4. UI 용어 변경: "카드팩 뽑기" → "아이디어 카드 생성", 등급 일반/희귀/영웅/전설 → 기본/주목/핵심/원형

⚠️ **사용자가 직접 처리할 항목 1건**: 평문 시크릿이 v1.x 설치본에 박혀 있었으므로 자기 GCP 콘솔에서 해당 OAuth client_secret을 회전(reset) 또는 삭제 권장. v2 코드는 더 이상 그 시크릿을 사용하지 않지만, 평문이 git 히스토리·이전 빌드에 남아 있을 수 있어 회전이 가장 안전.

---

## 🙏 영감

- [mskayyali/Notepad](https://github.com/mskayyali/nodepad) — bottom-up writing 핵심 흐름의 원형
- [Youngbin201/MikaNote](https://github.com/Youngbin201/MikaNote) — v2.0.0 시각 미학 (정사각 컬러 타일·hover 액션·정렬/휴지통)
- [Smart Composer](https://github.com/glowingjade/obsidian-smart-composer) — OAuth 구독 인증 패턴
- [johansan/notebook-navigator](https://github.com/johansan/notebook-navigator) — 호환 대상

---

Made by **Achmage** (더베러 단톡방 ACH_안창현)
