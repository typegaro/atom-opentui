import { BoxRenderable, CliRenderer, CodeRenderable, infoStringToFiletype, MarkdownRenderable, type MouseEvent, type Renderable, type RenderNodeContext, ScrollBoxRenderable, SyntaxStyle, TextAttributes, TextRenderable } from "@opentui/core";

type MarkdownToken = Parameters<NonNullable<ConstructorParameters<typeof MarkdownRenderable>[1]["renderNode"]>>[0];

type CodeToken = MarkdownToken & {
  text?: string;
  lang?: string;
};

export interface MessageView {
  box: BoxRenderable;
  label: TextRenderable;
  baseLabel: string;
  text?: TextRenderable;
  markdown?: MarkdownRenderable;
  content: string;
  collapsible: boolean;
  collapsed: boolean;
}

export function setLabelText(view: MessageView, text: string): void {
  view.baseLabel = text;
  view.label.content = view.collapsible
    ? `${view.collapsed ? "▶" : "▼"} ${text}`
    : text;
}

export function createMessageBox(
  renderer: CliRenderer,
  transcript: ScrollBoxRenderable,
  title: string,
  body: string,
  accentColor: string,
  backgroundColor: string | undefined,
  textColor: string,
  labelColor: string,
  collapsible = false,
  paddingY = 1,
  initiallyCollapsed = collapsible,
  wrapMode: "none" | "char" | "word" = "word",
  headerBody?: string
): MessageView {
  const box = new BoxRenderable(renderer, {
    width: "100%",
    ...(backgroundColor !== undefined && { backgroundColor }),
    paddingLeft: 1,
    paddingRight: 1,
    paddingTop: paddingY,
    paddingBottom: paddingY,
    flexDirection: "column"
  });

  const label = new TextRenderable(renderer, {
    width: "100%",
    content: collapsible ? `${initiallyCollapsed ? "▶" : "▼"} ${title}` : title,
    fg: accentColor,
    attributes: TextAttributes.BOLD
  });

  const textBox = new BoxRenderable(renderer, {
    width: "100%",
    paddingLeft: 2,
    flexDirection: "column",
    visible: !initiallyCollapsed
  });

  const text = new TextRenderable(renderer, {
    width: "100%",
    content: body,
    fg: textColor,
    wrapMode
  });

  textBox.add(text);
  box.add(label);
  if (headerBody) {
    box.add(new TextRenderable(renderer, {
      width: "100%",
      content: headerBody,
      fg: textColor,
      attributes: TextAttributes.NONE,
      wrapMode
    }));
  }
  box.add(textBox);
  transcript.add(box);
  scrollTranscriptToBottom(transcript);

  const view: MessageView = { box, label, baseLabel: title, text, content: body, collapsible, collapsed: initiallyCollapsed };

  if (collapsible) {
    const toggle = (event: MouseEvent) => {
      if (event.button !== 2) return;
      if (event.isDragging) return;
      event.stopPropagation();
      event.preventDefault();
      view.collapsed = !view.collapsed;
      textBox.visible = !view.collapsed;
      view.label.content = `${view.collapsed ? "▶" : "▼"} ${view.baseLabel}`;
      renderer.requestRender();
    };

    box.onMouseDown = toggle;
    box.onMouseUp = (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
    };
  }

  return view;
}

function createMarkdownNodeRenderer(renderer: CliRenderer, textColor: string) {
  return (token: MarkdownToken, context: RenderNodeContext): Renderable | undefined | null => {
    if (token.type === "code") {
      const code = token as CodeToken;
      const box = new BoxRenderable(renderer, {
        width: "100%",
        backgroundColor: "#111827",
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 1,
        paddingBottom: 1,
        marginBottom: 1,
        flexDirection: "column"
      });

      box.add(new CodeRenderable(renderer, {
        width: "100%",
        content: code.text ?? "",
        filetype: infoStringToFiletype(code.lang ?? ""),
        syntaxStyle: context.syntaxStyle,
        treeSitterClient: context.treeSitterClient,
        fg: textColor,
        bg: "#111827",
        wrapMode: "word"
      }));

      return box;
    }

    return undefined;
  };
}

export function createMarkdownMessageBox(
  renderer: CliRenderer,
  transcript: ScrollBoxRenderable,
  title: string,
  body: string,
  accentColor: string,
  backgroundColor: string | undefined,
  textColor: string,
  labelColor: string,
  syntaxStyle: SyntaxStyle,
  streaming = false,
  collapsible = false,
  paddingY = 1,
  initiallyCollapsed = collapsible,
  wrapMode: "none" | "char" | "word" = "word"
): MessageView {
  const box = new BoxRenderable(renderer, {
    width: "100%",
    ...(backgroundColor !== undefined && { backgroundColor }),
    paddingLeft: 1,
    paddingRight: 1,
    paddingTop: paddingY,
    paddingBottom: paddingY,
    flexDirection: "column"
  });

  const label = new TextRenderable(renderer, {
    width: "100%",
    content: collapsible ? `${initiallyCollapsed ? "▶" : "▼"} ${title}` : title,
    fg: accentColor,
    attributes: TextAttributes.BOLD
  });

  const markdown = new MarkdownRenderable(renderer, {
    width: "100%",
    content: body,
    syntaxStyle,
    fg: textColor,
    conceal: false,
    streaming,
    tableOptions: { wrapMode },
    internalBlockMode: "top-level",
    renderNode: createMarkdownNodeRenderer(renderer, textColor),
    visible: !initiallyCollapsed
  });

  box.add(label);
  box.add(markdown);
  transcript.add(box);
  scrollTranscriptToBottom(transcript);

  const view: MessageView = { box, label, baseLabel: title, markdown, content: body, collapsible, collapsed: initiallyCollapsed };

  if (collapsible) {
    const toggle = (event: MouseEvent) => {
      if (event.button !== 2) return;
      if (event.isDragging) return;
      event.stopPropagation();
      event.preventDefault();
      view.collapsed = !view.collapsed;
      markdown.visible = !view.collapsed;
      view.label.content = `${view.collapsed ? "▶" : "▼"} ${view.baseLabel}`;
      renderer.requestRender();
    };

    box.onMouseDown = toggle;
    box.onMouseUp = (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
    };
  }

  return view;
}

export function appendMessageText(view: MessageView, delta: string): void {
  view.content += delta;
  if (view.markdown) {
    view.markdown.content = view.content;
  } else if (view.text) {
    view.text.content = view.content;
  }
}

export function setMessageText(view: MessageView, content: string): void {
  view.content = content;
  if (view.markdown) {
    view.markdown.content = content;
  } else if (view.text) {
    view.text.content = content;
  }
}

export function finalizeMarkdownStream(view: MessageView): void {
  if (view.markdown) {
    view.markdown.streaming = false;
  }
}

export function scrollTranscriptToBottom(transcript: ScrollBoxRenderable): void {
  transcript.scrollTo({ x: 0, y: transcript.scrollHeight });
}
