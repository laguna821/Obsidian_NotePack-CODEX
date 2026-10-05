# NotePack CODEX v2.0.0

> 보드를 **MikaNote 스타일 컬러 타일 바둑판**으로 갈아엎고, AI 분석을 **진짜 디베이트 기반**으로 다시 짰으며, **학년 기반 난이도** 시스템·**GPT-5.5 Plan**·**보안 강화**까지 한 번에 들어간 메이저 업데이트입니다.

---

## ✨ Highlights

### 🎨 보드 — MikaNote 영감의 컬러 타일 바둑판

[Youngbin201/MikaNote](https://github.com/Youngbin201/MikaNote)의 시각 미학을 옵시디언/마크다운 환경에 재구현.

- **정사각 220×220 타일** — 모든 카드 균일 사이즈, 멀리서 봤을 때 진짜 바둑판처럼 정돈
- **Content type별 14가지 자동 색상** — entity / claim / question / task / idea / reference / quote / definition / opinion / reflection / narrative / comparison / thesis / general 각각 파스텔 톤
- **AI 주석 chip 어두운 통일색** — 어떤 카드 색에서도 가독성 보장
- **호버 액션** — 별(고정)·휴지통 아이콘이 우상단에 페이드인
- **긴 메모 5줄 clamp + "더보기" 토글** — 본문 expand 시에만 타일이 자기 셀 안에서 늘어남, 옆 카드 흐트러뜨리지 않음
- **archived/trashed dim** — 50% opacity + grayscale로 자연스럽게 보조
- **정렬/필터/휴지통 컨트롤** — 고정 우선/최근/생성/제목/유형 정렬, 30일 후 자동 영구삭제
- 기존 "유형별(Kanban)" 탭 + 메모/아이디어카드/통합인사이트 필터칩 제거 — bottom-up writing 본질에 집중

### ✏️ 마크다운 편집기 신설

기존 plain `<textarea>`를 모두 새 `MarkdownEditor` 컨트롤로 교체. Composer + Inspector 양쪽 동일하게 적용.

- **단축키**: `Ctrl+B/I/U` 굵게/기울임/밑줄, `Ctrl+Shift+S` 취소선, `Ctrl+Shift+8` 글머리기호, `Ctrl+Shift+T` 할일, `Ctrl+Shift+>` 인용, `` Ctrl+` `` 인라인 코드
- **상단 고정 툴바** + 텍스트 선택 시 떠오르는 **버블 메뉴** (Notion 스타일)
- **자동 이어쓰기**: `- ` `1. ` `> ` `- [ ] ` 라인에서 Enter → 같은 마커로 다음 줄, 빈 마커는 자동 종료
- **선택 영역 토글**: 이미 마크다운 적용된 부분에 단축키 → 마크업 제거
- 모든 입력은 순수 마크다운 → vault 노트로 promote 시 그대로 호환

### 🤖 진짜 Sequential 디베이트

v1.x에서 sequential은 사실상 병렬이었습니다. v2.0.0:

- 페르소나끼리 **명시적으로 disagree / probe** — "잠깐, 그건 좀 다른데", "그게 진짜 그래?" 같은 디베이트 톤 강제
- 회피 패턴 (`OO 말에 덧붙이자면`, `I agree and would add`) **명시적 금지**
- 매 턴 완료마다 store 업데이트 → 사용자가 카드에서 주석이 **한 개씩 차례로 등장**하는 걸 봄 (이전엔 4개 동시 등장)
- 마지막 턴은 미해결 긴장을 한 줄로 짚고 즉시 쓸 수 있는 다음 행동 제시

### 📚 학년 기반 난이도 5단계 (전면 재정의)

v1.x의 "Easy / Normal / Deep / Expert" 추상 라벨 → 학년으로 명확히:

- **Level 1**: 초등 4-6학년 — 27개 학술 어휘 명시 금지, 주제도 친구·게임·간식 같은 kid 주제로 강제
- **Level 2**: 중학교
- **Level 3**: 고등학교 (기본값)
- **Level 4**: 학부
- **Level 5**: 대학원/전문가

**카드 뽑기에도 동일 적용** — 어휘만 쉬운 척 위장한 어려운 주제 차단. Level 1의 "원형(legendary)" 카드도 초등생이 진짜 답하고 싶을 큰 질문을 5-10분 안에 답할 수 있는 형태로 나옴. 페르소나의 default register가 학년을 무시하지 못하도록 시스템 프롬프트 최상단에 배치.

### 🪟 카드 팝아웃 창 신설

Inspector "별도 창" 버튼으로 한 카드를 옵시디언 별도 윈도우에 띄움.

- 폰트 크기 슬라이더 (12-32pt) + 줄간격 슬라이더 (1.0-2.4)
- 슬라이더 값 카드별 저장 → 같은 카드 재오픈 시 복원
- 본문은 일반 MarkdownEditor — 단축키·툴바 모두 동작

### 🗂️ 폴더 우클릭 메뉴 — "새 노트팩 코덱스"

옵시디언 폴더 우클릭 시 "새 드로잉" 바로 밑에 **"새 노트팩 코덱스"** 항목 자동 추가.

- 옵시디언 기본 file-explorer ✅
- [Notebook Navigator](https://github.com/johansan/notebook-navigator) ✅ (자체 메뉴 빌드하는 plugin도 DOM hook으로 우회)
- 폴더·빈 영역 둘 다 동작 (빈 영역은 default folder로 fallback)
- 위치 일관성: 어떤 file-tree에서든 "새 드로잉" 직후로 자동 reposition
- 명령 팔레트(`Ctrl+P` → "Create new NotePack CODEX workbench") + ribbon 아이콘 fallback도 항상 동작

### 🧬 신모델 지원

- **GPT-5.5 (Plan)** — Plan 흐름 신규 default
- GPT-5.5 / GPT-5.5 Instant — Direct API
- 기존 OAuth Plan 파트너 (Anthropic / Gemini BYO) 그대로 유지

### 🔐 보안 — Gemini OAuth 평문 시크릿 제거

> ⚠️ **CRITICAL FIX**: v1.x는 Gemini OAuth용 `client_secret`이 plugin source에 평문 하드코딩되어 있었습니다. OSS 배포 시 누구나 추출 가능한 상태였음.

v2.0.0:
- 평문 시크릿 완전 제거 — 빌드 산출물 `main.js` 어디에도 없음
- **BYO OAuth** 방식 전환 — 사용자가 자기 GCP 콘솔에서 OAuth Desktop 클라이언트 발급 → Client ID/Secret을 settings에 입력
- v1.x에서 Gemini Plan 토큰을 갖고 있던 사용자는 v2 첫 실행 시 자동 무효화 + Notice 안내
- **사용자 직접 처리 권장**: 평문 시크릿이 git 히스토리·이전 빌드에 남아 있을 수 있어 GCP 콘솔에서 해당 client_secret 회전(reset) 또는 삭제

### 🛡️ AI 호출 신뢰성

- **Per-provider 동시성 제한** (공식 API 2건, Plan 엔드포인트 1건)
- **429/503/네트워크 오류 자동 재시도** — `Retry-After` 헤더 존중, exponential backoff + jitter
- **AbortController 풀 와이어링** — 카드 삭제/문서 닫힘/재분석 트리거 시 in-flight 요청 즉시 중단
- **Synthesis debounce 500ms** + in-flight guard — 카드 상태 변경마다 fan-out하던 v1.x의 폭주 차단
- 429 발생 시 분당 1회 Notice (스팸 방지)

---

## 🔁 자동 마이그레이션

v2.0.0 첫 실행 시 자동:

1. `.codex` 파일 schema v2 → v3 silent 업그레이드 (카드 손실 없음, 기존 v2 파일 즉시 호환)
2. **Gemini Plan OAuth 토큰 자동 무효화** + 재연결 Notice (보안 마이그레이션)
3. OpenAI Plan 활성 모델이 `gpt-5-2-plan` 또는 `gpt-5-4-plan`이었다면 → **`gpt-5-5-plan`으로 자동 swap**
4. UI 용어:
   - "카드팩 뽑기" → "아이디어 카드 생성"
   - 등급 라벨: 일반/희귀/영웅/전설 → **기본/주목/핵심/원형** (게임풍 톤 다운, 키 값은 호환 유지)
   - "유형별" 탭 제거

---

## 💥 Breaking Changes

- **Gemini Plan OAuth**: 자동 무효화됨. v2 첫 실행 후 settings에서 자기 GCP OAuth Desktop 클라이언트 발급 → Client ID + Secret 입력하여 재연결 필요. 단순 사용을 원하면 일반 Gemini provider(API Key) 사용 권장.
- **OpenAI Plan 모델 ID**: `openai-plan/gpt-5-2-plan`, `openai-plan/gpt-5-4-plan`, `openai-plan/gpt-5-5-instant-plan` (last one Plan endpoint에서 거절됨)을 활성으로 갖고 있던 사용자 → 자동으로 `openai-plan/gpt-5-5-plan`으로 swap.
- **CardKind**: v1.x에서 임시 추가됐던 `"todo"` 종류는 v2.0.0에서 제거. `- [ ]` / `- [x]` 마크다운은 모든 capture 카드에서 자연스럽게 동작 (옵시디언 표준).
- **수동 색상 picker 제거**: 카드 색상은 이제 content type 자동 결정. Inspector의 12색 팔레트 picker는 제거.

---

## 🐛 Bug Fixes

- 동일 카드 재분석 트리거 시 이전 분석이 살아남아 결과 충돌하던 race condition → AbortController로 즉시 중단 보장
- 카드 색상이 사용자가 직접 골라야만 보여서 결과적으로 모든 카드가 흰색이던 v1.x 시각 → content type 기반 자동
- 옵시디언 기본 file-explorer 메뉴와 Notebook Navigator 메뉴에서 우리 항목 위치가 들쭉날쭉하던 문제 → "새 드로잉" 직후로 일관 reposition
- DOM-injected 메뉴 항목에 hover highlight가 안 붙어 비활성 버튼처럼 보이던 문제 → mouseenter/leave에서 옵시디언 `.selected` 클래스 토글

---

## 📦 설치 / 업데이트

기존 v1.x 사용자: vault의 `.obsidian/plugins/achmage-notepack-codex/` 폴더에 새 빌드의 `main.js` / `manifest.json` / `styles.css` 3개 파일 덮어쓰기 → 옵시디언 재시작.

신규: [GitHub Releases](https://github.com/Achmage/achmage-notepack-codex/releases) → v2.0.0 zip → 위 경로에 압축 풀기 → Settings → 커뮤니티 플러그인에서 활성화.

---

## 🙏 감사

이번 라운드 시각 미학의 결정적 영감은 [Youngbin201/MikaNote](https://github.com/Youngbin201/MikaNote)에서 가져왔습니다. MikaNote는 옵시디언 plugin이 아닌 WPF 데스크탑 앱이라 코드는 옮길 수 없었지만, 정사각 컬러 타일 + 호버 액션 + 정렬/휴지통의 아이덴티티를 옵시디언/마크다운 환경에 재구현했습니다.

[mskayyali/Notepad](https://github.com/mskayyali/nodepad)의 bottom-up writing 핵심 흐름은 v1.0.0부터 변함없이 본 플러그인의 뿌리입니다.

[Smart Composer](https://github.com/glowingjade/obsidian-smart-composer)의 OAuth 구독 인증 패턴은 BYOK 부담을 덜기 위한 본 플러그인의 OAuth Plan 흐름의 모델이 됐습니다.

---

Made by **Achmage** (더베러 단톡방 ACH_안창현)
