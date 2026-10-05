# NotePack CODEX v4.0.2

> Obsidian 커뮤니티 심사 봇이 쓰는 규칙 묶음(`eslint-plugin-obsidianmd` recommended)을 통째로 돌려서, Error로 나오던 Obsidian 전용 항목을 마저 정리한 릴리즈입니다. 기능은 4.0.0·4.0.1과 같습니다. 4.0.0의 변경 내용은 [RELEASE_NOTES_4.0.0.md](RELEASE_NOTES_4.0.0.md), 4.0.1은 [RELEASE_NOTES_4.0.1.md](RELEASE_NOTES_4.0.1.md)를 보세요.

---

## 🧹 무엇이 바뀌었나

- **최소 Obsidian 버전 1.4.0 → 1.7.2**: 플러그인은 이미 `Vault.getFileByPath`(1.5.7부터)와 `Workspace.revealLeaf`(1.7.2부터)를 쓰고 있었는데, manifest에는 1.4.0으로 적혀 있었습니다. 실제로 필요한 버전에 맞췄습니다. 1.7.2보다 오래된 Obsidian에는 이 업데이트가 표시되지 않습니다.
- **콘솔 로그**: 플러그인을 켜고 끌 때 남기던 `console.log` 2건을 `console.debug`로 바꿨습니다. 개발자 도구의 기본 화면에는 이제 나오지 않습니다.
- **코드 정리**: CLI 실행에 쓰는 Node 모듈 로딩에 심사 규칙이 요구하는 설명 주석을 달았습니다. 정규식의 불필요한 이스케이프 1건도 지웠습니다. 동작은 같습니다.

---

## 🧪 검증

- `eslint-plugin-obsidianmd` 0.4.2 recommended 전체: Obsidian 전용 규칙(`obsidianmd/*`)의 Error 0건
- 심사 실패 등급 규칙 검사: 0건
- `npm test` 103건 통과, `npm run typecheck`, `npm run build`, `npm run check:secrets`

TypeScript 타입 검사 계열 규칙(`no-unsafe-*`, `no-floating-promises` 등)의 지적은 남아 있습니다. 심사 보고서에서 경고로 분류되는 항목이라 이번 릴리즈에서는 다루지 않았습니다.

---

## 📦 설치 / 업데이트

옵시디언 Settings → 커뮤니티 플러그인에서 업데이트를 확인하세요. 직접 설치하려면 [GitHub Releases](https://github.com/laguna821/Obsidian_NotePack-CODEX/releases)에서 v4.0.2의 `main.js` / `manifest.json` / `styles.css`를 받아 vault의 `.obsidian/plugins/achmage-notepack-codex/`에 덮어쓴 뒤 플러그인을 OFF→ON 하세요.

3.x에서 바로 올라오는 경우 4.0.0의 자동 마이그레이션(Claude·Gemini Plan 저장 토큰 삭제, 종료된 모델 이동)이 그대로 적용됩니다.

---

Made by **Achmage** (더베러 단톡방 ACH_안창현)
