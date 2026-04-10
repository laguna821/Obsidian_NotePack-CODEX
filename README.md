<img width="1856" height="882" alt="Image" src="https://github.com/user-attachments/assets/349be07d-d5ec-4403-9fe8-2781765c7dc7" />

<img width="1587" height="877" alt="Image" src="https://github.com/user-attachments/assets/fe15f812-6122-455b-af0f-f5ac21203bda" />

## `mskayyali`의 `Notepad`앱의 옵시디언 버전 + 하스스톤식 카드뽑기 옵시디언 플러그인.
Inspiration:
https://github.com/mskayyali/nodepad

`mskayyali`의 `Notepad`앱은 극한의 AI-assisted bottom-up human-driver writing을 주도하는 앱입니다.
원래의 Notepad 앱은 굉장히 단순합니다.

1. 내가 뭔가 노트나 단상 메모를 추가합니다.
2. AI가 자동적으로 주석/코멘트를 달고 1차 분류를 자동으로 해줍니다.
3. 노트가 쌓이면 Ghost synthesis로 "자동 대분류 주제 파생 제안"을 해줍니다.

원래의 Notepad 앱이 워낙 강력하길래, Obsidian plugin 버전으로 만들었습니다.

그런데 저는 여기에서 한 발 더 나아겠습니다.

제가 직접 만든 양자 프레임워크를 적용한 '메타인지 난이도 별 하스스톤 뽑기식 글쓰기 주제 뽑기 프롬프트'를 적용하여,

1. 추가된 메모를 분석한 후 "카드팩 뽑기"를 누르면,
2. 일반/희귀/영웅/전설 4가지 등급 중 하나의 카드 5장이 나타나며,
3. 이 글쓰기 카드들을 keep 또는 discard로 새 글쓰기 카드들을 파생할 수 있습니다.


## "노트끼리 연결시키는" Human-driven 글쓰기가 막히는 이유는 당신이 멍청해서가 아닙니다.

"노트끼리 연결시키는" 글쓰기 주제를 만들어내기가 막히는 것은 human-driven bottom up approach에 한계가 있기 때문입니다.

간단한 아이디어가 있다면 질문하고, AI의 주석을 보고 내 메모를 업데이트하고,
그걸 바탕으로 카드 팩 뽑기를 해서 새 글 주제를 뽑아보고,
또 글을 쓰고 킵하고 카드 뽑고를 반복하세요.
AI는 강제로 당신의 사고력을 시험할 bottom-up writing 주제를 끊임없이 파생시켜줍니다.
마크다운 노트로도 변환시켜 내 vault에 모을 수 있습니다.

**딱 하나만 생각하세요. 질문하고, 노트를 업데이트하고, 더 빡센 노트를 쓰고, 또 질문하고만 반복하세요.**

## BYOK (Bring Your own API Key)

본 앱은 반드시 AI를 연동해야 작동합니다.
하지만 Smart Composer에서 영감을 받아서 "OAuth 구독 인증 웹 연동"을 구현했습니다.
별도의 API 충전이 없어도 유료 구독 AI가 있다면 (예: GPT) 그걸로 연동해서 사용이 가능합니다.
단순하니까 지금 바로 bottom-up writing을 시작하세요.

- Made by : Achmage (더베러 단톡방 ACH_안창현)
