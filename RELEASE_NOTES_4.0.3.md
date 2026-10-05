# NotePack CODEX v4.0.3

> Obsidian 커뮤니티 심사 보고서의 **경고(Warning)와 권장(Recommendation) 항목**을 정리한 릴리즈입니다. 4.0.2 보고서에 나온 소스 코드 항목을 모두 고쳤고, Obsidian 1.13 이상에서는 설정 화면이 Obsidian의 새 설정 API로 그려져 **설정 검색**에 잡힙니다. 4.0.0의 기능 변경은 [RELEASE_NOTES_4.0.0.md](RELEASE_NOTES_4.0.0.md)를 보세요.

---

## 🧹 심사 경고 정리

- **비동기 처리**: 버튼·명령·콜백에서 결과를 버리던 Promise를 명시적으로 처리합니다.
- **타입**: AI 응답 JSON을 `any`로 읽지 않고 응답 형태 타입으로 읽습니다. 카드팩 결과에서 문자열이 아닌 값은 버립니다.
- **팝아웃 창 호환**: 타이머는 `window.setTimeout` 등으로, DOM 생성은 `createEl`·`createSvg`로, `instanceof HTMLElement`는 `instanceOf`로 바꿨습니다.
- **확인 창**: `window.confirm` 대신 Obsidian 모달을 씁니다(사용자 프로바이더 삭제, 선택 카드 일괄 주석).
- **네트워크**: OpenAI 로그인의 토큰 교환이 `fetch` 대신 Obsidian의 `requestUrl`을 씁니다.
- **명령 이름**: 플러그인 이름을 뺐습니다. "Create new workbench", "Open last workbench", "Open home", "Migrate legacy projects to .codex files"입니다. 명령 ID는 그대로라 단축키는 유지됩니다.
- **정리**: 쓰지 않는 코드와 불필요한 타입 단언을 지웠습니다.

## ⚙️ 설정 화면 (Obsidian 1.13 이상)

- 새 설정 API(`getSettingDefinitions`)를 씁니다. 맨 위에 활성 모델과 상태가 있고, **연결·페르소나·카드 난이도·일반**이 각각 페이지로 열립니다.
- 설정 검색에서 "Claude", "API key", "난이도", "폴더" 같은 말로 해당 섹션을 찾을 수 있습니다.
- 1.13보다 오래된 Obsidian에서는 기존 탭 화면이 그대로 나옵니다.

## 🐛 버그 수정

- 설정의 **노트 생성 폴더·노트 작성자·주석 최대 문장 수**, 카드 난이도의 **직접 입력 프롬프트**에서 한 글자 칠 때마다 화면이 다시 그려져 커서가 빠지던 문제를 고쳤습니다.
- 플랜 카드의 **실행 파일 경로** 이름과 설명이 보이지 않고, 그 때문에 카드가 비정상적으로 길어지던 문제를 고쳤습니다.

## 💾 저장 위치와 요구 버전

- Team/Enterprise 허용과 실행 파일 경로를 브라우저 `localStorage` 대신 Obsidian의 로컬 저장소 API(`app.saveLocalStorage`)에 저장합니다. 여전히 동기화되지 않고, 이제 vault마다 따로 저장됩니다.
- **4.0.2 이하에서 올라오면 이 두 값을 한 번 다시 설정해야 합니다.** 다시 허용하기 전까지 조직 계정은 막힌 상태로 남습니다.
- 이 API 때문에 최소 Obsidian 버전이 **1.8.7**이 됐습니다.
- 개발 도구 의존성의 보안 경고 3건을 정리했습니다(esbuild 0.28, Obsidian 타입 1.13.1, moment 2.31 고정). 배포되는 플러그인 파일과는 관계없습니다.

## 📄 문서

- [SECURITY.md](SECURITY.md): Claude·Gemini Plan이 실행하는 프로그램과 인자, 네트워크 연결, 저장 위치를 적었습니다. 심사 보고서의 **Shell Execution** 항목은 Plan이 공식 CLI를 실행하는 기능 자체라 계속 표시됩니다.
- [CHANGELOG.md](CHANGELOG.md): 버전별 변경 요약을 한곳에 모았습니다.

---

## 🧪 검증

- `eslint-plugin-obsidianmd` 0.4.2 recommended 전체(타입 정보 포함): 경고·오류 0건. 제품·모델 이름(NotePack CODEX, OpenAI Plan, GPT-4.1-mini 등)까지 소문자로 바꾸라는 `ui/sentence-case` 18건은 고유명사라 그대로 두었습니다.
- `npm test` 103건, `npm run typecheck`, `npm run build`, `npm run check:secrets`, `npm audit` 0건
- Obsidian 1.13.7(격리한 테스트 프로필과 테스트 vault)에서 확인한 항목:
  - 네 설정 페이지 표시, 값 변경 뒤 다시 그리기, 에이전트 추가·삭제
  - 입력 중 커서 유지, 설정 검색, 언어 전환
  - 삭제 확인 모달, 실행 파일 경로 저장·삭제
  - 1.13 이전용 탭 화면

---

## 📦 설치 / 업데이트

옵시디언 Settings → 커뮤니티 플러그인에서 업데이트를 확인하세요. 직접 설치하려면 [GitHub Releases](https://github.com/laguna821/Obsidian_NotePack-CODEX/releases)에서 v4.0.3의 `main.js` / `manifest.json` / `styles.css`를 받아 vault의 `.obsidian/plugins/achmage-notepack-codex/`에 덮어쓴 뒤 플러그인을 OFF→ON 하세요.

3.x에서 바로 올라오는 경우 4.0.0의 자동 마이그레이션(Claude·Gemini Plan 저장 토큰 삭제, 종료된 모델 이동)이 그대로 적용됩니다.

---

Made by **Achmage** (더베러 단톡방 ACH_안창현)
