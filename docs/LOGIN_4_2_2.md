# 4.2.2 로그인 조사와 수정 근거

기준: 공식 4.2.1 태그 `248ea940590e1b0beb3250c3413c8be5b0fb3ee4`.
비교: CMDS Achmage 1.2.0 소스 `df6c3b4`의 `NativeRuntimeService`,
`NativeCliResolver`, `NativeRuntimePathStore`, 설치·로그인 모달.

최종 검증 연구: `research:rr-42fb8edb92a3ed5d6d39d2a0c88218ab:781e1d7284119192c98c6f14857ad96a5e4edfd68efb4689ac28a400c8c20d95` (R-009).
참조 R-024: `research:rr-0896c43f4d5288f519c553770b6457d9:c2012b27777dbc1bc23aae40f53e0405b87b80fbee52aa1df1bb61340fb440a1`.
기존 Achmage 설치 검증: `research:rr-42fb8edb92a3ed5d6d39d2a0c88218ab:950d9e33f43913612cf5b97635cd108f59b2ca0363d2485484aabe22ab27d9c6`.

## 확인한 결함

1. 1.13+ 설정의 초기 페이지는 활성 모델만 표시하고 로그인은 Setup 하위 페이지에 숨겼다.
2. native Plan의 실행 가능 여부를 실제 기기 인증과 무관하게 `ready`로 표시했다.
3. CLI의 `result.errors` 오류 배열을 버려 OAuth 오류가 일반 실패로 축약될 수 있었다.
4. 실제 요청이 거절되어도 연결 상태와 캐시가 준비됨으로 남았다.
5. CMDS의 설치·로그인 안내는 이식하지 않았다. 실행 파일 경로 후보 일부와 CMDS 사용자 지정 경로도 재사용하지 않았다.
6. CMDS는 Claude 매 요청 전 인증을 확인하지만 NotePack은 60초간 인증 결과를 재사용했다.

카드: `generatePack → buildAIConfig → chatCompletion → completeWithClaude`.
주석: `enrichCardWithAgent → buildAIConfigForModel → chatCompletion → completeWithClaude`.
두 경로는 동일한 런타임을 사용한다. 모델은 카드의 활성 모델과 페르소나별 모델을 따로 선택한다.
기존 `.codex` 문서별 페르소나 선택 역시 보존하며 전역 모델로 덮어쓰지 않는다.

## 검증과 한계

- 수정 전 회귀시험: OAuth 오류 누락, 오류 뒤 ready 유지, 로그인 시작 뒤 ready 유지가 재현되었다.
- 현재 Windows PC / Claude Code 2.1.285: 출시본의 Sonnet 일반 응답 및 Opus 구조화 응답은 성공했다.
- 수정본 실제 생성 함수: Sonnet·Opus 각각 페르소나 주석과 카드 5장 생성 성공 (합성 메모 사용, 개인 볼트 내용 미전송).
- 자동 검사 132개 및 TypeScript 검사·프로덕션 빌드 통과. 버전 일치·비밀정보 검사도 통과했다.
- 별도 테스트 볼트의 Obsidian 1.14.4: 설정 초기 페이지의 연결 영역, Claude 설치·로그인 모달, 실제 응답 버튼 및 ‘실제 응답 확인됨’ 상태 전환 확인. 로컬 스크린샷은 `.qa/settings-4.2.2.png`, `.qa/response-verified.png`에 있다.
- 첫 UI 재로딩은 Obsidian의 로드된 모듈을 재사용해 이전 화면을 보였다. 파일 해시가 일치함을 확인한 뒤 격리 앱을 완전히 다시 시작해서 변경 화면을 재검증했다.
- 사용자가 보고한 노트북의 OAuth 오류는 아직 현지 재현되지 않았다. CMDS 경로 선택 차이는 가능한 원인이며 확정 원인이 아니다.
- macOS·Linux 설치 및 실제 로그인 교체는 실행하지 않았다. 설치 명령/경로 분기는 검사했지만 기기 E2E 성공으로 세지 않는다.
- 초기 격리 검증 이후 사용자가 기존 Achmage 적용과 GitHub 브랜치·main·릴리스를 명시적으로 승인했다.
- 기존 Achmage의 플러그인 파일을 로컬 백업하고 4.2.2를 설치했다. `data.json` 해시와 메모리 내 설정 비교로 기존 설정 보존을 확인했다. CMDS 플러그인은 변경하지 않았다.
- 설치된 4.2.2의 실제 작업 화면·팩 모달 코드로 합성 메모를 검증했다. Sonnet 주석 6.8초 / 카드 5장 7.4초, Opus 주석 8.7초 / 카드 5장 11.9초. 기기·입력·서버 상태에 따라 달라지는 단일 관측값이다. 사용자 노트를 전송하거나 저장 내용을 바꾸지 않았다.
- 파일 없이 `setViewState`로 검증 화면을 여는 첫 시도에서 Obsidian이 빈 화면을 반환했다. 등록된 플러그인의 view factory를 임시 leaf에 직접 연결하고 저장 콜백을 비운 방식으로 검증했다. 검증 화면은 종료 후 정리했다.

공식 설치 명령은 2026-10-07 [Claude 문서](https://code.claude.com/docs/en/installation)와
[Antigravity 문서](https://antigravity.google/docs/cli/install)에서 재확인했다.

재실행: `npm test`, `npm run typecheck`, `npm run build`, `npm run check:versions`, `npm run check:secrets`.
실제 구독 요청: `node scripts/probe-plan-features.mjs sonnet` / `opus` (합성 메모만 사용).
