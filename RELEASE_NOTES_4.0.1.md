# NotePack CODEX v4.0.1

> Obsidian 커뮤니티 플러그인 심사 규칙에 맞춘 **정리 릴리즈**입니다. 기능은 4.0.0과 같습니다. 4.0.0의 변경 내용(Claude·Gemini Plan의 공식 CLI 실행, Team/Enterprise 허용, 2026년 10월 모델 목록 등)은 [RELEASE_NOTES_4.0.0.md](RELEASE_NOTES_4.0.0.md)를 보세요.

---

## 🧹 무엇이 바뀌었나

Obsidian 커뮤니티 심사 봇은 공개된 최신 릴리즈를 자동으로 다시 검사합니다. 봇이 쓰는 `eslint-plugin-obsidianmd`의 실패(Error) 등급 규칙에 3.0.3부터 남아 있던 44건이 걸려서 모두 정리했습니다.

- **설정 화면 제목 17곳**: `<h3>`·`<h4>`·`<h5>` 대신 Obsidian 표준 설정 제목(`Setting.setHeading()`)을 씁니다. 모양은 기존과 비슷하게 맞췄습니다.
- **인라인 스타일 27곳**: `element.style.x = …` 대신 CSS 클래스와 Obsidian API(`show`/`hide`/`toggle`, `setCssStyles`)를 씁니다. 대상은 카드 보드, 그래프, 메모 편집기, 인스펙터 크기 조절, 설정 화면입니다.
- **`eval` 제거**: Claude·Gemini Plan의 CLI 실행과 OpenAI 로그인 콜백이 Node 모듈을 불러올 때 `eval`을 거치지 않습니다. 모바일에서는 여전히 Node 모듈을 불러오지 않습니다.

---

## 🧪 검증

- Obsidian 심사 Error 등급 규칙 검사: 44건 → 0건
- `npm test` 103건 통과, `npm run typecheck`, `npm run build`, `npm run check:secrets`

---

## 📦 설치 / 업데이트

옵시디언 Settings → 커뮤니티 플러그인에서 업데이트를 확인하세요. 직접 설치하려면 [GitHub Releases](https://github.com/laguna821/Obsidian_NotePack-CODEX/releases)에서 v4.0.1의 `main.js` / `manifest.json` / `styles.css`를 받아 vault의 `.obsidian/plugins/achmage-notepack-codex/`에 덮어쓴 뒤 플러그인을 OFF→ON 하세요.

3.x에서 바로 올라오는 경우 4.0.0의 자동 마이그레이션(Claude·Gemini Plan 저장 토큰 삭제, 종료된 모델 이동)이 그대로 적용됩니다.

---

Made by **Achmage** (더베러 단톡방 ACH_안창현)
