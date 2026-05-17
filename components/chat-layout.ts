import {
  BoxRenderable,
  CliRenderer,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
  TextareaRenderable
} from "@opentui/core";

export interface ChatTheme {
  background: string;
  panel: string;
  panelAlt: string;
  border: string;
  borderSoft: string;
  text: string;
  subtle: string;
  muted: string;
  accent: string;
}

export interface ChatLayout {
  root: BoxRenderable;
  footer: BoxRenderable;
  composer: BoxRenderable;
  transcript: ScrollBoxRenderable;
  input: TextareaRenderable;
  titleText: TextRenderable;
  hintText: TextRenderable;
  statusText: TextRenderable;
  suggestionText: TextRenderable;
  taskPanel: BoxRenderable;
  taskTitleText: TextRenderable;
  taskBodyText: TextRenderable;
}

export function createChatLayout(renderer: CliRenderer, theme: ChatTheme): ChatLayout {
  const root = new BoxRenderable(renderer, {
    id: "opentui-chat-root",
    width: "100%",
    height: "100%",
    flexDirection: "column"
  });

  const titleText = new TextRenderable(renderer, {
    content: "",
    fg: theme.text,
    attributes: TextAttributes.BOLD,
    visible: false
  });
  const hintText = new TextRenderable(renderer, {
    content: "",
    fg: theme.muted,
    visible: false
  });

  const transcript = new ScrollBoxRenderable(renderer, {
    id: "opentui-transcript",
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    width: "100%",
    stickyScroll: true,
    stickyStart: "bottom",
    viewportCulling: true,
    contentOptions: { flexDirection: "column", paddingX: 2, paddingY: 1, gap: 0 },
    verticalScrollbarOptions: {
      trackOptions: { foregroundColor: theme.borderSoft, backgroundColor: theme.background }
    }
  });

  const footer = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "column",
    flexShrink: 0,
    paddingX: 1,
    paddingTop: 1,
    paddingBottom: 1,
    gap: 1,
    border: ["top"],
    borderColor: theme.borderSoft
  });

  const composer = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "column"
  });

  const input = new TextareaRenderable(renderer, {
    id: "opentui-chat-input",
    width: "100%",
    minHeight: 1,
    maxHeight: 8,
    wrapMode: "word",
    scrollMargin: 1,
    placeholder: "Message or /help",
    textColor: theme.text,
    cursorColor: theme.accent
  });

  const statusText = new TextRenderable(renderer, {
    content: "",
    fg: theme.subtle
  });

  const taskPanel = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "column",
    paddingLeft: 1,
    paddingRight: 1,
    visible: false
  });

  const taskTitleText = new TextRenderable(renderer, {
    width: "100%",
    content: "Task",
    fg: theme.subtle,
    attributes: TextAttributes.BOLD
  });

  const taskBodyText = new TextRenderable(renderer, {
    width: "100%",
    content: "",
    fg: theme.text
  });

  taskPanel.add(taskTitleText);
  taskPanel.add(taskBodyText);

  const suggestionText = new TextRenderable(renderer, {
    content: "",
    fg: theme.muted,
    visible: false
  });

  composer.add(input);
  composer.add(suggestionText);

  footer.add(taskPanel);
  footer.add(composer);
  footer.add(statusText);

  root.add(transcript);
  root.add(footer);
  renderer.root.add(root);

  return {
    root,
    footer,
    composer,
    transcript,
    input,
    titleText,
    hintText,
    statusText,
    suggestionText,
    taskPanel,
    taskTitleText,
    taskBodyText
  };
}
