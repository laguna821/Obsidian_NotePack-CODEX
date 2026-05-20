import { App, Modal, Notice, Platform, PluginSettingTab, Setting } from "obsidian";
import type NotePackPlugin from "../main";
import { setLanguage, t } from "./i18n";
import {
  getActiveModelExecutionState,
  getActiveModelLabel,
  getDefaultProviderId,
  getModelsForProvider,
  getProviderConnectionSummary,
  getProviderDefinition,
  getProviderDefinitions,
  getProviderDisplayName,
  isBuiltInChatModel,
  isBuiltInProvider,
  removeChatModel,
  removeProvider,
  resolveActiveChatModel,
  resolveProviderBaseUrl,
  setActiveChatModel,
  upsertChatModel,
  upsertProvider,
} from "./ai/settings-registry";
import {
  MAX_ANNOTATION_AGENTS,
  normalizeAnnotationAgents,
} from "./ai/personas";
import { PERSONA_PRESET_ENTRIES } from "./ai/persona-presets";
import {
  PACK_DIFFICULTY_PRESETS,
  SYNTHESIS_DIFFICULTY_PRESETS,
  type DifficultyPresetEntry,
} from "./ai/difficulty-presets";
import {
  buildAnthropicPlanAuthorizeUrl,
  buildGeminiPlanAuthorizeUrl,
  resolveGeminiCredentials,
  setupCodeAssistUser,
  buildOpenAIPlanAuthorizeUrl,
  createOAuthState,
  createPkcePair,
  exchangeAnthropicPlanCode,
  exchangeGeminiPlanCode,
  exchangeOpenAIPlanCode,
  extractOpenAIAccountId,
  parseOAuthParam,
  waitForOAuthCallback,
} from "./ai/oauth";
import type {
  AIChatModel,
  AIOAuthState,
  AIProviderAdditionalSettings,
  AIProviderRecord,
  AIProviderType,
  AISettings,
  AnnotationAgentReference,
  AnnotationMode,
  OutputLanguageMode,
  SupportedOutputLanguage,
} from "./types";

const PLAN_PROVIDER_TYPES: AIProviderType[] = ["openai-plan", "anthropic-plan", "gemini-plan"];

function isPlanProviderType(type: AIProviderType): boolean {
  return PLAN_PROVIDER_TYPES.includes(type);
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function createProviderId(type: AIProviderType, label: string): string {
  return `${slugify(type) || "provider"}-${slugify(label) || "custom"}`;
}

function createModelId(providerId: string, model: string): string {
  return `${providerId}/${slugify(model) || "custom-model"}`;
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isOpenAIPlanReconnectRequired(provider: AIProviderRecord): boolean {
  if (provider.type !== "openai-plan") return false;
  const oauth = provider.oauth;
  if (!oauth) return false;
  if (oauth.refreshToken) return false;
  if (!oauth.accessToken) return true;
  return oauth.expiresAt !== undefined && oauth.expiresAt <= Date.now();
}

function getPlanConnectionLabel(provider: AIProviderRecord): string {
  if (!provider.oauth?.accessToken && !provider.oauth?.refreshToken) return "Not connected";
  if (provider.type === "openai-plan" && isOpenAIPlanReconnectRequired(provider)) {
    return "Reconnect OpenAI Plan";
  }
  if (provider.oauth.email) return `Connected as ${provider.oauth.email}`;
  if (provider.oauth.accountId) return `Connected account: ${provider.oauth.accountId}`;
  return "Connected";
}

function cloneProvider(provider: AIProviderRecord): AIProviderRecord {
  return {
    ...provider,
    oauth: provider.oauth ? { ...provider.oauth } : undefined,
    additionalSettings: provider.additionalSettings ? { ...provider.additionalSettings } : undefined,
  };
}

function cloneModel(model: AIChatModel): AIChatModel {
  return {
    ...model,
    thinking: model.thinking ? { ...model.thinking } : undefined,
    reasoning: model.reasoning ? { ...model.reasoning } : undefined,
  };
}

function buildProviderOptions(): AIProviderType[] {
  return getProviderDefinitions()
    .map((definition) => definition.type)
    .filter((type) => !isPlanProviderType(type));
}

function describeModelCapabilities(model: AIChatModel): string {
  const caps: string[] = [];
  if (model.supportsGrounding) caps.push("grounding");
  if (model.supportsJsonSchema) caps.push("json-schema");
  if (model.supportsJsonObject ?? true) caps.push("json-object");
  if (model.supportsAnnotations) caps.push("annotations");
  if (model.reasoning?.enabled) caps.push(`reasoning:${model.reasoning.reasoning_effort ?? "medium"}`);
  if (model.thinking?.enabled) caps.push(`thinking:${model.thinking.budget_tokens ?? "default"}`);
  return caps.length > 0 ? caps.join(", ") : "basic";
}

function languageModeToSettingValue(
  mode: OutputLanguageMode | undefined,
  fixedLanguage?: SupportedOutputLanguage,
): string {
  if (!mode) return "default";
  if (mode === "fixed" && fixedLanguage) return fixedLanguage;
  return mode;
}

function settingValueToLanguageMode(value: string): {
  mode?: OutputLanguageMode;
  fixedLanguage?: SupportedOutputLanguage;
} {
  if (value === "default") return {};
  if (value === "ko" || value === "en" || value === "ja" || value === "zh" || value === "es" || value === "fr") {
    return { mode: "fixed", fixedLanguage: value };
  }
  return { mode: value as OutputLanguageMode };
}

function addLanguageOptions(dropdown: { addOption(value: string, display: string): unknown }, includeDefault = false): void {
  if (includeDefault) dropdown.addOption("default", t("settingsLangWorkbenchDefault"));
  dropdown.addOption("auto-source", t("settingsLangSourceNote"));
  dropdown.addOption("ui-language", t("settingsLangInterface"));
  dropdown.addOption("ko", t("settingsLangAlwaysKorean"));
  dropdown.addOption("en", t("settingsLangAlwaysEnglish"));
  dropdown.addOption("bilingual", t("settingsLangBilingual"));
}

class ProviderModal extends Modal {
  private readonly existingIds: Set<string>;
  private readonly allowTypeChange: boolean;
  private readonly onSubmit: (provider: AIProviderRecord, stagedModels: AIChatModel[]) => void;
  private readonly provider?: AIProviderRecord;
  private readonly allowedTypes: AIProviderType[];
  private readonly existingChatModels: AIChatModel[];

  private providerType: AIProviderType;
  private providerId: string;
  private apiKey: string;
  private baseUrl: string;
  private additionalSettings: AIProviderAdditionalSettings;
  private stagedModels: AIChatModel[];
  private providerIdLocked: boolean;

  constructor(
    app: App,
    provider: AIProviderRecord | undefined,
    existingIds: string[],
    allowedTypes: AIProviderType[],
    existingChatModels: AIChatModel[],
    onSubmit: (provider: AIProviderRecord, stagedModels: AIChatModel[]) => void,
  ) {
    super(app);
    this.provider = provider ? cloneProvider(provider) : undefined;
    this.existingIds = new Set(existingIds);
    this.allowTypeChange = !provider;
    this.onSubmit = onSubmit;
    this.allowedTypes = allowedTypes;
    this.existingChatModels = existingChatModels.map((model) => cloneModel(model));

    const initialType = provider?.type ?? allowedTypes[0];
    this.providerType = initialType;
    this.providerId = provider?.id ?? createProviderId(initialType, getProviderDefinition(initialType).label);
    this.apiKey = provider?.apiKey ?? "";
    this.baseUrl = provider?.baseUrl ?? "";
    this.additionalSettings = { ...(provider?.additionalSettings ?? {}) };

    this.stagedModels = provider
      ? this.existingChatModels
          .filter((model) => model.providerId === this.providerId && !isBuiltInChatModel(model.id))
          .map((model) => cloneModel(model))
      : [];
    this.providerIdLocked = false;
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const definition = getProviderDefinition(this.providerType);

    this.titleEl.setText(this.provider ? `Edit ${getProviderDisplayName(this.provider)}` : "Add provider");
    this.contentEl.empty();

    new Setting(this.contentEl)
      .setName("Provider type")
      .setDesc("Choose the provider family for this connection.")
      .addDropdown((dropdown) => {
        this.allowedTypes.forEach((type) => {
          dropdown.addOption(type, getProviderDefinition(type).label);
        });
        dropdown.setValue(this.providerType);
        dropdown.setDisabled(!this.allowTypeChange);
        dropdown.onChange((value) => {
          const nextType = value as AIProviderType;
          if (!this.provider && this.providerId === createProviderId(this.providerType, definition.label)) {
            this.providerId = createProviderId(nextType, getProviderDefinition(nextType).label);
          }
          this.providerType = nextType;
          this.render();
        });
      });

    const providerIdSetting = new Setting(this.contentEl)
      .setName("Provider ID")
      .setDesc("Models bind to this provider instance by ID.")
      .addText((text) => {
        text
          .setPlaceholder("custom-provider")
          .setValue(this.providerId)
          .setDisabled(Boolean(this.provider) || this.providerIdLocked)
          .onChange((value) => {
            this.providerId = value;
          });
      });

    if (!this.provider && this.providerIdLocked) {
      providerIdSetting.descEl.createEl("div", {
        text: t("settingsProviderIdLockedHint"),
        cls: "notepack-modal-provider-id-locked-hint",
      });
    }

    this.contentEl.createEl("p", {
      text: `Auth: ${definition.authStrategy}. Family: ${definition.family}.`,
    });

    if (definition.authStrategy === "apiKey" || definition.authStrategy === "apiKey-or-oauth") {
      new Setting(this.contentEl)
        .setName("API key")
        .setDesc(definition.keyPlaceholder ?? "Enter your API key.")
        .addText((text) => {
          text.inputEl.type = "password";
          text
            .setPlaceholder(definition.keyPlaceholder ?? "sk-...")
            .setValue(this.apiKey)
            .onChange((value) => {
              this.apiKey = value;
            });
        });
    }

    if (definition.requiresBaseUrl || definition.defaultBaseUrl || this.baseUrl) {
      new Setting(this.contentEl)
        .setName("Base URL")
        .setDesc(definition.defaultBaseUrl ? `Default: ${definition.defaultBaseUrl}` : "Custom API endpoint.")
        .addText((text) => {
          text
            .setPlaceholder(definition.baseUrlPlaceholder ?? definition.defaultBaseUrl ?? "https://api.example.com/v1")
            .setValue(this.baseUrl)
            .onChange((value) => {
              this.baseUrl = value;
            });
        });
    }

    definition.additionalSettings.forEach((field) => {
      if (field.type === "toggle") {
        new Setting(this.contentEl)
          .setName(field.label)
          .setDesc(field.description ?? "")
          .addToggle((toggle) => {
            toggle.setValue(Boolean(this.additionalSettings[field.key])).onChange((value) => {
              this.additionalSettings[field.key] = value;
            });
          });
        return;
      }

      new Setting(this.contentEl)
        .setName(field.label)
        .setDesc(field.description ?? "")
        .addText((text) => {
          text
            .setPlaceholder(field.placeholder ?? "")
            .setValue(String(this.additionalSettings[field.key] ?? ""))
            .onChange((value) => {
              this.additionalSettings[field.key] = value;
            });
        });
    });

    this.renderCustomModelsSubsection();

    const footer = this.contentEl.createDiv({ cls: "notepack-settings-modal-actions" });
    footer.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());

    const saveButton = footer.createEl("button", { text: this.provider ? "Save" : "Add provider" });
    saveButton.addClass("mod-cta");
    saveButton.addEventListener("click", () => {
      const providerId = this.providerId.trim();
      if (!providerId) {
        new Notice("Provider ID is required.");
        return;
      }

      if (!this.provider && this.existingIds.has(providerId)) {
        new Notice("That provider ID already exists.");
        return;
      }

      const provider: AIProviderRecord = {
        type: this.providerType,
        id: providerId,
        apiKey: this.apiKey.trim() || undefined,
        baseUrl: this.baseUrl.trim() || undefined,
        oauth: this.provider?.oauth ? { ...this.provider.oauth } : undefined,
        additionalSettings:
          Object.keys(this.additionalSettings).length > 0 ? { ...this.additionalSettings } : undefined,
      };

      const finalModels = this.stagedModels.map((model) => ({
        ...cloneModel(model),
        providerId,
        providerType: this.providerType,
      }));

      this.onSubmit(provider, finalModels);
      this.close();
    });
  }

  private renderCustomModelsSubsection(): void {
    const section = this.contentEl.createDiv({ cls: "notepack-modal-models-section" });
    section.createEl("h4", {
      text: t("settingsCustomModelsSection"),
      cls: "notepack-modal-models-heading",
    });

    if (this.stagedModels.length === 0) {
      section.createEl("p", {
        text: t("settingsCustomModelsEmpty"),
        cls: "notepack-modal-models-empty",
      });
    } else {
      this.stagedModels.forEach((model) => {
        const row = section.createDiv({ cls: "notepack-modal-model-row" });
        const info = row.createDiv({ cls: "notepack-modal-model-row-info" });
        info.createEl("strong", { text: model.label });
        info.createEl("span", { text: model.model });

        const actions = row.createDiv({ cls: "notepack-modal-model-row-actions" });
        actions.createEl("button", { text: t("settingsEditBtn") }).addEventListener("click", () => {
          this.openModelSubModal(model);
        });
        actions.createEl("button", { text: t("settingsDeleteBtn") }).addEventListener("click", () => {
          this.stagedModels = this.stagedModels.filter((item) => item.id !== model.id);
          this.render();
        });
      });
    }

    const addBtn = section.createEl("button", {
      text: t("settingsAddCustomModelInline"),
      cls: "notepack-modal-add-model-btn",
    });
    addBtn.addEventListener("click", () => {
      this.openModelSubModal(undefined);
    });
  }

  private openModelSubModal(editingModel: AIChatModel | undefined): void {
    const providerId = this.providerId.trim();
    if (!providerId) {
      new Notice("Provider ID is required.");
      return;
    }

    if (!this.provider && !this.providerIdLocked) {
      this.providerIdLocked = true;
    }

    const virtualProvider: AIProviderRecord = {
      type: this.providerType,
      id: providerId,
      apiKey: this.apiKey.trim() || undefined,
      baseUrl: this.baseUrl.trim() || undefined,
      oauth: this.provider?.oauth ? { ...this.provider.oauth } : undefined,
      additionalSettings:
        Object.keys(this.additionalSettings).length > 0 ? { ...this.additionalSettings } : undefined,
    };

    const collisionIds = [
      ...this.existingChatModels.map((model) => model.id),
      ...this.stagedModels.map((model) => model.id),
    ].filter((id) => id !== editingModel?.id);

    new ChatModelModal(
      this.app,
      [virtualProvider],
      editingModel,
      collisionIds,
      (savedModel) => {
        const idx = this.stagedModels.findIndex((item) => item.id === savedModel.id);
        if (idx >= 0) {
          this.stagedModels[idx] = savedModel;
        } else {
          this.stagedModels.push(savedModel);
        }
        this.render();
      },
    ).open();
  }
}

class ChatModelModal extends Modal {
  private readonly providers: AIProviderRecord[];
  private readonly existingIds: Set<string>;
  private readonly onSubmit: (model: AIChatModel) => void;
  private readonly model?: AIChatModel;

  private providerId: string;
  private label: string;
  private modelName: string;
  private description: string;
  private supportsGrounding: boolean;
  private groundingModelId: string;
  private supportsJsonSchema: boolean;
  private supportsJsonObject: boolean;
  private supportsAnnotations: boolean;
  private reasoningEnabled: boolean;
  private reasoningEffort: "low" | "medium" | "high";
  private thinkingEnabled: boolean;
  private thinkingBudget: string;

  constructor(
    app: App,
    providers: AIProviderRecord[],
    model: AIChatModel | undefined,
    existingIds: string[],
    onSubmit: (model: AIChatModel) => void,
  ) {
    super(app);
    this.providers = providers.map((provider) => cloneProvider(provider));
    this.existingIds = new Set(existingIds);
    this.model = model ? cloneModel(model) : undefined;
    this.onSubmit = onSubmit;

    this.providerId = model?.providerId ?? providers[0]?.id ?? "";
    this.label = model?.label ?? "";
    this.modelName = model?.model ?? "";
    this.description = model?.description ?? "";
    this.supportsGrounding = Boolean(model?.supportsGrounding);
    this.groundingModelId = model?.groundingModelId ?? "";
    this.supportsJsonSchema = Boolean(model?.supportsJsonSchema);
    this.supportsJsonObject = model?.supportsJsonObject ?? true;
    this.supportsAnnotations = Boolean(model?.supportsAnnotations);
    this.reasoningEnabled = Boolean(model?.reasoning?.enabled);
    this.reasoningEffort = model?.reasoning?.reasoning_effort ?? "medium";
    this.thinkingEnabled = Boolean(model?.thinking?.enabled);
    this.thinkingBudget = model?.thinking?.budget_tokens ? String(model.thinking.budget_tokens) : "";
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    this.titleEl.setText(this.model ? `Edit ${this.model.label}` : "Add custom model");
    this.contentEl.empty();

    new Setting(this.contentEl)
      .setName("Provider")
      .setDesc("This model runs through the selected provider instance.")
      .addDropdown((dropdown) => {
        this.providers.forEach((provider) => {
          dropdown.addOption(provider.id, getProviderDisplayName(provider));
        });
        dropdown.setValue(this.providerId);
        dropdown.onChange((value) => {
          this.providerId = value;
        });
      });

    new Setting(this.contentEl)
      .setName("Label")
      .setDesc("Friendly name shown in the settings UI.")
      .addText((text) => {
        text.setPlaceholder("My custom model").setValue(this.label).onChange((value) => {
          this.label = value;
        });
      });

    new Setting(this.contentEl)
      .setName("Model name")
      .setDesc("Exact model identifier sent to the provider.")
      .addText((text) => {
        text.setPlaceholder("gpt-4.1-mini").setValue(this.modelName).onChange((value) => {
          this.modelName = value;
        });
      });

    new Setting(this.contentEl)
      .setName("Description")
      .setDesc("Optional note for later reference.")
      .addTextArea((text) => {
        text.setPlaceholder("Optional notes about this model.").setValue(this.description).onChange((value) => {
          this.description = value;
        });
      });

    new Setting(this.contentEl)
      .setName("Supports web grounding")
      .setDesc("Enable if this model can support grounded search or a grounded sibling model.")
      .addToggle((toggle) => {
        toggle.setValue(this.supportsGrounding).onChange((value) => {
          this.supportsGrounding = value;
          this.render();
        });
      });

    if (this.supportsGrounding) {
      new Setting(this.contentEl)
        .setName("Grounding model override")
        .setDesc("Optional alternate model ID for grounded web requests.")
        .addText((text) => {
          text.setPlaceholder("gpt-4o-search-preview").setValue(this.groundingModelId).onChange((value) => {
            this.groundingModelId = value;
          });
        });
    }

    new Setting(this.contentEl)
      .setName("Supports JSON schema")
      .setDesc("Enable if the provider can honor JSON schema output.")
      .addToggle((toggle) => {
        toggle.setValue(this.supportsJsonSchema).onChange((value) => {
          this.supportsJsonSchema = value;
        });
      });

    new Setting(this.contentEl)
      .setName("Supports JSON object mode")
      .setDesc("Enable for providers that return JSON objects or support prompt-only JSON fallback.")
      .addToggle((toggle) => {
        toggle.setValue(this.supportsJsonObject).onChange((value) => {
          this.supportsJsonObject = value;
        });
      });

    new Setting(this.contentEl)
      .setName("Supports annotations")
      .setDesc("Enable if the provider returns citations or annotation metadata.")
      .addToggle((toggle) => {
        toggle.setValue(this.supportsAnnotations).onChange((value) => {
          this.supportsAnnotations = value;
        });
      });

    new Setting(this.contentEl)
      .setName("Reasoning profile")
      .setDesc("Optional metadata for reasoning-capable models.")
      .addToggle((toggle) => {
        toggle.setValue(this.reasoningEnabled).onChange((value) => {
          this.reasoningEnabled = value;
          this.render();
        });
      });

    if (this.reasoningEnabled) {
      new Setting(this.contentEl)
        .setName("Reasoning effort")
        .setDesc("Relative effort hint for reasoning-capable models.")
        .addDropdown((dropdown) => {
          dropdown.addOptions({ low: "Low", medium: "Medium", high: "High" });
          dropdown.setValue(this.reasoningEffort);
          dropdown.onChange((value) => {
            this.reasoningEffort = value as "low" | "medium" | "high";
          });
        });
    }

    new Setting(this.contentEl)
      .setName("Thinking profile")
      .setDesc("Optional thinking metadata used by select models.")
      .addToggle((toggle) => {
        toggle.setValue(this.thinkingEnabled).onChange((value) => {
          this.thinkingEnabled = value;
          this.render();
        });
      });

    if (this.thinkingEnabled) {
      new Setting(this.contentEl)
        .setName("Thinking budget tokens")
        .setDesc("Optional token budget for thinking mode.")
        .addText((text) => {
          text.setPlaceholder("8192").setValue(this.thinkingBudget).onChange((value) => {
            this.thinkingBudget = value;
          });
        });
    }

    const footer = this.contentEl.createDiv({ cls: "notepack-settings-modal-actions" });
    footer.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());

    const saveButton = footer.createEl("button", { text: this.model ? "Save" : "Add model" });
    saveButton.addClass("mod-cta");
    saveButton.addEventListener("click", () => {
      const provider = this.providers.find((item) => item.id === this.providerId);
      if (!provider) {
        new Notice("Please choose a provider.");
        return;
      }

      const label = this.label.trim();
      const modelName = this.modelName.trim();
      if (!label || !modelName) {
        new Notice("Label and model name are required.");
        return;
      }

      const modelId = this.model?.id ?? createModelId(provider.id, modelName);
      if (!this.model && this.existingIds.has(modelId)) {
        new Notice("A custom model with that ID already exists.");
        return;
      }

      this.onSubmit({
        id: modelId,
        providerType: provider.type,
        providerId: provider.id,
        label,
        model: modelName,
        description: this.description.trim() || undefined,
        supportsGrounding: this.supportsGrounding,
        groundingModelId: this.groundingModelId.trim() || undefined,
        supportsJsonSchema: this.supportsJsonSchema,
        supportsJsonObject: this.supportsJsonObject,
        supportsAnnotations: this.supportsAnnotations,
        reasoning: this.reasoningEnabled ? { enabled: true, reasoning_effort: this.reasoningEffort } : undefined,
        thinking: this.thinkingEnabled
          ? { enabled: true, budget_tokens: parseOptionalNumber(this.thinkingBudget) }
          : undefined,
      });
      this.close();
    });
  }
}

abstract class PlanConnectionModal extends Modal {
  protected readonly provider: AIProviderRecord;
  protected readonly onSubmit: (oauth: AIOAuthState) => Promise<void> | void;
  protected statusEl!: HTMLElement;
  protected errorEl!: HTMLElement;

  constructor(app: App, provider: AIProviderRecord, onSubmit: (oauth: AIOAuthState) => Promise<void> | void) {
    super(app);
    this.provider = cloneProvider(provider);
    this.onSubmit = onSubmit;
  }

  protected setStatus(message = ""): void {
    if (this.statusEl) this.statusEl.textContent = message;
  }

  protected setError(message = ""): void {
    if (!this.errorEl) return;
    this.errorEl.textContent = message;
    this.errorEl.style.display = message ? "block" : "none";
  }

  protected createFooter(): HTMLElement {
    const footer = this.contentEl.createDiv({ cls: "notepack-settings-modal-actions" });
    footer.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    return footer;
  }
}

class OpenAIPlanConnectionModal extends PlanConnectionModal {
  private redirectValue = "";
  private pkceVerifier = "";
  private state = "";
  private authorizeUrl = "";

  onOpen(): void {
    this.titleEl.setText("Connect OpenAI Plan");
    this.contentEl.empty();

    this.contentEl.createEl("p", {
      text: "Log in with OpenAI in your browser. NotePack will try to connect automatically when the callback arrives.",
    });

    this.statusEl = this.contentEl.createDiv({ cls: "notepack-settings-note" });
    this.errorEl = this.contentEl.createDiv({ cls: "notepack-settings-warning" });
    this.errorEl.style.display = "none";

    new Setting(this.contentEl)
      .setName("OpenAI login")
      .setDesc("Browser login opens ChatGPT/Codex authorization.")
      .addButton((button) => {
        button.setButtonText("Login to OpenAI").setCta().onClick(() => {
          void this.startAutomaticConnect();
        });
      });

    new Setting(this.contentEl)
      .setName("Redirect URL (fallback)")
      .setDesc("Use this only if automatic connect fails. Paste the full redirect URL from your browser.")
      .addTextArea((text) => {
        text.setPlaceholder("http://localhost:1455/auth/callback?code=...").onChange((value) => {
          this.redirectValue = value;
          this.setError("");
        });
      })
      .addButton((button) => {
        button.setButtonText("Connect with URL").onClick(() => {
          void this.finishWithRedirectUrl();
        });
      });

    this.createFooter();
  }

  private async ensureFlow(): Promise<void> {
    if (this.authorizeUrl && this.pkceVerifier && this.state) return;
    const pkce = await createPkcePair();
    const state = createOAuthState();
    this.pkceVerifier = pkce.verifier;
    this.state = state;
    this.authorizeUrl = buildOpenAIPlanAuthorizeUrl({ pkce, state });
  }

  private async startAutomaticConnect(): Promise<void> {
    this.setError("");
    this.setStatus("Preparing login...");

    try {
      await this.ensureFlow();
      window.open(this.authorizeUrl, "_blank");
      this.setStatus("Waiting for OpenAI authorization...");

      const code = await waitForOAuthCallback({
        state: this.state,
        redirectUri: "http://localhost:1455/auth/callback",
      });

      const token = await exchangeOpenAIPlanCode({
        code,
        pkceVerifier: this.pkceVerifier,
      });

      await this.completeConnection(token);
    } catch (error) {
      this.setStatus("");
      this.setError("Automatic connect failed. Paste the full redirect URL below and try again.");
      console.error(error);
    }
  }

  private async finishWithRedirectUrl(): Promise<void> {
    this.setError("");
    await this.ensureFlow();

    const code = parseOAuthParam(this.redirectValue, "code");
    const state = parseOAuthParam(this.redirectValue, "state");
    if (!code || !state) {
      this.setError("Paste the full redirect URL from your browser address bar.");
      return;
    }
    if (state !== this.state) {
      this.setError("OAuth state mismatch. Start login again and use the newest redirect URL.");
      return;
    }

    try {
      const token = await exchangeOpenAIPlanCode({
        code,
        pkceVerifier: this.pkceVerifier,
      });

      await this.completeConnection(token);
    } catch (error) {
      this.setError("Manual connect failed. Start login again and paste the newest redirect URL.");
      console.error(error);
    }
  }

  private async completeConnection(token: Awaited<ReturnType<typeof exchangeOpenAIPlanCode>>): Promise<void> {
    this.setStatus("Saving connection...");

    await this.onSubmit({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      accountId: extractOpenAIAccountId(token),
    });

    new Notice("OpenAI Plan connected");
    this.close();
  }
}

class GeminiPlanConnectionModal extends PlanConnectionModal {
  private redirectValue = "";
  private pkceVerifier = "";
  private state = "";
  private authorizeUrl = "";

  onOpen(): void {
    this.titleEl.setText("Connect Gemini Plan");
    this.contentEl.empty();

    this.contentEl.createEl("p", {
      text: "Log in with Google in your browser. NotePack will try to connect automatically when the callback arrives.",
    });

    this.statusEl = this.contentEl.createDiv({ cls: "notepack-settings-note" });
    this.errorEl = this.contentEl.createDiv({ cls: "notepack-settings-warning" });
    this.errorEl.style.display = "none";

    new Setting(this.contentEl)
      .setName("Google login")
      .setDesc("Browser login opens Gemini/Google authorization.")
      .addButton((button) => {
        button.setButtonText("Login to Google").setCta().onClick(() => {
          void this.startAutomaticConnect();
        });
      });

    new Setting(this.contentEl)
      .setName("Redirect URL (fallback)")
      .setDesc("Use this only if automatic connect fails. Paste the full redirect URL from your browser.")
      .addTextArea((text) => {
        text.setPlaceholder("http://localhost:8085/oauth2callback?code=...").onChange((value) => {
          this.redirectValue = value;
          this.setError("");
        });
      })
      .addButton((button) => {
        button.setButtonText("Connect with URL").onClick(() => {
          void this.finishWithRedirectUrl();
        });
      });

    this.createFooter();
  }

  private getCredentials(): { clientId: string; clientSecret: string } {
    const extra = this.provider.additionalSettings ?? {};
    return resolveGeminiCredentials({
      clientId: String(extra.geminiByoClientId ?? ""),
      clientSecret: String(extra.geminiByoClientSecret ?? ""),
    });
  }

  private async ensureFlow(): Promise<boolean> {
    const creds = this.getCredentials();
    if (this.authorizeUrl && this.pkceVerifier && this.state) return true;
    const pkce = await createPkcePair();
    const state = createOAuthState();
    this.pkceVerifier = pkce.verifier;
    this.state = state;
    this.authorizeUrl = buildGeminiPlanAuthorizeUrl({ pkce, state, clientId: creds.clientId });
    return true;
  }

  private async startAutomaticConnect(): Promise<void> {
    this.setError("");
    this.setStatus("Preparing login...");

    try {
      const ready = await this.ensureFlow();
      if (!ready) {
        this.setStatus("");
        return;
      }
      const creds = this.getCredentials();

      window.open(this.authorizeUrl, "_blank");
      this.setStatus("Waiting for Google authorization...");

      const code = await waitForOAuthCallback({
        state: this.state,
        redirectUri: "http://localhost:8085/oauth2callback",
      });

      const token = await exchangeGeminiPlanCode({
        code,
        pkceVerifier: this.pkceVerifier,
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
      });

      this.setStatus("Setting up Gemini Code Assist...");
      let managedProjectId: string | undefined;
      let setupErrorMessage: string | undefined;
      try {
        const setup = await setupCodeAssistUser(token.access_token);
        managedProjectId = setup.projectId;
      } catch (setupError) {
        setupErrorMessage =
          setupError instanceof Error ? setupError.message : String(setupError);
        console.error("Code Assist onboarding failed", setupError);
      }

      await this.onSubmit({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
        email: token.email,
        managedProjectId,
      });

      if (setupErrorMessage) {
        // OAuth token is valid and stored — but Code Assist project onboarding
        // failed, so any :generateContent call will 404 until this clears. Tell
        // the user up front instead of letting them hit the opaque 404 later.
        new Notice(
          `Gemini Plan 로그인은 성공했지만 Code Assist 프로젝트 설정에 실패했습니다: ${setupErrorMessage}`,
          12000,
        );
        this.setError(`Code Assist setup failed: ${setupErrorMessage}`);
      } else {
        new Notice("Gemini Plan connected");
        this.close();
      }
    } catch (error) {
      this.setStatus("");
      this.setError("Automatic connect failed. Paste the full redirect URL below and try again.");
      console.error(error);
    }
  }

  private async finishWithRedirectUrl(): Promise<void> {
    this.setError("");
    const ready = await this.ensureFlow();
    if (!ready) return;
    const creds = this.getCredentials();

    const code = parseOAuthParam(this.redirectValue, "code");
    const state = parseOAuthParam(this.redirectValue, "state");
    if (!code || !state) {
      this.setError("Paste the full redirect URL from your browser address bar.");
      return;
    }
    if (state !== this.state) {
      this.setError("OAuth state mismatch. Start login again and use the newest redirect URL.");
      return;
    }

    try {
      const token = await exchangeGeminiPlanCode({
        code,
        pkceVerifier: this.pkceVerifier,
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
      });

      let managedProjectId: string | undefined;
      let setupErrorMessage: string | undefined;
      try {
        const setup = await setupCodeAssistUser(token.access_token);
        managedProjectId = setup.projectId;
      } catch (setupError) {
        setupErrorMessage =
          setupError instanceof Error ? setupError.message : String(setupError);
        console.error("Code Assist onboarding failed", setupError);
      }

      await this.onSubmit({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
        email: token.email,
        managedProjectId,
      });

      if (setupErrorMessage) {
        // OAuth token is valid and stored — but Code Assist project onboarding
        // failed, so any :generateContent call will 404 until this clears. Tell
        // the user up front instead of letting them hit the opaque 404 later.
        new Notice(
          `Gemini Plan 로그인은 성공했지만 Code Assist 프로젝트 설정에 실패했습니다: ${setupErrorMessage}`,
          12000,
        );
        this.setError(`Code Assist setup failed: ${setupErrorMessage}`);
      } else {
        new Notice("Gemini Plan connected");
        this.close();
      }
    } catch (error) {
      this.setError("Manual connect failed. Start login again and paste the newest redirect URL.");
      console.error(error);
    }
  }
}

class AnthropicPlanConnectionModal extends PlanConnectionModal {
  private code = "";
  private pkceVerifier = "";
  private state = "";
  private authorizeUrl = "";
  private riskAcknowledged = false;

  onOpen(): void {
    this.titleEl.setText("Connect Claude Plan");
    this.contentEl.empty();

    this.contentEl.createEl("p", {
      text: "Anthropic still requires a browser login and code exchange. This is no longer a token-paste modal, but it still needs the authorization code from the redirected browser URL.",
    });

    const warning = this.contentEl.createDiv({ cls: "notepack-settings-warning" });
    warning.createEl("strong", { text: "Warning" });
    warning.createEl("p", {
      text: getProviderDefinition("anthropic-plan").warning || "",
    });

    this.statusEl = this.contentEl.createDiv({ cls: "notepack-settings-note" });
    this.errorEl = this.contentEl.createDiv({ cls: "notepack-settings-warning" });
    this.errorEl.style.display = "none";

    new Setting(this.contentEl)
      .setName("I understand the risk")
      .setDesc("You must acknowledge this warning before connecting Claude Plan.")
      .addToggle((toggle) => {
        toggle.setValue(this.riskAcknowledged).onChange((value) => {
          this.riskAcknowledged = value;
        });
      });

    new Setting(this.contentEl)
      .setName("Claude login")
      .setDesc("Open the Claude browser login first.")
      .addButton((button) => {
        button.setButtonText("Login to Claude").setCta().onClick(() => {
          void this.openClaudeLogin();
        });
      });

    new Setting(this.contentEl)
      .setName("Authorization code")
      .setDesc("Paste the code from the redirected Claude URL.")
      .addText((text) => {
        text.setPlaceholder("Paste authorization code").onChange((value) => {
          this.code = value;
          this.setError("");
        });
      })
      .addButton((button) => {
        button.setButtonText("Connect").setCta().onClick(() => {
          void this.finishConnect();
        });
      });

    this.createFooter();
  }

  private async ensureFlow(): Promise<void> {
    if (this.authorizeUrl && this.pkceVerifier && this.state) return;
    const pkce = await createPkcePair();
    const state = createOAuthState();
    this.pkceVerifier = pkce.verifier;
    this.state = state;
    this.authorizeUrl = buildAnthropicPlanAuthorizeUrl({ pkce, state });
  }

  private async openClaudeLogin(): Promise<void> {
    this.setError("");
    this.setStatus("Preparing Claude login...");
    try {
      await this.ensureFlow();
      window.open(this.authorizeUrl, "_blank");
      this.setStatus("Complete the Claude login, then paste the returned authorization code.");
    } catch (error) {
      this.setStatus("");
      this.setError("Failed to initialize the Claude login flow.");
      console.error(error);
    }
  }

  private async finishConnect(): Promise<void> {
    this.setError("");
    if (!this.riskAcknowledged) {
      this.setError("Acknowledge the warning before connecting Claude Plan.");
      return;
    }
    if (!this.code.trim()) {
      this.setError("Paste the authorization code from the redirected Claude URL.");
      return;
    }

    await this.ensureFlow();

    try {
      const token = await exchangeAnthropicPlanCode({
        code: this.code.trim(),
        state: this.state,
        pkceVerifier: this.pkceVerifier,
      });

      await this.onSubmit({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      });

      new Notice("Claude Plan connected");
      this.close();
    } catch (error) {
      this.setError("Claude OAuth failed. Double-check the code and try again.");
      console.error(error);
    }
  }
}

type SettingsTabId = "setup" | "persona" | "card-difficulty" | "general";

export class NotePackSettingTab extends PluginSettingTab {
  private readonly plugin: NotePackPlugin;
  private activeTab: SettingsTabId = "setup";
  private activePersonaTab = 0;

  constructor(app: App, plugin: NotePackPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const settings = this.plugin.settingsStore.settings;

    containerEl.empty();
    containerEl.addClass("notepack-settings");

    this.renderTabBar(containerEl);
    const panel = containerEl.createDiv({ cls: "notepack-settings-tabpanel" });

    if (this.activeTab === "setup") {
      this.renderOverview(panel, settings);
      this.renderPlanSection(panel, settings);
      this.renderProviderSection(panel, settings);
      this.renderWebGroundingSection(panel, settings);
    } else if (this.activeTab === "persona") {
      this.renderAnnotationSection(panel, settings);
      this.renderPersonaTuningSection(panel, settings);
    } else if (this.activeTab === "card-difficulty") {
      this.renderCardDifficultyTab(panel, settings);
    } else {
      this.renderVaultPathSection(panel, settings);
      this.renderUiLanguageSection(panel, settings);
      this.renderMaintenanceSection(panel, settings);
    }
  }

  private renderTabBar(containerEl: HTMLElement): void {
    const tabbar = containerEl.createDiv({ cls: "notepack-settings-tabbar" });
    const switcher = tabbar.createDiv({ cls: "np-view-switcher" });

    const tabs: ReadonlyArray<{ id: SettingsTabId; label: string }> = [
      { id: "setup", label: t("settingsTabSetup") },
      { id: "persona", label: t("settingsTabPersona") },
      { id: "card-difficulty", label: t("settingsTabCardDifficulty") },
      { id: "general", label: t("settingsTabGeneral") },
    ];

    tabs.forEach((tab) => {
      const button = switcher.createEl("button", {
        text: tab.label,
        cls: "np-view-btn",
      });
      if (tab.id === this.activeTab) {
        button.addClass("np-view-btn--active");
      }
      button.addEventListener("click", () => {
        if (this.activeTab === tab.id) return;
        this.activeTab = tab.id;
        this.display();
      });
    });

    this.renderLanguageToggle(tabbar);
  }

  private renderLanguageToggle(parentEl: HTMLElement): void {
    const current = this.plugin.settingsStore.settings.uiLanguage;
    const toggle = parentEl.createDiv({ cls: "notepack-settings-lang-toggle" });
    toggle.setAttr("aria-label", t("settingsLangToggleHint"));

    (["ko", "en"] as const).forEach((lang) => {
      const button = toggle.createEl("button", {
        text: lang === "ko" ? "한국어" : "EN",
        cls: "notepack-settings-lang-btn",
      });
      if (lang === current) {
        button.addClass("notepack-settings-lang-btn--active");
      }
      button.addEventListener("click", () => {
        if (lang === current) return;
        this.saveSettings({ ...this.plugin.settingsStore.settings, uiLanguage: lang });
      });
    });
  }

  private saveSettings(nextSettings: AISettings): void {
    setLanguage(nextSettings.uiLanguage);
    this.plugin.settingsStore.updateSettings(nextSettings);
    this.display();
  }

  private persistProviderWithModels(provider: AIProviderRecord, stagedModels: AIChatModel[]): void {
    let next = upsertProvider(this.plugin.settingsStore.settings, provider);

    const originalCustomIds = new Set(
      this.plugin.settingsStore.settings.chatModels
        .filter((model) => model.providerId === provider.id && !isBuiltInChatModel(model.id))
        .map((model) => model.id),
    );
    const finalIds = new Set(stagedModels.map((model) => model.id));

    for (const id of originalCustomIds) {
      if (!finalIds.has(id)) {
        next = removeChatModel(next, id);
      }
    }
    for (const model of stagedModels) {
      next = upsertChatModel(next, model);
    }

    this.saveSettings(next);
  }

  private renderOverview(containerEl: HTMLElement, settings: AISettings): void {
    new Setting(containerEl).setName(t("settingsAiRuntime")).setHeading();

    const executionState = getActiveModelExecutionState(settings);
    const resolved = resolveActiveChatModel(settings);
    const modelOptions = [...settings.chatModels].sort((left, right) => left.label.localeCompare(right.label));

    new Setting(containerEl)
      .setName(t("settingsActiveModel"))
      .setDesc(t("settingsActiveModelDesc"))
      .addDropdown((dropdown) => {
        modelOptions.forEach((model) => {
          const provider = settings.providers.find((item) => item.id === model.providerId);
          const providerLabel = provider ? getProviderDisplayName(provider) : model.providerId;
          dropdown.addOption(model.id, `${model.label} | ${providerLabel}`);
        });
        dropdown.setValue(settings.activeChatModelId);
        dropdown.onChange((value) => {
          this.saveSettings(setActiveChatModel(this.plugin.settingsStore.settings, value));
        });
      });

    const summary = containerEl.createDiv({ cls: "notepack-settings-summary" });
    summary.createEl("p", { text: `${t("settingsActiveModelSummary")}: ${getActiveModelLabel(settings)}` });
    summary.createEl("p", {
      text: resolved
        ? `${t("settingsProviderSummary")}: ${getProviderDisplayName(resolved.provider)}`
        : `${t("settingsProviderSummary")}: ${t("settingsStatusNotConfigured")}`,
    });
    summary.createEl("p", {
      text: executionState.canExecute
        ? `${t("settingsStatusPrefix")}: ${t("settingsStatusReady")}`
        : `${t("settingsStatusPrefix")}: ${executionState.message}`,
    });
  }

  private renderPlanSection(containerEl: HTMLElement, settings: AISettings): void {
    const section = containerEl.createDiv({ cls: "notepack-settings-section" });
    section.createEl("h3", { text: t("settingsPlanConnections") });
    section.createEl("p", {
      text: Platform.isDesktop
        ? t("settingsPlanConnectionsDesktopDesc")
        : t("settingsPlanConnectionsMobileDesc"),
    });

    const grid = section.createDiv({ cls: "notepack-settings-grid" });
    this.renderPlanCard(grid, settings, "openai-plan", "OpenAI", t("settingsOpenAIPlanDesc"));
    this.renderPlanCard(grid, settings, "gemini-plan", "Gemini", t("settingsGeminiPlanDesc"));
    this.renderPlanCard(grid, settings, "anthropic-plan", "Claude", t("settingsAnthropicPlanDesc"));
  }

  private renderPlanCard(
    containerEl: HTMLElement,
    settings: AISettings,
    type: Extract<AIProviderType, "openai-plan" | "gemini-plan" | "anthropic-plan">,
    title: string,
    description: string,
  ): void {
    const providerId = getDefaultProviderId(type);
    if (!providerId) return;

    const provider = settings.providers.find((item) => item.id === providerId && item.type === type);
    if (!provider) return;

    const connected = Boolean(provider.oauth?.accessToken || provider.oauth?.refreshToken);
    const needsReconnect = isOpenAIPlanReconnectRequired(provider);
    const models = getModelsForProvider(settings, provider.id);
    const card = containerEl.createDiv({ cls: "notepack-settings-card" });

    card.createEl("h4", { text: title });
    card.createEl("p", { text: description });
    card.createEl("p", {
      text: getPlanConnectionLabel(provider),
    });
    card.createEl("p", { text: `${t("settingsModelsAvailable")}: ${models.length}` });

    if (needsReconnect) {
      const reconnectEl = card.createEl("p", {
        text: t("settingsPlanReconnectNotice"),
      });
      reconnectEl.addClass("notepack-settings-warning");
    }

    if (type === "anthropic-plan") {
      const warning = getProviderDefinition(type).warning;
      if (warning) {
        const warningEl = card.createEl("p", { text: warning });
        warningEl.addClass("notepack-settings-warning");
      }
    }

    const actions = card.createDiv({ cls: "notepack-settings-card-actions" });
    const connectButton = actions.createEl("button", { text: connected || needsReconnect ? t("settingsReconnect") : t("settingsConnect") });
    connectButton.addClass("mod-cta");
    connectButton.disabled = !Platform.isDesktop;
    connectButton.addEventListener("click", () => {
      if (!Platform.isDesktop) {
        new Notice(t("settingsPlanDesktopOnlyNotice"));
        return;
      }

      const saveOauth = async (oauth: AIOAuthState): Promise<void> => {
        this.saveSettings(
          upsertProvider(this.plugin.settingsStore.settings, {
            ...provider,
            oauth,
          }),
        );
      };

      switch (type) {
        case "openai-plan":
          new OpenAIPlanConnectionModal(this.app, provider, saveOauth).open();
          break;
        case "gemini-plan":
          new GeminiPlanConnectionModal(this.app, provider, saveOauth).open();
          break;
        case "anthropic-plan":
          new AnthropicPlanConnectionModal(this.app, provider, saveOauth).open();
          break;
      }
    });

    const disconnectButton = actions.createEl("button", { text: t("settingsDisconnect") });
    disconnectButton.disabled = !connected;
    disconnectButton.addEventListener("click", () => {
      this.saveSettings(
        upsertProvider(this.plugin.settingsStore.settings, {
          ...provider,
          oauth: undefined,
        }),
      );
    });
  }

  private renderProviderSection(containerEl: HTMLElement, settings: AISettings): void {
    const section = containerEl.createDiv({ cls: "notepack-settings-section" });
    section.createEl("h3", { text: t("settingsApiKeyProviders") });
    section.createEl("p", { text: t("settingsApiKeyProvidersDesc") });

    const toolbar = section.createDiv({ cls: "notepack-settings-toolbar" });
    const addButton = toolbar.createEl("button", { text: t("settingsAddCustomProvider") });
    addButton.addClass("mod-cta");
    addButton.addEventListener("click", () => {
      const types = buildProviderOptions();
      new ProviderModal(
        this.app,
        undefined,
        this.plugin.settingsStore.settings.providers.map((provider) => provider.id),
        types,
        this.plugin.settingsStore.settings.chatModels,
        (newProvider, stagedModels) => {
          this.persistProviderWithModels(newProvider, stagedModels);
        },
      ).open();
    });

    const providers = [...settings.providers]
      .filter((provider) => !isPlanProviderType(provider.type))
      .sort((left, right) => {
        const leftBuiltIn = isBuiltInProvider(left) ? 0 : 1;
        const rightBuiltIn = isBuiltInProvider(right) ? 0 : 1;
        if (leftBuiltIn !== rightBuiltIn) return leftBuiltIn - rightBuiltIn;
        return getProviderDisplayName(left).localeCompare(getProviderDisplayName(right));
      });

    const grid = section.createDiv({ cls: "notepack-settings-grid notepack-settings-provider-grid" });

    providers.forEach((provider) => {
      const providerModels = getModelsForProvider(settings, provider.id);
      const baseUrl = resolveProviderBaseUrl(provider);
      const card = grid.createDiv({ cls: "notepack-settings-card notepack-settings-provider-card" });

      card.createEl("h4", { text: getProviderDisplayName(provider) });
      card.createEl("p", {
        text: getProviderConnectionSummary(provider),
        cls: "notepack-settings-card-status",
      });
      card.createEl("p", { text: `${t("settingsModelsCount")}: ${providerModels.length}` });
      if (baseUrl) {
        const baseUrlEl = card.createEl("p", {
          text: `${t("settingsBaseUrl")}: ${baseUrl}`,
          cls: "notepack-settings-card-baseurl",
        });
        baseUrlEl.setAttr("title", baseUrl);
      }

      const actions = card.createDiv({ cls: "notepack-settings-card-actions" });
      actions.createEl("button", { text: t("settingsEditBtn") }).addEventListener("click", () => {
        new ProviderModal(
          this.app,
          provider,
          this.plugin.settingsStore.settings.providers.map((item) => item.id),
          [provider.type],
          this.plugin.settingsStore.settings.chatModels,
          (updatedProvider, stagedModels) => {
            this.persistProviderWithModels(updatedProvider, stagedModels);
          },
        ).open();
      });

      if (!isBuiltInProvider(provider)) {
        actions.createEl("button", { text: t("settingsDeleteBtn") }).addEventListener("click", () => {
          const linkedModels = getModelsForProvider(this.plugin.settingsStore.settings, provider.id);
          const confirmed = window.confirm(
            `${t("settingsConfirmDeleteProvider")}\n"${provider.id}" → ${linkedModels.length}`,
          );
          if (!confirmed) return;
          this.saveSettings(removeProvider(this.plugin.settingsStore.settings, provider.id));
        });
      }
    });
  }

  private renderAnnotationSection(containerEl: HTMLElement, settings: AISettings): void {
    const section = containerEl.createDiv({ cls: "notepack-settings-section" });
    section.createEl("h3", { text: t("settingsAnnotationAgentsHeading") });
    section.createEl("p", { text: t("settingsAnnotationAgentsDesc") });

    const agents = normalizeAnnotationAgents(settings.annotationAgents, settings.activeChatModelId, {
      withDefaults: true,
    });
    const modelOptions = [...settings.chatModels].sort((left, right) => left.label.localeCompare(right.label));
    const filledAgentsCount = agents.filter((agent) => Boolean(agent.customInstruction?.trim())).length;
    const forceSingleMode = filledAgentsCount <= 1;
    const effectiveMode: AnnotationMode = forceSingleMode ? "single" : settings.annotationMode;

    const saveAgents = (next: AnnotationAgentReference[]): void => {
      this.plugin.settingsStore.updateSettings({
        ...this.plugin.settingsStore.settings,
        annotationAgents: next,
      });
    };

    const saveAgent = (agentId: string, patch: Partial<AnnotationAgentReference>): void => {
      const current = normalizeAnnotationAgents(
        this.plugin.settingsStore.settings.annotationAgents,
        this.plugin.settingsStore.settings.activeChatModelId,
        { withDefaults: true },
      );
      const next = current.map((agent) => agent.id === agentId ? { ...agent, ...patch } : agent);
      saveAgents(next);
    };

    const modeSetting = new Setting(section)
      .setName(t("settingsAnnotationMode"))
      .setDesc(forceSingleMode ? t("settingsModeForcedSingleNote") : t("settingsAnnotationModeDesc"))
      .addDropdown((dropdown) => {
        dropdown.addOptions({
          single: t("settingsAnnotationModeSingle"),
          parallel: t("settingsAnnotationModeParallel"),
          sequential: t("settingsAnnotationModeSequential"),
        });
        dropdown.setValue(effectiveMode);
        dropdown.setDisabled(forceSingleMode);
        dropdown.onChange((value) => {
          this.saveSettings({
            ...this.plugin.settingsStore.settings,
            annotationMode: value as AnnotationMode,
          });
        });
      });
    void modeSetting;

    new Setting(section)
      .setName(t("settingsAiAnnotationLanguage"))
      .setDesc(t("settingsAiAnnotationLanguageDesc"))
      .addDropdown((dropdown) => {
        addLanguageOptions(dropdown);
        dropdown.setValue(languageModeToSettingValue(settings.annotationLanguageMode, settings.fixedAnnotationLanguage));
        dropdown.onChange((value) => {
          const parsed = settingValueToLanguageMode(value);
          this.saveSettings({
            ...this.plugin.settingsStore.settings,
            annotationLanguageMode: parsed.mode ?? "auto-source",
            fixedAnnotationLanguage: parsed.fixedLanguage,
          });
        });
      });

    new Setting(section)
      .setName(t("settingsAiPackLanguage"))
      .setDesc(t("settingsAiPackLanguageDesc"))
      .addDropdown((dropdown) => {
        addLanguageOptions(dropdown);
        dropdown.setValue(languageModeToSettingValue(settings.packLanguageMode, settings.fixedPackLanguage));
        dropdown.onChange((value) => {
          const parsed = settingValueToLanguageMode(value);
          this.saveSettings({
            ...this.plugin.settingsStore.settings,
            packLanguageMode: parsed.mode ?? "auto-source",
            fixedPackLanguage: parsed.fixedLanguage,
          });
        });
      });

    if (this.activePersonaTab >= agents.length) {
      this.activePersonaTab = Math.max(0, agents.length - 1);
    }

    const tabStrip = section.createDiv({ cls: "notepack-settings-persona-tabs" });
    agents.forEach((agent, index) => {
      const tabBtn = tabStrip.createEl("button", {
        text: `${t("settingsAgentLabelPrefix")} ${index + 1}`,
        cls: "notepack-settings-persona-tab",
      });
      const isEmpty = !agent.customInstruction?.trim();
      if (isEmpty && agents.length > 1) {
        tabBtn.addClass("notepack-settings-persona-tab--empty");
      }
      if (index === this.activePersonaTab) {
        tabBtn.addClass("notepack-settings-persona-tab--active");
      }
      tabBtn.addEventListener("click", () => {
        if (this.activePersonaTab === index) return;
        this.activePersonaTab = index;
        this.display();
      });
    });

    if (agents.length < MAX_ANNOTATION_AGENTS) {
      const addBtn = tabStrip.createEl("button", {
        text: t("settingsAddAgent"),
        cls: "notepack-settings-persona-tab notepack-settings-persona-tab-add",
      });
      addBtn.addEventListener("click", () => {
        const current = normalizeAnnotationAgents(
          this.plugin.settingsStore.settings.annotationAgents,
          this.plugin.settingsStore.settings.activeChatModelId,
          { withDefaults: true },
        );
        if (current.length >= MAX_ANNOTATION_AGENTS) return;
        const usedIds = new Set(current.map((agent) => agent.id));
        let nextIndex = current.length + 1;
        let nextId = `agent-${nextIndex}`;
        while (usedIds.has(nextId)) {
          nextIndex += 1;
          nextId = `agent-${nextIndex}`;
        }
        const nextOrder = current.length > 0 ? Math.max(...current.map((agent) => agent.order)) + 1 : 1;
        const newAgent: AnnotationAgentReference = {
          id: nextId,
          label: `AI ${current.length + 1}`,
          modelId: this.plugin.settingsStore.settings.activeChatModelId,
          customInstruction: undefined,
          order: nextOrder,
        };
        saveAgents([...current, newAgent]);
        this.activePersonaTab = current.length;
        this.display();
      });
    }

    const activeAgent = agents[this.activePersonaTab];
    if (!activeAgent) return;

    const card = section.createDiv({ cls: "notepack-settings-card notepack-settings-agent-card notepack-settings-agent-card--active" });
    const cardHeader = card.createDiv({ cls: "notepack-settings-agent-card-header" });
    const headerTitle = activeAgent.label && activeAgent.label !== `AI ${this.activePersonaTab + 1}`
      ? `${t("settingsAgentLabelPrefix")} ${this.activePersonaTab + 1}: ${activeAgent.label}`
      : `${t("settingsAgentLabelPrefix")} ${this.activePersonaTab + 1}`;
    cardHeader.createEl("h4", { text: headerTitle });

    if (agents.length > 1) {
      const removeBtn = cardHeader.createEl("button", {
        text: t("settingsRemoveAgent"),
        cls: "notepack-settings-persona-remove-button",
      });
      removeBtn.addEventListener("click", () => {
        const current = normalizeAnnotationAgents(
          this.plugin.settingsStore.settings.annotationAgents,
          this.plugin.settingsStore.settings.activeChatModelId,
          { withDefaults: true },
        );
        if (current.length <= 1) return;
        const next = current.filter((agent) => agent.id !== activeAgent.id).map((agent, idx) => ({
          ...agent,
          order: idx + 1,
        }));
        saveAgents(next);
        this.activePersonaTab = Math.min(this.activePersonaTab, next.length - 1);
        this.display();
      });
    }

    const activeIsEmpty = !activeAgent.customInstruction?.trim();
    if (activeIsEmpty && agents.length > 1) {
      const warning = card.createDiv({ cls: "notepack-settings-persona-warning" });
      warning.setText(t("settingsAgentMissingInstructionWarning"));
    }

    new Setting(card)
      .setName(t("settingsAgentName"))
      .setDesc(t("settingsAgentNameDesc"))
      .addText((text) => {
        const isLegacyName = activeAgent.label === `AI ${this.activePersonaTab + 1}`;
        text.setPlaceholder(t("settingsAgentNamePlaceholder"));
        text.setValue(isLegacyName ? "" : activeAgent.label);
        text.onChange((value) => {
          const trimmed = value.trim();
          saveAgent(activeAgent.id, { label: trimmed || `AI ${this.activePersonaTab + 1}` });
        });
      });

    new Setting(card)
      .setName(t("settingsAgentIcon"))
      .setDesc(t("settingsAgentIconDesc"))
      .addText((text) => {
        text.setPlaceholder(t("settingsAgentIconPlaceholder"));
        text.setValue(activeAgent.icon ?? "");
        text.inputEl.maxLength = 4;
        text.inputEl.style.width = "5em";
        text.onChange((value) => {
          const trimmed = value.trim();
          const clipped = trimmed ? Array.from(trimmed).slice(0, 2).join("") : undefined;
          saveAgent(activeAgent.id, { icon: clipped });
        });
      });

    new Setting(card)
      .setName(t("settingsAgentColor"))
      .setDesc(t("settingsAgentColorDesc"))
      .then((setting) => {
        const colorWrap = setting.controlEl.createDiv({ cls: "notepack-settings-color-control" });
        const colorPicker = colorWrap.createEl("input", {
          attr: { type: "color" },
          cls: "notepack-settings-color-input",
        });
        colorPicker.value = activeAgent.color ?? "#155eef";
        const hexInput = colorWrap.createEl("input", {
          attr: { type: "text", maxLength: "7" },
          cls: "notepack-settings-color-hex",
        });
        hexInput.placeholder = "#155eef";
        hexInput.value = activeAgent.color ?? "";
        const resetBtn = colorWrap.createEl("button", {
          text: t("settingsAgentColorReset"),
          cls: "notepack-settings-color-reset",
        });
        const commitColor = (raw: string): void => {
          const trimmed = raw.trim().toLowerCase();
          if (!trimmed) {
            saveAgent(activeAgent.id, { color: undefined });
            return;
          }
          if (/^#[0-9a-f]{6}$/.test(trimmed)) {
            saveAgent(activeAgent.id, { color: trimmed });
          } else if (/^#[0-9a-f]{3}$/.test(trimmed)) {
            const expanded = `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
            saveAgent(activeAgent.id, { color: expanded });
          }
        };
        colorPicker.addEventListener("input", () => {
          hexInput.value = colorPicker.value;
          commitColor(colorPicker.value);
        });
        hexInput.addEventListener("change", () => {
          commitColor(hexInput.value);
        });
        resetBtn.addEventListener("click", () => {
          saveAgent(activeAgent.id, { color: undefined });
          this.display();
        });
      });

    new Setting(card)
      .setName(t("settingsAgentModel"))
      .setDesc(t("settingsAgentModelDesc"))
      .addDropdown((dropdown) => {
        modelOptions.forEach((model) => {
          const provider = settings.providers.find((item) => item.id === model.providerId);
          const providerLabel = provider ? getProviderDisplayName(provider) : model.providerId;
          dropdown.addOption(model.id, `${model.label} | ${providerLabel}`);
        });
        dropdown.setValue(activeAgent.modelId || settings.activeChatModelId);
        dropdown.onChange((value) => {
          saveAgent(activeAgent.id, { modelId: value });
        });
      });

    new Setting(card)
      .setName(t("settingsAgentLanguageOverride"))
      .setDesc(t("settingsAgentLanguageOverrideDesc"))
      .addDropdown((dropdown) => {
        addLanguageOptions(dropdown, true);
        dropdown.setValue(languageModeToSettingValue(activeAgent.outputLanguageMode, activeAgent.fixedOutputLanguage));
        dropdown.onChange((value) => {
          const parsed = settingValueToLanguageMode(value);
          saveAgent(activeAgent.id, {
            outputLanguageMode: parsed.mode,
            fixedOutputLanguage: parsed.fixedLanguage,
          });
        });
      });

    const presetsBlock = card.createDiv({ cls: "notepack-settings-persona-presets" });
    presetsBlock.createEl("h5", { text: t("settingsPersonaPresetsHeading") });
    presetsBlock.createEl("p", { text: t("settingsPersonaPresetsDesc"), cls: "notepack-settings-persona-presets-desc" });
    const presetGrid = presetsBlock.createDiv({ cls: "notepack-settings-persona-preset-grid" });
    PERSONA_PRESET_ENTRIES.forEach((entry) => {
      const button = presetGrid.createEl("button", {
        text: entry.label,
        cls: "notepack-settings-persona-preset-button",
      });
      button.addEventListener("click", () => {
        saveAgent(activeAgent.id, {
          customInstruction: entry.body,
          label: entry.personName,
          icon: entry.defaultIcon,
          color: entry.defaultColor,
        });
        this.display();
      });
    });

    new Setting(card)
      .setName(t("settingsAgentCustomInstruction"))
      .setDesc(t("settingsAgentCustomInstructionDesc"))
      .addTextArea((text) => {
        text
          .setPlaceholder(t("settingsAgentCustomInstructionPlaceholder"))
          .setValue(activeAgent.customInstruction ?? "")
          .onChange((value) => {
            saveAgent(activeAgent.id, { customInstruction: value.trim() || undefined });
          });
        text.inputEl.addClass("notepack-settings-persona-custom-instruction");
        text.inputEl.rows = 12;
      });
  }

  private renderWebGroundingSection(containerEl: HTMLElement, settings: AISettings): void {
    const section = containerEl.createDiv({ cls: "notepack-settings-section" });
    section.createEl("h3", { text: t("settingsWebGroundingHeading") });

    const resolved = resolveActiveChatModel(settings);
    const groundingSupported = Boolean(resolved?.model.supportsGrounding);

    new Setting(section)
      .setName(t("settingsWebGroundingName"))
      .setDesc(
        groundingSupported
          ? t("settingsWebGroundingEnabledDesc")
          : t("settingsWebGroundingNotSupportedDesc"),
      )
      .addToggle((toggle) => {
        toggle.setValue(settings.webGrounding);
        toggle.setDisabled(!groundingSupported);
        toggle.onChange((value) => {
          this.saveSettings({ ...this.plugin.settingsStore.settings, webGrounding: value });
        });
      });
  }

  private renderPersonaTuningSection(containerEl: HTMLElement, settings: AISettings): void {
    const section = containerEl.createDiv({ cls: "notepack-settings-section" });
    section.createEl("h3", { text: t("settingsGenerationBehaviorHeading") });
    section.createEl("p", { text: t("settingsGenerationBehaviorDesc") });

    new Setting(section)
      .setName(t("settingsAnnotationMaxSentences"))
      .setDesc(t("settingsAnnotationMaxSentencesDesc"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = "10";
        text.inputEl.step = "1";
        text.inputEl.style.width = "5em";
        text.setValue(String(settings.annotationMaxSentences ?? 4));
        text.onChange((value) => {
          const parsed = Math.max(1, Math.min(10, Math.round(Number(value) || 4)));
          this.saveSettings({
            ...this.plugin.settingsStore.settings,
            annotationMaxSentences: parsed,
          });
        });
      });
    section.createEl("p", {
      cls: "notepack-settings-inline-warning",
      text: t("settingsAnnotationMaxSentencesWarning"),
    });

    new Setting(section)
      .setName(t("settingsCardExploration"))
      .setDesc(t("settingsCardExplorationDesc"))
      .addDropdown((dropdown) => {
        for (let exploration = 0; exploration <= 5; exploration += 1) {
          dropdown.addOption(String(exploration), String(exploration));
        }
        dropdown.setValue(String(settings.packExploration));
        dropdown.onChange((value) => {
          this.saveSettings({ ...this.plugin.settingsStore.settings, packExploration: Number(value) });
        });
      });

    new Setting(section)
      .setName(t("settingsPackPity"))
      .setDesc(t("settingsPackPityDesc"))
      .addToggle((toggle) => {
        toggle.setValue(settings.packPityEnabled).onChange((value) => {
          this.saveSettings({ ...this.plugin.settingsStore.settings, packPityEnabled: value });
        });
      });
  }

  private renderVaultPathSection(containerEl: HTMLElement, settings: AISettings): void {
    const section = containerEl.createDiv({ cls: "notepack-settings-section" });
    section.createEl("h3", { text: t("settingsVaultFoldersHeading") });

    new Setting(section)
      .setName(t("settingsPromotionFolderName"))
      .setDesc(t("settingsPromotionFolderDesc"))
      .addText((text) => {
        text.setPlaceholder("Cards").setValue(settings.promotionFolder).onChange((value) => {
          this.saveSettings({ ...this.plugin.settingsStore.settings, promotionFolder: value.trim() || "Cards" });
        });
      });

    new Setting(section)
      .setName(t("settingsNoteAuthorName"))
      .setDesc(t("settingsNoteAuthorDesc"))
      .addText((text) => {
        text
          .setPlaceholder(this.app.vault.getName())
          .setValue(settings.noteAuthor ?? "")
          .onChange((value) => {
            this.saveSettings({ ...this.plugin.settingsStore.settings, noteAuthor: value });
          });
      });

    new Setting(section)
      .setName(t("settingsWorkbenchFolderName"))
      .setDesc(t("settingsWorkbenchFolderDesc"))
      .addText((text) => {
        text
          .setPlaceholder("NotePack CODEX")
          .setValue(this.plugin.settingsStore.defaultWorkbenchFolder)
          .onChange((value) => {
            this.plugin.settingsStore.setDefaultWorkbenchFolder(value.trim() || "NotePack CODEX");
          });
      });
  }

  private renderCardDifficultyTab(containerEl: HTMLElement, settings: AISettings): void {
    const header = containerEl.createDiv({ cls: "notepack-settings-section" });
    header.createEl("h3", { text: t("settingsCardDifficultyHeading") });
    header.createEl("p", {
      cls: "notepack-settings-difficulty-isolation",
      text: t("settingsCardDifficultyIsolationNote"),
    });

    this.renderDifficultyPromptSection(
      containerEl,
      t("settingsPackDifficultySection"),
      PACK_DIFFICULTY_PRESETS,
      settings.customPackDifficultyPrompt ?? "",
      (value) => {
        this.saveSettings({
          ...this.plugin.settingsStore.settings,
          customPackDifficultyPrompt: value,
        });
      },
    );

    this.renderDifficultyPromptSection(
      containerEl,
      t("settingsSynthesisDifficultySection"),
      SYNTHESIS_DIFFICULTY_PRESETS,
      settings.customSynthesisPrompt ?? "",
      (value) => {
        this.saveSettings({
          ...this.plugin.settingsStore.settings,
          customSynthesisPrompt: value,
        });
      },
    );
  }

  private renderDifficultyPromptSection(
    containerEl: HTMLElement,
    sectionTitle: string,
    presets: DifficultyPresetEntry[],
    currentValue: string,
    onSave: (value: string) => void,
  ): void {
    const section = containerEl.createDiv({ cls: "notepack-settings-section notepack-settings-difficulty-section" });
    section.createEl("h4", { text: sectionTitle });

    const presetsBlock = section.createDiv({ cls: "notepack-settings-persona-presets" });
    presetsBlock.createEl("h5", { text: t("settingsDifficultyPresetsLabel") });
    presetsBlock.createEl("p", {
      text: t("settingsDifficultyPresetHint"),
      cls: "notepack-settings-persona-presets-desc",
    });
    const presetGrid = presetsBlock.createDiv({ cls: "notepack-settings-persona-preset-grid" });
    presets.forEach((entry) => {
      const button = presetGrid.createEl("button", {
        text: entry.label,
        cls: "notepack-settings-persona-preset-button",
      });
      if (currentValue.trim() === entry.body.trim()) {
        button.addClass("notepack-settings-persona-preset-button--active");
      }
      button.addEventListener("click", () => {
        onSave(entry.body);
      });
    });

    new Setting(section)
      .setName(t("settingsDifficultyCustomLabel"))
      .setDesc(t("settingsDifficultyCustomDesc"))
      .addTextArea((text) => {
        text
          .setPlaceholder(presets[0]?.body ?? "")
          .setValue(currentValue)
          .onChange((value) => {
            onSave(value);
          });
        text.inputEl.addClass("notepack-settings-persona-custom-instruction");
        text.inputEl.rows = 16;
      });

    new Setting(section)
      .addButton((button) => {
        button.setButtonText(t("settingsDifficultyReset")).onClick(() => {
          onSave("");
        });
      });
  }

  private renderUiLanguageSection(containerEl: HTMLElement, settings: AISettings): void {
    const section = containerEl.createDiv({ cls: "notepack-settings-section" });
    section.createEl("h3", { text: t("settingsInterfaceHeading") });

    new Setting(section)
      .setName(t("settingsInterfaceLanguageName"))
      .setDesc(t("settingsInterfaceLanguageDesc"))
      .addDropdown((dropdown) => {
        dropdown.addOptions({ ko: t("settingsLanguageKorean"), en: t("settingsLanguageEnglish") });
        dropdown.setValue(settings.uiLanguage);
        dropdown.onChange((value) => {
          this.saveSettings({ ...this.plugin.settingsStore.settings, uiLanguage: value as "ko" | "en" });
        });
      });
  }

  private renderMaintenanceSection(containerEl: HTMLElement, _settings: AISettings): void {
    const section = containerEl.createDiv({ cls: "notepack-settings-section" });
    section.createEl("h3", { text: t("settingsLegacyMigrationHeading") });

    const migration = this.plugin.settingsStore.getData().legacyMigration;
    new Setting(section)
      .setName(t("settingsMigrateInternal"))
      .setDesc(
        migration.status === "completed"
          ? `${t("settingsMigrateInternalCompletedDesc")}: ${migration.migratedPaths.length}`
          : t("settingsMigrateInternalIdleDesc"),
      )
      .addButton((button) => {
        button.setButtonText(t("settingsRunMigration")).onClick(() => {
          this.plugin.migrateLegacyProjects();
        });
      });
  }
}
