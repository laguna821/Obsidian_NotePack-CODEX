export type UILanguage = "ko" | "en";

interface TranslationSet {
  pluginName: string;
  board: string;
  kanban: string;
  graph: string;
  settings: string;
  projects: string;
  composerPlaceholder: string;
  addNote: string;
  drawPack: string;
  promoteToNote: string;
  archive: string;
  delete: string;
  edit: string;
  reEnrich: string;
  pin: string;
  unpin: string;
  inspectorTitle: string;
  enrichment: string;
  category: string;
  annotation: string;
  confidence: string;
  relatedCards: string;
  sources: string;
  noCardSelected: string;
  packModalTitle: string;
  keep: string;
  discard: string;
  reroll: string;
  riskLabel: string;
  explorationLabel: string;
  packSeed: string;
  packDone: string;
  generating: string;
  rarityCommon: string;
  rarityRare: string;
  rarityEpic: string;
  rarityLegendary: string;
  enriching: string;
  ready: string;
  error: string;
  noApiKey: string;
  synthesis: string;
  synthesisPanelTitle: string;
  claimSynthesis: string;
  dismissSynthesis: string;
  settingsProvider: string;
  settingsApiKey: string;
  settingsModel: string;
  settingsWebGrounding: string;
  settingsPackRisk: string;
  settingsPity: string;
  settingsPromotionFolder: string;
  settingsLanguage: string;
  newProject: string;
  renameProject: string;
  deleteProject: string;
  undo: string;
  copied: string;
  noCards: string;
  emptyBoard: string;
  // Phase 5/6/7/8 additions
  sortBy: string;
  sortRecent: string;
  sortCreated: string;
  sortTitle: string;
  sortType: string;
  sortPinned: string;
  filterAll: string;
  filterCapture: string;
  filterGrowth: string;
  filterSynthesis: string;
  showTrash: string;
  hideTrash: string;
  restore: string;
  purgeForever: string;
  trashEmpty: string;
  pinAction: string;
  unpinAction: string;
  newWorkbenchMenuItem: string;
  whatIsCodex: string;
  whatIsCodexBody: string;
  formattingHint: string;
  byoOAuthHelp: string;
  openInPopout: string;
  popoutFontSize: string;
  popoutLineHeight: string;
  cardNotFound: string;
  pinnedSectionTitle: string;
  cardSizeLabel: string;
  inspectorCollapse: string;
  inspectorExpand: string;
  composerExpandTitle: string;
  composerExpandSubtitle: string;
  composerExpandPreviewLabel: string;
  composerExpandPreviewEmpty: string;
  composerExpandCancel: string;
  settingsTabSetup: string;
  settingsTabPersona: string;
  settingsTabGeneral: string;
  settingsLangToggleHint: string;
  settingsAiRuntime: string;
  settingsActiveModel: string;
  settingsActiveModelDesc: string;
  settingsActiveModelSummary: string;
  settingsProviderSummary: string;
  settingsStatusReady: string;
  settingsStatusNotConfigured: string;
  settingsStatusPrefix: string;
  settingsPlanConnections: string;
  settingsPlanConnectionsDesktopDesc: string;
  settingsPlanConnectionsMobileDesc: string;
  settingsOpenAIPlanDesc: string;
  settingsGeminiPlanDesc: string;
  settingsAnthropicPlanDesc: string;
  settingsModelsAvailable: string;
  settingsApiKeyProviders: string;
  settingsApiKeyProvidersDesc: string;
  settingsAddCustomProvider: string;
  settingsEditBtn: string;
  settingsDeleteBtn: string;
  settingsModelsCount: string;
  settingsBaseUrl: string;
  settingsConfirmDeleteProvider: string;
  settingsChatModelsHeading: string;
  settingsChatModelsDesc: string;
  settingsAddCustomModel: string;
  settingsBuiltInModelsHeading: string;
  settingsCustomModelsHeading: string;
  settingsActiveBtn: string;
  settingsUseBtn: string;
  settingsActiveSuffix: string;
  settingsCapabilities: string;
  settingsConfirmDeleteModel: string;
  settingsNeedProviderFirst: string;
  settingsAnnotationAgentsHeading: string;
  settingsAnnotationAgentsDesc: string;
  settingsAnnotationMode: string;
  settingsAnnotationModeDesc: string;
  settingsAnnotationModeSingle: string;
  settingsAnnotationModeParallel: string;
  settingsAnnotationModeSequential: string;
  settingsAiAnnotationLanguage: string;
  settingsAiAnnotationLanguageDesc: string;
  settingsAiPackLanguage: string;
  settingsAiPackLanguageDesc: string;
  settingsAgentModel: string;
  settingsAgentModelDesc: string;
  settingsAgentLanguageOverride: string;
  settingsAgentLanguageOverrideDesc: string;
  settingsAgentCustomInstruction: string;
  settingsAgentCustomInstructionDesc: string;
  settingsAgentCustomInstructionPlaceholder: string;
  settingsAgentMissingInstructionWarning: string;
  settingsAddAgent: string;
  settingsRemoveAgent: string;
  settingsModeForcedSingleNote: string;
  settingsPersonaPresetsHeading: string;
  settingsPersonaPresetsDesc: string;
  settingsAgentName: string;
  settingsAgentNameDesc: string;
  settingsAgentNamePlaceholder: string;
  settingsAgentIcon: string;
  settingsAgentIconDesc: string;
  settingsAgentIconPlaceholder: string;
  settingsAgentColor: string;
  settingsAgentColorDesc: string;
  settingsAgentColorReset: string;
  settingsAnnotationMaxSentences: string;
  settingsAnnotationMaxSentencesDesc: string;
  settingsAnnotationMaxSentencesWarning: string;
  inspectorAnnotationExpand: string;
  inspectorAnnotationCollapse: string;
  inspectorAnnotationGenerating: string;
  inspectorAnnotationError: string;
  inspectorAnnotationReferences: string;
  inspectorAnnotationReferenceMissing: string;
  inspectorExpandAll: string;
  inspectorCollapseAll: string;
  settingsLangWorkbenchDefault: string;
  settingsLangSourceNote: string;
  settingsLangInterface: string;
  settingsLangAlwaysKorean: string;
  settingsLangAlwaysEnglish: string;
  settingsLangBilingual: string;
  settingsWebGroundingHeading: string;
  settingsWebGroundingName: string;
  settingsWebGroundingEnabledDesc: string;
  settingsWebGroundingNotSupportedDesc: string;
  settingsGenerationBehaviorHeading: string;
  settingsGenerationBehaviorDesc: string;
  settingsGlobalDifficulty: string;
  settingsGlobalDifficultyDesc: string;
  settingsDifficulty1: string;
  settingsDifficulty2: string;
  settingsDifficulty3: string;
  settingsDifficulty4: string;
  settingsDifficulty5: string;
  settingsCardExploration: string;
  settingsCardExplorationDesc: string;
  settingsPackPity: string;
  settingsPackPityDesc: string;
  settingsVaultFoldersHeading: string;
  settingsPromotionFolderName: string;
  settingsPromotionFolderDesc: string;
  settingsWorkbenchFolderName: string;
  settingsWorkbenchFolderDesc: string;
  settingsInterfaceHeading: string;
  settingsInterfaceLanguageName: string;
  settingsInterfaceLanguageDesc: string;
  settingsLanguageKorean: string;
  settingsLanguageEnglish: string;
  settingsLegacyMigrationHeading: string;
  settingsMigrateInternal: string;
  settingsMigrateInternalIdleDesc: string;
  settingsMigrateInternalCompletedDesc: string;
  settingsRunMigration: string;
  settingsAgentLabelPrefix: string;
  settingsConnect: string;
  settingsReconnect: string;
  settingsDisconnect: string;
  settingsPlanReconnectNotice: string;
  settingsPlanDesktopOnlyNotice: string;
  settingsProviderConnected: string;
  settingsProviderNotConnected: string;
  settingsCustomModelsSection: string;
  settingsCustomModelsEmpty: string;
  settingsAddCustomModelInline: string;
  settingsProviderIdLockedHint: string;
  offlineCaptureToggle: string;
  offlineCaptureHint: string;
  multiSelectEnter: string;
  multiSelectExit: string;
  multiSelectionCount: string;
  actionClearSelection: string;
  bulkAnnotate: string;
  bulkAnnotateConfirm: string;
  bulkAnnotateDone: string;
  bulkAnnotateRetryFailed: string;
  bulkDrawPack: string;
  packMultiSeedLabel: string;
  packSeedNotReady: string;
  packSeedTooMany: string;
  packStageSeed: string;
  packStageGenerating: string;
  packStageFinishing: string;
  settingsNoteAuthorName: string;
  settingsNoteAuthorDesc: string;
  settingsTabCardDifficulty: string;
  settingsCardDifficultyHeading: string;
  settingsCardDifficultyIsolationNote: string;
  settingsDifficultyPresetsLabel: string;
  settingsDifficultyCustomLabel: string;
  settingsDifficultyCustomDesc: string;
  settingsDifficultyReset: string;
  settingsDifficultyPresetHint: string;
}

const ko: TranslationSet = {
  pluginName: "NotePack CODEX",
  board: "보드",
  kanban: "유형별",
  graph: "연결",
  settings: "설정",
  projects: "워크벤치",
  composerPlaceholder: "생각을 입력하세요...",
  addNote: "추가",
  drawPack: "아이디어 카드 생성",
  promoteToNote: "노트로 만들기",
  archive: "보관",
  delete: "삭제",
  edit: "수정",
  reEnrich: "다시 분석",
  pin: "고정",
  unpin: "고정 해제",
  inspectorTitle: "카드 상세",
  enrichment: "AI 분석",
  category: "카테고리",
  annotation: "주석",
  confidence: "신뢰도",
  relatedCards: "관련 카드",
  sources: "출처",
  noCardSelected: "카드를 선택하세요",
  packModalTitle: "아이디어 카드 생성",
  keep: "유지",
  discard: "버리기",
  reroll: "다시 뽑기",
  riskLabel: "위험도",
  explorationLabel: "탐색도",
  packSeed: "시드",
  packDone: "완료",
  generating: "생성 중...",
  rarityCommon: "기본",
  rarityRare: "주목",
  rarityEpic: "핵심",
  rarityLegendary: "원형",
  enriching: "분석 중...",
  ready: "준비됨",
  error: "오류",
  noApiKey: "API 키를 설정하세요",
  synthesis: "통합 인사이트",
  synthesisPanelTitle: "새 인사이트",
  claimSynthesis: "보드에 추가",
  dismissSynthesis: "닫기",
  settingsProvider: "AI 제공자",
  settingsApiKey: "API 키",
  settingsModel: "모델",
  settingsWebGrounding: "웹 검색 기반",
  settingsPackRisk: "카드 탐색도 기본값",
  settingsPity: "보정 시스템",
  settingsPromotionFolder: "노트 생성 폴더",
  settingsLanguage: "UI 언어",
  newProject: "새 워크벤치",
  renameProject: "이름 변경",
  deleteProject: "워크벤치 삭제",
  undo: "실행 취소",
  copied: "복사 완료",
  noCards: "카드가 없습니다",
  emptyBoard: "생각을 입력해서 첫 카드를 만들어보세요",
  sortBy: "정렬",
  sortRecent: "최근 수정",
  sortCreated: "생성일",
  sortTitle: "제목",
  sortType: "유형",
  sortPinned: "고정 우선",
  filterAll: "전체",
  filterCapture: "메모",
  filterGrowth: "아이디어 카드",
  filterSynthesis: "통합 인사이트",
  showTrash: "휴지통",
  hideTrash: "보드로 돌아가기",
  restore: "복구",
  purgeForever: "영구 삭제",
  trashEmpty: "휴지통이 비어 있습니다",
  pinAction: "고정",
  unpinAction: "고정 해제",
  newWorkbenchMenuItem: "새 메모 작업실",
  whatIsCodex: "CODEX란?",
  whatIsCodexBody: "Codex는 모든 카드를 모아 연결하는 작업장입니다. 메모와 할 일을 입력하고, AI가 자동으로 분류·요약하며, 아이디어 카드를 생성해 사고를 확장합니다.",
  formattingHint: "Ctrl+B 굵게 · Ctrl+I 기울임 · Ctrl+Shift+S 취소선 · Ctrl+Shift+T 할일",
  byoOAuthHelp: "GCP Console에서 본인 OAuth 클라이언트(Desktop App)를 발급받아 Client ID/Secret을 입력하세요.",
  openInPopout: "별도 창",
  popoutFontSize: "글자 크기",
  popoutLineHeight: "줄 간격",
  cardNotFound: "카드를 찾을 수 없습니다.",
  pinnedSectionTitle: "⭐ 즐겨찾기 노트",
  cardSizeLabel: "카드 크기",
  inspectorCollapse: "접기",
  inspectorExpand: "펴기",
  composerExpandTitle: "넓은 메모 작성",
  composerExpandSubtitle: "확장된 마크다운 툴바와 실시간 프리뷰로 길게 작성하세요",
  composerExpandPreviewLabel: "프리뷰",
  composerExpandPreviewEmpty: "왼쪽에 입력하면 여기에 렌더링 결과가 표시됩니다",
  composerExpandCancel: "닫기",
  settingsTabSetup: "연결",
  settingsTabPersona: "페르소나",
  settingsTabGeneral: "일반",
  settingsLangToggleHint: "언어",
  settingsAiRuntime: "AI 런타임",
  settingsActiveModel: "활성 모델",
  settingsActiveModelDesc: "이 모델은 분석, 카드팩 생성, 통합 인사이트에 사용됩니다.",
  settingsActiveModelSummary: "활성 모델",
  settingsProviderSummary: "프로바이더",
  settingsStatusReady: "실행 준비됨",
  settingsStatusNotConfigured: "AI가 설정되지 않음",
  settingsStatusPrefix: "상태",
  settingsPlanConnections: "플랜 연결",
  settingsPlanConnectionsDesktopDesc: "구독 기반 모델은 브라우저 OAuth로 연결합니다. 이 프로바이더들은 API 키가 필요하지 않습니다.",
  settingsPlanConnectionsMobileDesc: "플랜 연결은 데스크톱에서만 사용할 수 있습니다. 모바일에서는 API 키 프로바이더를 사용하세요.",
  settingsOpenAIPlanDesc: "ChatGPT / Codex 플랜 사용량을 활용합니다.",
  settingsGeminiPlanDesc: "Gemini Code Assist / Google AI 플랜 사용량을 활용합니다.",
  settingsAnthropicPlanDesc: "Claude 플랜 사용량을 활용합니다. Anthropic은 코드 입력 단계가 추가로 필요합니다.",
  settingsModelsAvailable: "사용 가능 모델",
  settingsApiKeyProviders: "API 키 프로바이더",
  settingsApiKeyProvidersDesc: "기본 프로바이더는 항상 사용할 수 있습니다. 편집해서 API 키나 엔드포인트를 설정하고, 표준이 아닌 연결이 필요하면 커스텀 프로바이더를 추가하세요.",
  settingsAddCustomProvider: "커스텀 프로바이더 추가",
  settingsEditBtn: "편집",
  settingsDeleteBtn: "삭제",
  settingsModelsCount: "모델",
  settingsBaseUrl: "Base URL",
  settingsConfirmDeleteProvider: "프로바이더와 연결된 커스텀 모델을 삭제하시겠습니까?",
  settingsChatModelsHeading: "챗 모델",
  settingsChatModelsDesc: "기본 모델은 선택만 가능합니다. 프로바이더별 식별자나 커스텀 기능 플래그가 필요할 때 커스텀 모델을 추가하세요.",
  settingsAddCustomModel: "커스텀 모델 추가",
  settingsBuiltInModelsHeading: "기본 모델",
  settingsCustomModelsHeading: "커스텀 모델",
  settingsActiveBtn: "활성",
  settingsUseBtn: "사용",
  settingsActiveSuffix: "(활성)",
  settingsCapabilities: "기능",
  settingsConfirmDeleteModel: "커스텀 모델을 삭제하시겠습니까?",
  settingsNeedProviderFirst: "커스텀 모델을 만들기 전에 먼저 프로바이더를 추가하거나 설정하세요.",
  settingsAnnotationAgentsHeading: "주석 에이전트",
  settingsAnnotationAgentsDesc: "새 카드가 주석될 때 사용할 AI 보이스를 설정합니다. 병렬 모드가 가장 빠르며, 순차 모드는 뒤의 에이전트가 앞의 주석에 응답할 수 있습니다.",
  settingsAnnotationMode: "주석 모드",
  settingsAnnotationModeDesc: "단일은 한 개의 에이전트만, 병렬은 활성 에이전트를 동시에, 순차는 순서대로 실행합니다.",
  settingsAnnotationModeSingle: "단일",
  settingsAnnotationModeParallel: "병렬",
  settingsAnnotationModeSequential: "순차",
  settingsAiAnnotationLanguage: "AI 주석 언어",
  settingsAiAnnotationLanguageDesc: "AI 주석이 사용할 언어를 제어합니다. 인터페이스 언어와는 별개입니다.",
  settingsAiPackLanguage: "AI 카드팩 언어",
  settingsAiPackLanguageDesc: "생성되는 카드팩의 언어를 제어합니다.",
  settingsAgentModel: "모델",
  settingsAgentModelDesc: "이 에이전트가 실행될 모델입니다.",
  settingsAgentLanguageOverride: "언어 오버라이드",
  settingsAgentLanguageOverrideDesc: "이 에이전트가 특정 언어로 답해야 할 때만 변경하세요. 기본은 워크벤치 기본값입니다.",
  settingsAgentCustomInstruction: "커스텀 지시문",
  settingsAgentCustomInstructionDesc: "이 AI에게 줄 시스템 지시문을 직접 입력하세요. 비어 있으면 이 AI는 작동하지 않습니다.",
  settingsAgentCustomInstructionPlaceholder: "예: 답변에 영화 예시 하나를 항상 포함하세요. (비어 있으면 작동하지 않음)",
  settingsAgentMissingInstructionWarning: "AI 페르소나를 입력해주세요! 비어 있으면 이 AI는 작동하지 않습니다.",
  settingsAddAgent: "+ AI 추가",
  settingsRemoveAgent: "✕ 이 AI 삭제",
  settingsModeForcedSingleNote: "AI가 1개일 때는 자동으로 단일 모드로 고정됩니다.",
  settingsPersonaPresetsHeading: "추천 프리셋",
  settingsPersonaPresetsDesc: "버튼을 누르면 해당 프리셋이 아래 커스텀 지시문에 자동으로 입력됩니다. 이름과 아이콘도 함께 채워져요.",
  settingsAgentName: "AI 이름",
  settingsAgentNameDesc: "이 AI에게 붙일 이름. 비어 있으면 'AI N'으로 표시됩니다.",
  settingsAgentNamePlaceholder: "예: 손석희, 일론머스크, 큐레이터",
  settingsAgentIcon: "AI 아이콘",
  settingsAgentIconDesc: "이모지 한 글자 또는 한·영 글자 1-2자. 비우면 기본 🤖.",
  settingsAgentIconPlaceholder: "예: 🦊, 손, 🚀",
  settingsAgentColor: "AI 색상",
  settingsAgentColorDesc: "이 AI의 주석 카드 색상 (테두리, 배경, 이름 색상). 비우면 기본 파란색.",
  settingsAgentColorReset: "기본값",
  settingsAnnotationMaxSentences: "AI 주석 답변 길이 (문장 수)",
  settingsAnnotationMaxSentencesDesc: "각 AI 답변의 최대 문장 수입니다 (1-10).",
  settingsAnnotationMaxSentencesWarning: "* 숫자가 커질수록 API 토큰 소모와 응답 시간이 늘어납니다.",
  inspectorAnnotationExpand: "펼치기",
  inspectorAnnotationCollapse: "접기",
  inspectorAnnotationGenerating: "분석 중...",
  inspectorAnnotationError: "오류",
  inspectorAnnotationReferences: "참고한 카드",
  inspectorAnnotationReferenceMissing: "삭제됨",
  inspectorExpandAll: "전체 펼치기",
  inspectorCollapseAll: "전체 접기",
  settingsLangWorkbenchDefault: "워크벤치 기본값",
  settingsLangSourceNote: "원본 노트 언어",
  settingsLangInterface: "인터페이스 언어",
  settingsLangAlwaysKorean: "항상 한국어",
  settingsLangAlwaysEnglish: "항상 영어",
  settingsLangBilingual: "한국어 + 영어",
  settingsWebGroundingHeading: "웹 그라운딩",
  settingsWebGroundingName: "웹 그라운딩",
  settingsWebGroundingEnabledDesc: "활성 모델이 지원할 때 실시간 웹 그라운딩을 사용합니다.",
  settingsWebGroundingNotSupportedDesc: "활성 모델은 웹 그라운딩을 지원하지 않습니다.",
  settingsGenerationBehaviorHeading: "생성 동작",
  settingsGenerationBehaviorDesc: "AI가 생성하는 주석과 아이디어 카드의 톤, 깊이, 다양성을 조절합니다.",
  settingsGlobalDifficulty: "전역 난이도",
  settingsGlobalDifficultyDesc: "AI 주석과 카드팩이 얼마나 단순하거나 깊이 있을지 제어합니다.",
  settingsDifficulty1: "1 - 아주 쉬움",
  settingsDifficulty2: "2 - 쉬움",
  settingsDifficulty3: "3 - 보통",
  settingsDifficulty4: "4 - 깊음",
  settingsDifficulty5: "5 - 전문가",
  settingsCardExploration: "카드 탐색도",
  settingsCardExplorationDesc: "값이 높을수록 더 놀라운 희귀도와 프롬프트 방향이 나옵니다.",
  settingsPackPity: "팩 보정",
  settingsPackPityDesc: "낮은 희귀도 팩이 반복되면 최소 한 장의 레어 카드를 보장합니다.",
  settingsVaultFoldersHeading: "볼트 폴더",
  settingsPromotionFolderName: "노트 생성 폴더",
  settingsPromotionFolderDesc: "카드에서 만든 노트의 기본 폴더입니다.",
  settingsWorkbenchFolderName: "기본 워크벤치 폴더",
  settingsWorkbenchFolderDesc: "새 .codex 파일이 여기에 생성됩니다.",
  settingsInterfaceHeading: "인터페이스",
  settingsInterfaceLanguageName: "인터페이스 언어",
  settingsInterfaceLanguageDesc: "NotePack 인터페이스에서 사용되는 언어입니다. AI 답변 언어는 Persona 탭에서 설정하세요.",
  settingsLanguageKorean: "한국어",
  settingsLanguageEnglish: "영어",
  settingsLegacyMigrationHeading: "레거시 마이그레이션",
  settingsMigrateInternal: "내부 프로젝트 마이그레이션",
  settingsMigrateInternalIdleDesc: "예전 플러그인이 보관하던 프로젝트로부터 .codex 파일을 생성합니다. 레거시 데이터는 삭제되지 않습니다.",
  settingsMigrateInternalCompletedDesc: "마지막 마이그레이션에서 생성된 .codex 파일 수",
  settingsRunMigration: "마이그레이션 실행",
  settingsAgentLabelPrefix: "AI",
  settingsConnect: "연결",
  settingsReconnect: "재연결",
  settingsDisconnect: "연결 해제",
  settingsPlanReconnectNotice: "OpenAI 플랜 액세스를 복구하려면 재연결하세요.",
  settingsPlanDesktopOnlyNotice: "플랜 연결은 데스크톱에서만 사용할 수 있습니다.",
  settingsProviderConnected: "연결됨",
  settingsProviderNotConnected: "연결 안 됨",
  settingsCustomModelsSection: "이 프로바이더의 커스텀 모델",
  settingsCustomModelsEmpty: "추가된 커스텀 모델이 없습니다",
  settingsAddCustomModelInline: "+ 커스텀 모델 추가",
  settingsProviderIdLockedHint: "모델 추가 후에는 프로바이더 ID를 변경할 수 없습니다",
  offlineCaptureToggle: "오프라인 캡처",
  offlineCaptureHint: "AI 주석 없이 저장",
  multiSelectEnter: "다중 선택",
  multiSelectExit: "다중 선택 끄기",
  multiSelectionCount: "{n}개 선택됨",
  actionClearSelection: "선택 해제",
  bulkAnnotate: "선택 카드 주석",
  bulkAnnotateConfirm: "{n}개 카드에 AI 주석을 추가합니다. 계속할까요?",
  bulkAnnotateDone: "{done}개 완료, {failed}개 실패",
  bulkAnnotateRetryFailed: "실패 {n}개 재시도",
  bulkDrawPack: "선택 시드로 카드 팩",
  packMultiSeedLabel: "{n}개 시드",
  packSeedNotReady: "시드 카드가 모두 ready 상태여야 합니다",
  packSeedTooMany: "시드는 최대 5개까지",
  packStageSeed: "시드 분석 중...",
  packStageGenerating: "AI가 카드 5장을 만들고 있어요...",
  packStageFinishing: "카드 정리 중...",
  settingsNoteAuthorName: "노트 작성자",
  settingsNoteAuthorDesc: "노트로 승급할 때 frontmatter의 `author` 필드에 들어갑니다. 비우면 author 필드를 만들지 않습니다.",
  settingsTabCardDifficulty: "카드 난이도",
  settingsCardDifficultyHeading: "🃏 카드 난이도",
  settingsCardDifficultyIsolationNote: "이 설정은 카드 뽑기에 적용됩니다 (한 장이든 여러 장이든 동일). AI 주석 페르소나의 말투에는 절대 영향이 없습니다.",
  settingsDifficultyPresetsLabel: "프리셋",
  settingsDifficultyCustomLabel: "풀 커스텀 프롬프트",
  settingsDifficultyCustomDesc: "직접 다듬어 입력해도 됩니다. 비우면 기본값(쉬움)이 자동으로 적용됩니다.",
  settingsDifficultyReset: "기본값으로 초기화",
  settingsDifficultyPresetHint: "버튼을 누르면 아래 텍스트에 풀 프롬프트가 채워집니다",
};

const en: TranslationSet = {
  pluginName: "NotePack CODEX",
  board: "Board",
  kanban: "By Type",
  graph: "Graph",
  settings: "Settings",
  projects: "Workbenches",
  composerPlaceholder: "Type your thought...",
  addNote: "Add Note",
  drawPack: "Draw Pack",
  promoteToNote: "Promote to Note",
  archive: "Archive",
  delete: "Delete",
  edit: "Edit",
  reEnrich: "Re-enrich",
  pin: "Pin",
  unpin: "Unpin",
  inspectorTitle: "Card Detail",
  enrichment: "AI Enrichment",
  category: "Category",
  annotation: "Annotation",
  confidence: "Confidence",
  relatedCards: "Related Cards",
  sources: "Sources",
  noCardSelected: "Select a card",
  packModalTitle: "Draw Pack",
  keep: "Keep",
  discard: "Discard",
  reroll: "Reroll",
  riskLabel: "Risk",
  explorationLabel: "Exploration",
  packSeed: "Seed",
  packDone: "Done",
  generating: "Generating...",
  rarityCommon: "Common",
  rarityRare: "Rare",
  rarityEpic: "Epic",
  rarityLegendary: "Legendary",
  enriching: "Enriching...",
  ready: "Ready",
  error: "Error",
  noApiKey: "Please set your API key",
  synthesis: "Synthesis",
  synthesisPanelTitle: "New Insight",
  claimSynthesis: "Add to Board",
  dismissSynthesis: "Dismiss",
  settingsProvider: "AI Provider",
  settingsApiKey: "API Key",
  settingsModel: "Model",
  settingsWebGrounding: "Web Grounding",
  settingsPackRisk: "Default Card Exploration",
  settingsPity: "Pity System",
  settingsPromotionFolder: "Note Promotion Folder",
  settingsLanguage: "UI Language",
  newProject: "New Workbench",
  renameProject: "Rename",
  deleteProject: "Delete Workbench",
  undo: "Undo",
  copied: "Copied!",
  noCards: "No cards",
  emptyBoard: "Type a thought to create your first card",
  sortBy: "Sort",
  sortRecent: "Recently updated",
  sortCreated: "Created",
  sortTitle: "Title",
  sortType: "Type",
  sortPinned: "Pinned first",
  filterAll: "All",
  filterCapture: "Notes",
  filterGrowth: "Idea cards",
  filterSynthesis: "Synthesis",
  showTrash: "Trash",
  hideTrash: "Back to board",
  restore: "Restore",
  purgeForever: "Delete forever",
  trashEmpty: "Trash is empty",
  pinAction: "Pin",
  unpinAction: "Unpin",
  newWorkbenchMenuItem: "New Memo Workspace",
  whatIsCodex: "What is CODEX?",
  whatIsCodexBody: "Codex is a workbench that gathers and connects every card you write. Capture notes and todos; the AI categorizes and summarizes them, and generates idea cards to grow your thinking.",
  formattingHint: "Ctrl+B bold · Ctrl+I italic · Ctrl+Shift+S strike · Ctrl+Shift+T todo",
  byoOAuthHelp: "Issue your own OAuth client (Desktop App) in GCP Console and paste its Client ID/Secret here.",
  openInPopout: "Open in window",
  popoutFontSize: "Font size",
  popoutLineHeight: "Line height",
  cardNotFound: "Card not found.",
  pinnedSectionTitle: "⭐ Favorites",
  cardSizeLabel: "Card size",
  inspectorCollapse: "Collapse",
  inspectorExpand: "Expand",
  composerExpandTitle: "Expanded Note Composer",
  composerExpandSubtitle: "Write longer notes with extended markdown tools and a live preview",
  composerExpandPreviewLabel: "Preview",
  composerExpandPreviewEmpty: "Start typing on the left to see the rendered preview here",
  composerExpandCancel: "Close",
  settingsTabSetup: "Setup",
  settingsTabPersona: "Persona",
  settingsTabGeneral: "General",
  settingsLangToggleHint: "Language",
  settingsAiRuntime: "AI Runtime",
  settingsActiveModel: "Active model",
  settingsActiveModelDesc: "This model is used for enrichment, pack generation, and synthesis.",
  settingsActiveModelSummary: "Active model",
  settingsProviderSummary: "Provider",
  settingsStatusReady: "ready to run",
  settingsStatusNotConfigured: "AI not configured",
  settingsStatusPrefix: "Status",
  settingsPlanConnections: "Plan Connections",
  settingsPlanConnectionsDesktopDesc: "Use browser-based OAuth for subscription-backed models. API keys are not required for these providers.",
  settingsPlanConnectionsMobileDesc: "Plan connections are only available on desktop. On mobile, use API key providers instead.",
  settingsOpenAIPlanDesc: "Uses your ChatGPT / Codex plan usage.",
  settingsGeminiPlanDesc: "Uses your Gemini Code Assist / Google AI plan usage.",
  settingsAnthropicPlanDesc: "Uses your Claude plan usage. Anthropic still requires a manual code step.",
  settingsModelsAvailable: "Models available",
  settingsApiKeyProviders: "API Key Providers",
  settingsApiKeyProvidersDesc: "Built-in providers stay available by default. Edit them to set API keys or endpoints, and add custom providers when you need a non-standard connection.",
  settingsAddCustomProvider: "Add custom provider",
  settingsEditBtn: "Edit",
  settingsDeleteBtn: "Delete",
  settingsModelsCount: "Models",
  settingsBaseUrl: "Base URL",
  settingsConfirmDeleteProvider: "Delete this provider and its linked custom models?",
  settingsChatModelsHeading: "Chat Models",
  settingsChatModelsDesc: "Built-in models are selectable only. Add custom models when you need a provider-specific identifier or custom capability flags.",
  settingsAddCustomModel: "Add custom model",
  settingsBuiltInModelsHeading: "Built-in models",
  settingsCustomModelsHeading: "Custom models",
  settingsActiveBtn: "Active",
  settingsUseBtn: "Use",
  settingsActiveSuffix: "(active)",
  settingsCapabilities: "Capabilities",
  settingsConfirmDeleteModel: "Delete this custom model?",
  settingsNeedProviderFirst: "Add or configure a provider before creating a custom model.",
  settingsAnnotationAgentsHeading: "Annotation Agents",
  settingsAnnotationAgentsDesc: "Configure the AI voices used when a new card is annotated. Parallel mode is fastest; sequential mode lets later agents respond to earlier annotations.",
  settingsAnnotationMode: "Annotation mode",
  settingsAnnotationModeDesc: "Single uses one agent, parallel runs enabled agents at once, sequential runs them in order.",
  settingsAnnotationModeSingle: "Single",
  settingsAnnotationModeParallel: "Parallel",
  settingsAnnotationModeSequential: "Sequential",
  settingsAiAnnotationLanguage: "AI annotation language",
  settingsAiAnnotationLanguageDesc: "Controls the language AI annotations use. This is separate from interface language.",
  settingsAiPackLanguage: "AI card pack language",
  settingsAiPackLanguageDesc: "Controls the language generated card packs use.",
  settingsAgentModel: "Model",
  settingsAgentModelDesc: "The configured model this agent runs through.",
  settingsAgentLanguageOverride: "Language override",
  settingsAgentLanguageOverrideDesc: "Leave as workbench default unless this agent should answer in a specific language.",
  settingsAgentCustomInstruction: "Custom instruction",
  settingsAgentCustomInstructionDesc: "Write the system instruction this AI should follow. Empty agents do not run.",
  settingsAgentCustomInstructionPlaceholder: "Example: Always include one film example. (Empty agents do not run)",
  settingsAgentMissingInstructionWarning: "Enter an AI persona. Empty agents do not run.",
  settingsAddAgent: "+ Add AI",
  settingsRemoveAgent: "✕ Remove this AI",
  settingsModeForcedSingleNote: "Forced to single mode when only one AI is active.",
  settingsPersonaPresetsHeading: "Recommended presets",
  settingsPersonaPresetsDesc: "Click a button to paste the preset into the custom instruction below. Name and icon are also filled in.",
  settingsAgentName: "AI name",
  settingsAgentNameDesc: "The display name for this AI. Empty falls back to 'AI N'.",
  settingsAgentNamePlaceholder: "e.g. Anchor, Elon, Critic",
  settingsAgentIcon: "AI icon",
  settingsAgentIconDesc: "One emoji or 1–2 letters. Empty falls back to 🤖.",
  settingsAgentIconPlaceholder: "e.g. 🦊, A, 🚀",
  settingsAgentColor: "AI color",
  settingsAgentColorDesc: "Color for this AI's annotation card (border, background, name). Empty falls back to default blue.",
  settingsAgentColorReset: "Reset",
  settingsAnnotationMaxSentences: "AI annotation length (sentences)",
  settingsAnnotationMaxSentencesDesc: "Maximum number of sentences per AI answer (1-10).",
  settingsAnnotationMaxSentencesWarning: "* Larger numbers increase API token usage and response time.",
  inspectorAnnotationExpand: "Expand",
  inspectorAnnotationCollapse: "Collapse",
  inspectorAnnotationGenerating: "Generating...",
  inspectorAnnotationError: "Error",
  inspectorAnnotationReferences: "Referenced cards",
  inspectorAnnotationReferenceMissing: "deleted",
  inspectorExpandAll: "Expand all",
  inspectorCollapseAll: "Collapse all",
  settingsLangWorkbenchDefault: "Workbench default",
  settingsLangSourceNote: "Source note language",
  settingsLangInterface: "Interface language",
  settingsLangAlwaysKorean: "Always Korean",
  settingsLangAlwaysEnglish: "Always English",
  settingsLangBilingual: "Korean + English",
  settingsWebGroundingHeading: "Web grounding",
  settingsWebGroundingName: "Web grounding",
  settingsWebGroundingEnabledDesc: "Enable live web grounding when the active model supports it.",
  settingsWebGroundingNotSupportedDesc: "The active model does not support web grounding.",
  settingsGenerationBehaviorHeading: "Generation behavior",
  settingsGenerationBehaviorDesc: "Shape the tone, depth, and variety of AI-generated annotations and idea cards.",
  settingsGlobalDifficulty: "Global difficulty",
  settingsGlobalDifficultyDesc: "Controls how simple or advanced AI annotations and packs should be.",
  settingsDifficulty1: "1 - Very easy",
  settingsDifficulty2: "2 - Easy",
  settingsDifficulty3: "3 - Normal",
  settingsDifficulty4: "4 - Deep",
  settingsDifficulty5: "5 - Expert",
  settingsCardExploration: "Card exploration",
  settingsCardExplorationDesc: "Higher values create more surprising rarity and prompt directions.",
  settingsPackPity: "Pack pity",
  settingsPackPityDesc: "Guarantee at least a rare card after repeated low-rarity packs.",
  settingsVaultFoldersHeading: "Vault folders",
  settingsPromotionFolderName: "Promotion folder",
  settingsPromotionFolderDesc: "Default folder for notes created from cards.",
  settingsWorkbenchFolderName: "Default workbench folder",
  settingsWorkbenchFolderDesc: "New .codex files are created here.",
  settingsInterfaceHeading: "Interface",
  settingsInterfaceLanguageName: "Interface language",
  settingsInterfaceLanguageDesc: "Language used in the NotePack interface. AI answer language is configured in the Persona tab.",
  settingsLanguageKorean: "Korean",
  settingsLanguageEnglish: "English",
  settingsLegacyMigrationHeading: "Legacy migration",
  settingsMigrateInternal: "Migrate internal projects",
  settingsMigrateInternalIdleDesc: "Create .codex files from old plugin-owned projects. Legacy data is not deleted.",
  settingsMigrateInternalCompletedDesc: "Last migration created .codex file(s)",
  settingsRunMigration: "Run migration",
  settingsAgentLabelPrefix: "AI",
  settingsConnect: "Connect",
  settingsReconnect: "Reconnect",
  settingsDisconnect: "Disconnect",
  settingsPlanReconnectNotice: "Reconnect OpenAI Plan to restore access.",
  settingsPlanDesktopOnlyNotice: "Plan connections are only available on desktop.",
  settingsProviderConnected: "Connected",
  settingsProviderNotConnected: "Not connected",
  settingsCustomModelsSection: "Custom models for this provider",
  settingsCustomModelsEmpty: "No custom models added yet",
  settingsAddCustomModelInline: "+ Add custom model",
  settingsProviderIdLockedHint: "Provider ID can't be changed after adding models",
  offlineCaptureToggle: "Offline capture",
  offlineCaptureHint: "Save without AI annotation",
  multiSelectEnter: "Multi-select",
  multiSelectExit: "Exit multi-select",
  multiSelectionCount: "{n} selected",
  actionClearSelection: "Clear",
  bulkAnnotate: "Annotate selected",
  bulkAnnotateConfirm: "Annotate {n} cards with AI?",
  bulkAnnotateDone: "{done} done, {failed} failed",
  bulkAnnotateRetryFailed: "Retry failed ({n})",
  bulkDrawPack: "Draw pack from seeds",
  packMultiSeedLabel: "{n} seeds",
  packSeedNotReady: "All seed cards must be ready",
  packSeedTooMany: "Max 5 seeds",
  packStageSeed: "Analyzing seeds...",
  packStageGenerating: "AI is drawing 5 cards...",
  packStageFinishing: "Finalizing cards...",
  settingsNoteAuthorName: "Note author",
  settingsNoteAuthorDesc: "Written to the frontmatter `author` field when promoting a card to a note. Leave blank to omit the author line.",
  settingsTabCardDifficulty: "Card Difficulty",
  settingsCardDifficultyHeading: "🃏 Card Difficulty",
  settingsCardDifficultyIsolationNote: "This setting applies to card draws (single or multi-card alike). AI annotation persona tone is never affected.",
  settingsDifficultyPresetsLabel: "Presets",
  settingsDifficultyCustomLabel: "Full custom prompt",
  settingsDifficultyCustomDesc: "Edit freely. Leave blank to fall back to the default easy preset.",
  settingsDifficultyReset: "Reset to default",
  settingsDifficultyPresetHint: "Click a preset to paste its full prompt into the textarea below",
};

const TRANSLATIONS: Record<UILanguage, TranslationSet> = { ko, en };

let currentLanguage: UILanguage = "ko";

export function setLanguage(lang: UILanguage): void {
  currentLanguage = lang;
}

export function getLanguage(): UILanguage {
  return currentLanguage;
}

export function t(key: keyof TranslationSet): string {
  return TRANSLATIONS[currentLanguage][key];
}
