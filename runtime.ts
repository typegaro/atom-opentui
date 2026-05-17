import {
  BoxRenderable,
  CliRenderer,
  ScrollBoxRenderable,
  TextareaRenderable,
  SyntaxStyle,
  createCliRenderer
} from "@opentui/core";
import type { KeyEvent, PasteEvent, TextRenderable } from "@opentui/core";
import { SelectRenderableEvents } from "@opentui/core";
import { MessageRole } from "@typegaro/atom-plugin";
import type {
  ImagePart,
  PluginRunEvent,
  PluginRuntimeEvent,
  PluginSessionRuntime as BasePluginSessionRuntime,
  UserMessagePart
} from "@typegaro/atom-plugin";
import { SessionEventType, RuntimeEventType } from "@typegaro/atom-plugin";
import { createChatLayout } from "./components/chat-layout";
import { copyToClipboardFallback, readClipboardFallback, readClipboardImageFallback } from "./clipboard";
import {
  appendMessageText,
  createMarkdownMessageBox,
  createMessageBox,
  finalizeMarkdownStream,
  setLabelText,
  setMessageText,
  type MessageView
} from "./components/message-box";
import { createPickerView, type PickerView, type PickerViewOptions } from "./components/picker";
import { COMMAND_HELP_TEXT, getCommandSuggestion, parseCommand } from "./commands";
import type { DiffLine } from "./diff";
import { buildUserInput, createImagePart, formatSubmittedUserInput, stripImageInputMarkers } from "./input-parts";
import type { PickerItem } from "./picker-items";
import { rankPickerItems } from "./picker-items";
import {
  extractToolCalls,
  formatToolArguments,
  renderAssistantText,
  renderAssistantThinking,
  renderToolMessage,
  renderUserMessage
} from "./formatters";
import { COLORS, SPINNER_FRAMES, SYNTAX_STYLES } from "./theme";
import { addDiffMessageBox as createDiffMessageBox } from "./components/diff-message";
import { addStartupMessage as createStartupMessage, type SystemPromptShard } from "./components/startup";
import { formatStatus } from "./status";
import { formatSystemMessage } from "./system-message";
import { formatTaskPanelUpdate, type TaskUpdateEvent } from "./task-event";
import type { SessionEvent, UsageSnapshot } from "./types";

export interface OpenTuiChannelOptions {
  modelId?: string;
}

interface ActivePicker<TValue> {
  view: PickerView;
  items: PickerItem<TValue>[];
  onSelect: (item: PickerItem<TValue>) => void | Promise<void>;
}

type PluginSessionRuntime = BasePluginSessionRuntime<"models" | "sessions"> & {
  getActiveSystemPrompt?(): string | undefined;
  getActiveSystemPromptShards?(): SystemPromptShard[];
  resetSession?(): Promise<void>;
  ready?(): Promise<void>;
};

export class OpenTuiChatRuntime {
  private readonly renderer: CliRenderer;
  private readonly session: PluginSessionRuntime;
  private readonly root: BoxRenderable;
  private readonly footer: BoxRenderable;
  private readonly transcript: ScrollBoxRenderable;
  private readonly input: TextareaRenderable;
  private readonly statusText: TextRenderable;
  private readonly suggestionText: TextRenderable;
  private readonly taskPanel: BoxRenderable;
  private readonly taskTitleText: TextRenderable;
  private readonly taskBodyText: TextRenderable;
  private readonly syntaxStyle: SyntaxStyle;
  private readonly pendingTools = new Map<string, { view: MessageView; baseTitle: string; argsText: string }>();
  private activePicker: ActivePicker<string> | undefined;
  private thinkingMessage: MessageView | undefined;
  private assistantMessage: MessageView | undefined;
  private isRunning = false;
  private spinnerFrame = 0;
  private animationTimer: ReturnType<typeof setInterval> | undefined;
  private currentUsage: UsageSnapshot = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  private currentSessionId: string | undefined;
  private pendingImages: ImagePart[] = [];
  private transcriptCwd = process.cwd();
  private readonly unsubscribe: () => void;
  private readonly pendingRuns = new Map<string, () => void>();

  constructor(renderer: CliRenderer, session: PluginSessionRuntime) {
    this.renderer = renderer;
    this.session = session;
    this.syntaxStyle = SyntaxStyle.fromStyles(SYNTAX_STYLES);
    const layout = createChatLayout(renderer, COLORS);
    this.root = layout.root;
    this.footer = layout.footer;
    this.transcript = layout.transcript;
    this.input = layout.input;
    this.statusText = layout.statusText;
    this.suggestionText = layout.suggestionText;
    this.taskPanel = layout.taskPanel;
    this.taskTitleText = layout.taskTitleText;
    this.taskBodyText = layout.taskBodyText;

    this.input.onContentChange = () => {
      this.updateSuggestion(this.input.plainText);
    };

    this.input.onPaste = (event: PasteEvent) => {
      if (this.handleImagePaste(event)) return;
    };

    this.unsubscribe = this.session.subscribe((event) => {
      this.applyRuntimeEvent(event);
    });
  }

  static async create(session: PluginSessionRuntime): Promise<OpenTuiChatRuntime> {
    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      clearOnShutdown: true,
      useMouse: true,
      openConsoleOnError: true
    });

    const runtime = new OpenTuiChatRuntime(renderer, session);
    runtime.installKeyBindings();
    runtime.input.focus();
    runtime.startAnimationLoop();
    if (typeof session.ready === "function") {
      await session.ready();
    }
    runtime.refreshStatus();
    runtime.addStartupMessage();
    return runtime;
  }

  async destroy(exitCode = 0): Promise<never> {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = undefined;
    }

    this.unsubscribe();
    this.renderer.destroy();
    process.exit(exitCode);
  }

  private installKeyBindings(): void {
    this.renderer.keyInput.on("keypress", (key: KeyEvent) => {
      if (key.ctrl && key.name === "c") {
        if (this.renderer.hasSelection) {
          const copied = this.handleSelectionCopied();
          if (copied) {
            key.preventDefault();
            return;
          }
        }

        if (this.input.plainText.length > 0) {
          this.input.clear();
          this.updateSuggestion("");
          this.setStatusMessage("Cleared input.");
          key.preventDefault();
          return;
        }

        if (this.isRunning) {
          this.session.interrupt();
          key.preventDefault();
          return;
        }

        void this.destroy(0);
        return;
      }

      if (this.activePicker) {
        this.handleActivePickerKeypress(key);
        return;
      }

      if (this.isPasteShortcut(key)) {
        key.preventDefault();
        void this.pasteFromSystemClipboard();
        return;
      }

      if (key.name === "escape" && this.pendingImages.length > 0) {
        this.pendingImages = [];
        this.refreshStatus();
        this.setStatusMessage("Cleared image attachments.");
        key.preventDefault();
        return;
      }

      if (key.name === "tab") {
        const suggestion = getCommandSuggestion(this.input.plainText);
        if (suggestion) {
          key.preventDefault();
          this.input.setText(suggestion);
          this.input.cursorOffset = suggestion.length;
          this.updateSuggestion(suggestion);
        }
        return;
      }

      if (key.name === "linefeed") {
        key.preventDefault();
        this.input.newLine();
        return;
      }

      if (key.name === "return" && !key.meta && !key.ctrl) {
        key.preventDefault();
        void this.handleSubmit(this.input.plainText.trim());
        return;
      }

      if (key.name === "pageup") {
        this.transcript.scrollBy(-1, "viewport");
        return;
      }

      if (key.name === "pagedown") {
        this.transcript.scrollBy(1, "viewport");
        return;
      }

      if (key.name === "home") {
        this.transcript.scrollTo(0);
        return;
      }

      if (key.name === "end") {
        this.transcript.scrollTo({ x: 0, y: this.transcript.scrollHeight });
      }
    });
  }

  private isPasteShortcut(key: KeyEvent): boolean {
    return key.name === "v" && key.ctrl && key.shift;
  }

  private async pasteFromSystemClipboard(): Promise<void> {
    const text = await readClipboardFallback();
    if (text) {
      this.input.insertText(text);
      this.updateSuggestion(this.input.plainText);
      this.input.focus();
      return;
    }

    const image = await readClipboardImageFallback();
    if (image) {
      this.attachImage(image.mimeType, image.bytes);
      this.input.focus();
      return;
    }

    this.setStatusMessage("Clipboard has no text or supported image.");
  }

  private handleSelectionCopied(selection = this.renderer.getSelection()): boolean {
    const selectedText = selection?.getSelectedText().trimEnd() ?? "";
    if (!selectedText) {
      return false;
    }

    this.setStatusMessage("Copying selection...");
    void copyToClipboardFallback(selectedText).then((fallbackCopied) => {
      if (fallbackCopied) {
        this.completeSelectionCopy(selectedText, "native clipboard");
        return;
      }

      const copied = this.renderer.copyToClipboardOSC52(selectedText);
      if (copied) {
        this.completeSelectionCopy(selectedText, "terminal clipboard");
        return;
      }

      this.setStatusMessage("Selection available, but clipboard copy is not supported by this terminal.");
    });

    return true;
  }

  private completeSelectionCopy(selectedText: string, method: string): void {
    this.renderer.clearSelection();
    this.setStatusMessage(`Copied selection (${selectedText.length} chars) via ${method}.`);
  }

  private handleActivePickerKeypress(key: KeyEvent): void {
    if (!this.activePicker) {
      return;
    }

    key.preventDefault();

    if (key.name === "escape") {
      this.closePicker();
      return;
    }

    if (key.name === "enter" || key.name === "return") {
      this.activePicker.view.select.selectCurrent();
      return;
    }

    if (key.name === "up") {
      this.activePicker.view.select.moveUp();
      this.renderer.requestRender();
      return;
    }

    if (key.name === "down") {
      this.activePicker.view.select.moveDown();
      this.renderer.requestRender();
      return;
    }

    if (key.name === "pageup") {
      this.activePicker.view.select.moveUp(5);
      this.renderer.requestRender();
      return;
    }

    if (key.name === "pagedown") {
      this.activePicker.view.select.moveDown(5);
      this.renderer.requestRender();
      return;
    }

    if (key.name === "backspace") {
      this.activePicker.view.input.value = this.activePicker.view.input.value.slice(0, -1);
      this.refreshPickerOptions();
      this.renderer.requestRender();
      return;
    }

    if (key.sequence.length > 0 && key.sequence.charCodeAt(0) >= 32 && !key.ctrl && !key.meta) {
      this.activePicker.view.input.value += key.sequence;
      this.refreshPickerOptions();
      this.renderer.requestRender();
    }
  }

  private startAnimationLoop(): void {
    this.animationTimer = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
      const frame = SPINNER_FRAMES[this.spinnerFrame] ?? ".";

      if (this.thinkingMessage) {
        setLabelText(this.thinkingMessage, `Thinking ${frame}`);
      }

      for (const tool of this.pendingTools.values()) {
        const indicator = tool.view.collapsed ? "▶" : "▼";
        tool.view.label.content = `${indicator} ${tool.baseTitle} ${frame}`;
        tool.view.baseLabel = tool.baseTitle;
      }

      if (this.thinkingMessage || this.pendingTools.size > 0) {
        this.renderer.requestRender();
      }
    }, 120);
  }

  private async handleSubmit(value: string): Promise<void> {
    const images = this.pendingImages.splice(0);
    const submittedValue = images.length > 0 ? stripImageInputMarkers(value) : value.trim();
    this.input.clear();
    this.updateSuggestion("");
    this.refreshStatus();

    if (!submittedValue && images.length === 0) {
      return;
    }

    if (this.isRunning) {
      this.pendingImages.unshift(...images);
      this.refreshStatus();
      this.addSystemMessage("busy", "wait for the current run to finish or press Ctrl+C to interrupt");
      return;
    }

    if (images.length === 0 && await this.handleCommand(submittedValue)) {
      this.input.focus();
      return;
    }

    const input = buildUserInput(submittedValue, images);
    this.currentSessionId = undefined;
    this.addUserMessage(formatSubmittedUserInput(submittedValue, images));
    await this.streamPrompt(input);
    this.input.focus();
  }

  private handleImagePaste(event: PasteEvent): boolean {
    const mimeType = event.metadata?.mimeType;
    if (!mimeType?.startsWith("image/")) {
      return false;
    }

    if (event.bytes.length === 0) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    this.attachImage(mimeType, Buffer.from(event.bytes));
    return true;
  }

  private attachImage(mimeType: string, bytes: Buffer): void {
    this.pendingImages.push(createImagePart(mimeType, bytes));
    this.insertImageMarker(this.pendingImages.length);
    this.setStatusMessage(`${this.pendingImages.length} image${this.pendingImages.length === 1 ? "" : "s"} attached`);
    this.refreshStatus();
  }

  private insertImageMarker(index: number): void {
    const marker = `[Image ${index}]`;
    const current = this.input.plainText;
    const prefix = current.length > 0 && !/\s$/.test(current) ? " " : "";
    this.input.insertText(`${prefix}${marker} `);
    this.updateSuggestion(this.input.plainText);
    this.input.focus();
  }

  private async handleCommand(value: string): Promise<boolean> {
    if (!value.startsWith("/")) {
      return false;
    }

    const { name, arg } = parseCommand(value) ?? { name: "", arg: "" };

    switch (name) {
      case "help":
        this.addSystemMessage("commands", COMMAND_HELP_TEXT);
        return true;
      case "clear":
        this.clearTranscript();
        this.addSystemMessage("cleared", "transcript");
        return true;
      case "undo":
        await this.streamInputEvent({ type: "undo" });
        return true;
      case "new":
        await this.newSession();
        return true;
      case "models":
        this.openModelPicker();
        return true;
      case "model":
        if (!arg) {
          this.addSystemMessage("usage", "/model <id>");
          return true;
        }
        this.switchModel(arg);
        return true;
      case "sessions":
        this.openSessionPicker();
        return true;
      case "session":
        if (!arg) {
          this.addSystemMessage("usage", "/session <id>");
          return true;
        }
        await this.loadSession(arg);
        return true;
      default:
        this.addSystemMessage("unknown command", `${value} — type /help`);
        return true;
    }
  }

  private async streamPrompt(value: string | UserMessagePart[]): Promise<void> {
    await this.streamSubmission(value);
  }

  private async streamInputEvent(event: { type: string }): Promise<void> {
    await this.streamSubmission(event);
  }

  private async streamSubmission(input: string | UserMessagePart[] | { type: string }): Promise<void> {
    this.isRunning = true;
    this.refreshStatus();

    try {
      let resolveCompletion!: () => void;
      const completion = new Promise<void>((resolve) => {
        resolveCompletion = resolve;
      });
      const { runId } = await this.session.submit(input);
      this.pendingRuns.set(runId, resolveCompletion);
      await completion;
    } finally {
      this.isRunning = false;
      if (this.assistantMessage) {
        finalizeMarkdownStream(this.assistantMessage);
        this.assistantMessage = undefined;
      }
      this.thinkingMessage = undefined;
      this.pendingTools.clear();
      this.currentUsage = this.session.getTotalUsage();
      this.refreshStatus();
    }
  }

  private applyRuntimeEvent(event: PluginRuntimeEvent): void {
    this.applyStreamEvent(event);

    if (
      event.type === RuntimeEventType.Done
      || event.type === RuntimeEventType.Error
      || event.type === RuntimeEventType.Interrupted
    ) {
      const resolve = this.pendingRuns.get(event.runId);
      if (resolve) {
        this.pendingRuns.delete(event.runId);
        resolve();
      }
    }
  }

  private applyStreamEvent(event: PluginRunEvent): void {
    if (event.type === RuntimeEventType.MessageStart) {
      if (this.assistantMessage) {
        finalizeMarkdownStream(this.assistantMessage);
        this.assistantMessage = undefined;
      }
      this.thinkingMessage = undefined;
      return;
    }

    if (event.type === RuntimeEventType.ThinkingDelta) {
      if (!this.thinkingMessage) {
        this.thinkingMessage = this.addThinkingMessageBox("Thinking");
      }

      appendMessageText(this.thinkingMessage, event.delta);
      this.renderStreamUpdate();
      return;
    }

    if (event.type === RuntimeEventType.TextDelta) {
      if (this.thinkingMessage) {
        setLabelText(this.thinkingMessage, "Thinking");
        finalizeMarkdownStream(this.thinkingMessage);
        this.thinkingMessage = undefined;
      }

      if (!this.assistantMessage) {
        this.assistantMessage = this.addMarkdownMessageBox("assistant", "", true);
      }

      appendMessageText(this.assistantMessage, event.delta);
      this.renderStreamUpdate();
      return;
    }

    if (event.type === RuntimeEventType.ToolRunStart) {
      const args = "arguments" in event && event.arguments && typeof event.arguments === "object"
        ? event.arguments as Record<string, unknown>
        : undefined;
      const argsText = formatToolArguments(args);
      const title = args ? event.name : this.formatToolEventLabel(event.name, event.label);
      const toolMessage = this.addMessageBox(title, "", COLORS.tool, true, false, COLORS.text, 0, "none", COLORS.toolBackground, true, argsText);
      toolMessage.box.marginBottom = 1;
      this.pendingTools.set(event.id, { view: toolMessage, baseTitle: title, argsText });
      return;
    }

    if (event.type === RuntimeEventType.ToolRunEnd) {
      const pending = this.pendingTools.get(event.id);
      const color = event.isError ? COLORS.danger : COLORS.success;
      const fallbackTitle = this.formatToolEventLabel(event.name, event.name);
      const toolMessage = pending?.view ?? this.addMessageBox(fallbackTitle, "", color, true, false, COLORS.text, 0, "none", COLORS.toolCompleteBackground, false);
      toolMessage.box.marginBottom = 1;
      const finalLabel = event.isError ? `${pending?.baseTitle ?? fallbackTitle} [error]` : (pending?.baseTitle ?? fallbackTitle);
      toolMessage.box.backgroundColor = event.isError ? COLORS.toolBackground : COLORS.toolCompleteBackground;
      toolMessage.label.fg = color;
      setLabelText(toolMessage, finalLabel);
      if (event.text) {
        setMessageText(toolMessage, event.text);
      }
      this.pendingTools.delete(event.id);
      this.renderStreamUpdate();
      return;
    }

    if (event.type === RuntimeEventType.FileEdit) {
      this.addDiffMessageBox(event.path, event.lines);
      return;
    }

    if (event.type === "task-update") {
      this.updateTaskMessage(event);
      return;
    }

    if (event.type === "undo-complete") {
      this.addSystemMessage("undo complete", `reverted ${String(event.revertedFiles ?? 0)} file(s)`);
      return;
    }

    if (event.type === RuntimeEventType.Error) {
      this.addErrorMessage(event.error);
      return;
    }

    if (event.type === RuntimeEventType.Interrupted) {
      this.addSystemMessage("agent paused");
      return;
    }

    if (event.type === RuntimeEventType.Done) {
      this.currentUsage = this.session.getTotalUsage();
      this.refreshStatus();
    }
  }

  private addUserMessage(text: string): void {
    const view = this.addMessageBox("user", text, COLORS.user, false, false, COLORS.user, 1, "word", COLORS.userBackground);
    view.box.marginBottom = 1;
    view.label.visible = false;
  }

  private addSystemMessage(title: string, body?: string, options: { fg?: string; bg?: string } = {}): void {
    const text = formatSystemMessage(title, body);
    const view = this.addMessageBox(text, "", options.fg ?? COLORS.borderSoft, false, options.bg === undefined, options.fg ?? COLORS.subtle, 0, "word", options.bg);
    view.label.attributes = 0;
  }

  private addModelSwitchMessage(modelId: string): void {
    this.addSystemMessage("model switched", modelId, { fg: COLORS.warning });
  }

  private addErrorMessage(message: string): void {
    this.addSystemMessage("error", message, { fg: COLORS.danger });
  }

  private addStartupMessage(): void {
    createStartupMessage({
      renderer: this.renderer,
      transcript: this.transcript,
      colors: COLORS,
      syntaxStyle: this.syntaxStyle,
      addMessageBox: this.addMessageBox.bind(this)
    }, this.session);
  }

  private addMessageBox(
    title: string,
    body: string,
    borderColor: string,
    collapsible = false,
    transparent = false,
    textColor = COLORS.text,
    paddingY = 1,
    wrapMode: "none" | "char" | "word" = "word",
    backgroundColor?: string,
    initiallyCollapsed = collapsible,
    headerBody?: string
  ): MessageView {
    return createMessageBox(this.renderer, this.transcript, title, body, borderColor, backgroundColor ?? (transparent ? undefined : COLORS.panel), textColor, COLORS.subtle, collapsible, paddingY, initiallyCollapsed, wrapMode, headerBody);
  }

  private addMarkdownMessageBox(title: string, body: string, streaming: boolean): MessageView {
    const view = createMarkdownMessageBox(this.renderer, this.transcript, title, body, COLORS.accent, undefined, COLORS.text, COLORS.subtle, this.syntaxStyle, streaming);
    view.label.visible = false;
    return view;
  }

  private addThinkingMessageBox(title: string): MessageView {
    return createMessageBox(this.renderer, this.transcript, title, "", COLORS.thinking, undefined, COLORS.thinking, COLORS.thinking, true, 1, false, "word");
  }

  private formatToolEventLabel(name: string, label: string): string {
    const normalized = label.length > 0 && label.toLowerCase().startsWith(name.toLowerCase())
      ? label.slice(name.length).trim()
      : label.trim();
    return normalized ? `${name} ${normalized}` : name;
  }

  private updateTaskMessage(event: TaskUpdateEvent): void {
    const update = formatTaskPanelUpdate(event);
    this.taskTitleText.content = update.title;
    this.taskBodyText.content = update.body;
    this.taskPanel.visible = update.visible;
    this.renderStreamUpdate();
  }

  private collapseView(view: MessageView): void {
    view.collapsed = true;
    if (view.markdown) view.markdown.visible = false;
    if (view.text) view.text.visible = false;
    view.label.content = `▶ ${view.baseLabel}`;
  }

  private addDiffMessageBox(path: string, lines: DiffLine[]): void {
    createDiffMessageBox(this.renderer, this.transcript, COLORS, path, lines);
  }

  private clearTranscript(): void {
    for (const child of this.transcript.getChildren()) {
      this.transcript.remove(child.id);
      child.destroyRecursively();
    }

    this.pendingTools.clear();
    this.pendingImages = [];
    this.thinkingMessage = undefined;
    this.taskPanel.visible = false;
    this.taskTitleText.content = "Task";
    this.taskBodyText.content = "";
    this.assistantMessage = undefined;
    this.refreshStatus();
  }

  private openModelPicker(): void {
    const active = this.session.getActiveModelId();
    const items = this.session.listModels().map((model) => ({
      name: model.id,
      value: model.id
    }));

    this.openPicker("Models", "Filter models", items, (item) => {
      this.switchModel(item.value);
    }, { showDescription: false });
  }

  private switchModel(modelId: string): void {
    try {
      this.session.switchModel(modelId);
      this.refreshStatus();
      this.addModelSwitchMessage(this.session.getActiveModelId() ?? modelId);
    } catch (error) {
      this.addErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  private openSessionPicker(): void {
    const sessions = this.session.listSessions();

    this.openPicker(
      "Sessions",
      "Filter sessions",
      sessions.map((session) => ({
        name: session.title,
        description: session.id,
        value: session.id
      })),
      async (item) => {
        await this.loadSession(item.value);
      }
    );
  }

  private async newSession(): Promise<void> {
    if (typeof this.session.resetSession !== "function") {
      this.addErrorMessage("Session reset is not supported by this Atom runtime");
      return;
    }

    try {
      await this.session.resetSession();
      this.currentSessionId = undefined;
      this.currentUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      this.clearTranscript();
      this.transcriptCwd = process.cwd();
      this.refreshStatus();
      this.addSystemMessage("new session");
      this.input.focus();
    } catch (error) {
      this.addErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  private async loadSession(sessionId: string): Promise<void> {
    const sessions = this.session.listSessions();
    const session = sessions.find((entry) => entry.id === sessionId);

    if (!session) {
      this.addSystemMessage("unknown session", sessionId);
      return;
    }

    const events = this.session.loadSession(sessionId);
    this.currentSessionId = sessionId;
    this.clearTranscript();
    this.replaySession(events, sessionId);
    this.refreshStatus();
    this.input.focus();
  }

  private replaySession(events: SessionEvent[], sessionId: string): void {
    this.currentUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const toolLabels = new Map<string, { title: string; argsText: string }>();
    const latestModelChange = [...events]
      .reverse()
      .find((event): event is Extract<SessionEvent, { type: SessionEventType.ModelChange }> => event.type === SessionEventType.ModelChange);

    if (latestModelChange) {
      try {
        this.session.switchModel(latestModelChange.modelId);
      } catch {
        // Keep rendering even if the old model is no longer configured.
      }
    }

    for (const event of events) {
      if (event.type === SessionEventType.Session) {
        this.transcriptCwd = event.cwd;
        continue;
      }

      if (event.type === SessionEventType.ModelChange) {
        this.addModelSwitchMessage(event.modelId);
        continue;
      }

      if (event.type === SessionEventType.Interrupt) {
        this.addSystemMessage("agent paused");
        continue;
      }

      if (event.type === SessionEventType.RuntimeEvent) {
        this.applyStreamEvent(event.event);
        continue;
      }

      if (event.type !== SessionEventType.Message) {
        continue;
      }

      const message = event.message;
      if (message.role === MessageRole.User) {
        this.addUserMessage(renderUserMessage(message));
        continue;
      }

      if (message.role === MessageRole.Tool) {
        const replayTool = toolLabels.get(message.toolCallId);
        const fallbackTitle = message.toolName;
        const title = replayTool
          ? (message.isError ? `${replayTool.title} [error]` : replayTool.title)
          : (message.isError ? `${fallbackTitle} [error]` : fallbackTitle);
        const toolBody = renderToolMessage(message);
        const toolMsg = this.addMessageBox(
          title,
          toolBody,
          message.isError ? COLORS.danger : COLORS.success,
          true,
          false,
          COLORS.text,
          0,
          "none",
          message.isError ? COLORS.toolBackground : COLORS.toolCompleteBackground,
          true,
          replayTool?.argsText
        );
        toolMsg.box.marginBottom = 1;
        continue;
      }

      if (message.role !== MessageRole.Assistant) {
        this.addSystemMessage("unsupported message role", String((message as { role?: unknown }).role ?? "unknown"));
        continue;
      }

      for (const toolCall of extractToolCalls(message.content)) {
        toolLabels.set(toolCall.id, { title: toolCall.name, argsText: formatToolArguments(toolCall.arguments) });
      }

      const thinking = renderAssistantThinking(message.content);
      if (thinking) {
        const thinkingView = this.addThinkingMessageBox("Thinking");
        setMessageText(thinkingView, thinking);
        finalizeMarkdownStream(thinkingView);
      }

      const assistantText = renderAssistantText(message.content);
      if (assistantText) {
        this.addMarkdownMessageBox("assistant", assistantText, false);
      }

      if (message.usage) {
        this.currentUsage = { ...message.usage };
      }
    }
  }

  private updateSuggestion(value: string): void {
    const suggestion = getCommandSuggestion(value);
    if (suggestion && suggestion !== value) {
      this.suggestionText.content = `⇥  ${suggestion}`;
      this.suggestionText.visible = true;
    } else {
      this.suggestionText.visible = false;
    }
    this.renderer.requestRender();
  }

  private setStatusMessage(message: string): void {
    this.refreshStatus(message);
  }

  private refreshStatus(message?: string): void {
    this.statusText.content = formatStatus({
      cwd: this.transcriptCwd,
      model: this.session.getActiveModelId(),
      usage: this.currentUsage,
      pendingImages: this.pendingImages.length
    }, message);
    this.renderer.requestRender();
  }

  private renderStreamUpdate(): void {
    // Do not force-scroll while content is streaming. The transcript ScrollBox has
    // stickyScroll enabled, so it will keep following new content only while the
    // user is already at the bottom. Once the user manually scrolls up, sticky
    // scrolling is suspended until they return to the bottom (for example with End).
    this.renderer.requestRender();
  }

  private openPicker(
    title: string,
    placeholder: string,
    items: PickerItem<string>[],
    onSelect: (item: PickerItem<string>) => void | Promise<void>,
    options: PickerViewOptions = {}
  ): void {
    this.closePicker();

    const view = createPickerView(this.renderer, COLORS, title, placeholder, options);
    this.activePicker = { view, items, onSelect };
    this.root.insertBefore(view.box, this.footer);

    view.select.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: { value?: string }) => {
      void this.handlePickerSelection(option.value);
    });

    this.refreshPickerOptions();
    this.renderer.requestRender();
  }

  private refreshPickerOptions(): void {
    if (!this.activePicker) {
      return;
    }

    const query = this.activePicker.view.input.value.trim();
    const filtered = rankPickerItems(this.activePicker.items, query);
    this.activePicker.view.select.options = filtered.length > 0
      ? filtered.map((item) => ({
        name: item.name,
        description: item.description,
        value: item.value
      }))
      : [{ name: "No matches", description: "Try another query", value: undefined }];
    this.activePicker.view.select.selectedIndex = 0;
    this.renderer.requestRender();
  }

  private async handlePickerSelection(value: string | undefined): Promise<void> {
    if (!this.activePicker || !value) {
      return;
    }

    const picker = this.activePicker;
    this.closePicker();
    await picker.onSelect({ name: "", description: "", value });
  }

  private closePicker(): void {
    if (!this.activePicker) {
      return;
    }

    this.root.remove(this.activePicker.view.box.id);
    this.activePicker.view.box.destroyRecursively();
    this.activePicker = undefined;
    this.input.focus();
    this.renderer.requestRender();
  }
}
