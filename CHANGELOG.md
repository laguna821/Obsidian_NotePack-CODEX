# Changelog

버전별 자세한 내용은 각 릴리즈 노트와 [GitHub Releases](https://github.com/laguna821/Obsidian_NotePack-CODEX/releases)에 있습니다.

## 4.0.3 — 2026-10-01

- Obsidian 커뮤니티 심사 보고서의 경고·권장 항목을 정리했습니다. 비동기 처리, 응답 JSON 타입, 팝아웃 창 호환, `window.confirm` 대신 모달, `fetch` 대신 `requestUrl`, 플러그인 이름을 뺀 명령 이름이 바뀌었습니다.
- Obsidian 1.13 이상에서는 새 설정 API를 써서 설정이 네 페이지로 나뉘고 설정 검색에 잡힙니다.
- 설정 입력란에서 글자마다 커서가 빠지던 문제와 플랜 카드의 실행 파일 경로 표시 문제를 고쳤습니다.
- Team/Enterprise 허용과 실행 파일 경로를 Obsidian 로컬 저장소 API에 저장합니다. 4.0.2 이하에서 올라오면 한 번 다시 설정해야 합니다. 최소 Obsidian 버전은 1.8.7입니다.
- [SECURITY.md](SECURITY.md)에 실행하는 명령을 모두 적었습니다.
- [RELEASE_NOTES_4.0.3.md](RELEASE_NOTES_4.0.3.md)

## 4.0.2 — 2026-10-01

- 심사 규칙 전체 검사에서 나온 Error를 정리했습니다. 최소 Obsidian 버전은 1.7.2입니다.
- [RELEASE_NOTES_4.0.2.md](RELEASE_NOTES_4.0.2.md)

## 4.0.1 — 2026-10-01

- 심사 실패 등급 44건(설정 제목, 인라인 스타일)을 정리하고 `eval`을 없앴습니다.
- [RELEASE_NOTES_4.0.1.md](RELEASE_NOTES_4.0.1.md)

## 4.0.0 — 2026-10-01

- Claude·Gemini Plan을 공식 CLI(Claude Code, Antigravity) 실행으로 바꿨습니다. Claude Team/Enterprise는 컴퓨터별 허용으로 쓸 수 있습니다.
- 2026년 10월 기준 모델 목록을 넣었습니다. 종료되는 GPT-5.5 선택은 GPT-5.6 Sol로 옮겨집니다.
- OpenAI Plan 토큰 갱신을 고쳤습니다.
- [RELEASE_NOTES_4.0.0.md](RELEASE_NOTES_4.0.0.md)

## 3.0.3 — 2026-05-21

- 기본 파일 탐색기의 빈 곳 우클릭으로 새 메모 작업공간을 만들지 못하던 문제를 고쳤습니다.
- 파일 탐색기 상단에 새 메모 작업공간 버튼을 넣었습니다.

## 3.0.2 — 2026-05-20

- CSS 정리(심사 미리보기 지적 사항)와 README 영어 소개를 넣었습니다.

## 3.0.1 — 2026-05-20

- [릴리즈](https://github.com/laguna821/Obsidian_NotePack-CODEX/releases/tag/3.0.1)

## 3.0.0 — 2026-05-13

- 멀티 시드 카드팩, 오프라인 캡처, 선택 카드 일괄 AI 주석을 넣었습니다.
- OpenAI·Claude·Gemini Plan 연결을 검증하고 Gemini Plan 안정성을 높였습니다.
- [RELEASE_NOTES_3.0.0.md](RELEASE_NOTES_3.0.0.md)

## 2.0.0 – 2.3.0 — 2026-05-07 ~ 2026-05-13

- 2.0.0: MikaNote 스타일 컬러 타일 보드, 토론 기반 AI 분석, 학년 기반 난이도, GPT-5.5 Plan, 보안 강화 ([RELEASE_NOTES.md](RELEASE_NOTES.md))
- 2.1.0: 보드 메모 카드 크기 조절
- 2.2.0, 2.3.0: [GitHub Releases](https://github.com/laguna821/Obsidian_NotePack-CODEX/releases) 참고

## 1.0.0 – 1.5.0 — 2026-04-30 ~ 2026-05-07

- 첫 공개 버전과 초기 업데이트. [GitHub Releases](https://github.com/laguna821/Obsidian_NotePack-CODEX/releases) 참고
