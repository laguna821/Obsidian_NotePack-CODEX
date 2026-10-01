# Security

## What NotePack CODEX runs on your computer

The Obsidian community review lists **Shell Execution** for this plugin. It comes from the Claude Plan and Gemini Plan connections, which run the official command-line tools you installed yourself: [Claude Code](https://code.claude.com/docs/en/installation) (`claude`) and [Antigravity](https://antigravity.google/docs/cli/install) (`agy`). These connections work on desktop only. On mobile the plugin starts no process.

The plugin runs nothing until you open its settings or use a Plan model. Every command is listed here:

| When | Command | Notes |
|---|---|---|
| Claude Plan connection check, and before a request (at most once a minute) | `claude --version`, `claude auth status` | Reads the version and the login state. No model request. |
| Claude Plan request | `claude -p --setting-sources "" --verbose --output-format stream-json --no-session-persistence --safe-mode --permission-mode dontAsk --no-chrome --disable-slash-commands --strict-mcp-config --tools= --model <model> (--system-prompt-file <file> \| --system-prompt <text>) [--effort <level>]` | One prompt per run, sent on stdin. No tools, no MCP servers, no user or project settings. |
| Gemini Plan connection check, and before a request (at most once a minute) | `agy --version`, `agy models` | Reads the version and the model list. No model request. |
| Gemini Plan request | `agy -p <prompt> --output-format stream-json --model <model> --mode plan` | One prompt per run, in plan mode. |
| You click **Open login terminal** | `claude auth login` or `agy` in a new terminal window | Windows: PowerShell via `cmd.exe /c start`. macOS: Terminal via `osascript`. Linux: `x-terminal-emulator`. You sign in inside the official tool. |
| Claude Plan check on Windows | `reg.exe query HKLM\SOFTWARE\Policies\ClaudeCode` and the same key under `HKCU` | Read-only. Detects Claude Code policies an organization manages on this computer. |
| You cancel a request, or it times out (Windows) | `taskkill.exe /pid <pid> /T /F` | Stops the CLI process the plugin started. |

Requests run in a new temporary folder (`notepack-codex-runtime-*` in the system temp folder). The plugin deletes it afterwards.

Credential and routing variables are never passed to the CLIs. These include API keys and tokens, `ANTHROPIC_BASE_URL`, `GOOGLE_GEMINI_BASE_URL`, and cloud-provider switches. When one of them is set, the Plan connection shows as blocked and runs nothing, so a request cannot be billed to an API account or sent elsewhere.

A Claude Plan request also stops as soon as Claude Code reports an API-key login. For an opted-in Team/Enterprise account, it also stops when an MCP server joins the session.

## Credentials

- **Claude Plan and Gemini Plan**: NotePack never reads, stores, or forwards their sign-in tokens. The CLIs keep their own login.
- **OpenAI Plan**: the browser login uses OpenAI's OAuth with PKCE. During the login, a local callback server listens on `127.0.0.1:1455` (or `1457`). The resulting tokens are stored in the plugin data of your vault, and so are any API keys you enter. If your vault syncs, they sync with it.
- **Device-local values**: the Team/Enterprise opt-in and custom executable paths are kept in Obsidian's local storage for this vault (`app.saveLocalStorage`). They never sync.

## Network

The plugin connects only to the AI providers you configure and to `auth.openai.com` and `chatgpt.com` for OpenAI Plan. The providers can be Anthropic, OpenAI, Google Gemini, OpenRouter, xAI, DeepSeek, Mistral, Perplexity, a local LM Studio or Ollama server, or your own endpoint. It has no telemetry.

## Reporting a problem

Please open an issue at <https://github.com/laguna821/Obsidian_NotePack-CODEX/issues> titled "Security". Describe the impact, but leave out exploit details. The maintainer will follow up there.

---

**요약 (한국어)**: 심사 보고서의 Shell Execution 항목은 Claude·Gemini Plan이 직접 설치한 공식 CLI(`claude`, `agy`)를 실행하기 때문에 표시됩니다. 위 표가 플러그인이 실행하는 명령의 전부입니다. Claude·Gemini 로그인 토큰은 플러그인이 다루지 않습니다. Team/Enterprise 허용과 실행 파일 경로는 동기화되지 않는 Obsidian 로컬 저장소에 vault별로 저장됩니다.
