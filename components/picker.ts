import {
  BoxRenderable,
  CliRenderer,
  InputRenderable,
  SelectRenderable,
  TextAttributes,
  TextRenderable
} from "@opentui/core";

export interface PickerTheme {
  background: string;
  panel: string;
  panelAlt: string;
  borderSoft: string;
  text: string;
  subtle: string;
  muted: string;
  accent: string;
}

export interface PickerView {
  box: BoxRenderable;
  title: TextRenderable;
  input: InputRenderable;
  select: SelectRenderable;
  hint: TextRenderable;
}

export interface PickerViewOptions {
  showDescription?: boolean;
}

export function createPickerView(
  renderer: CliRenderer,
  theme: PickerTheme,
  title: string,
  placeholder: string,
  options: PickerViewOptions = {}
): PickerView {
  const box = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "column",
    flexShrink: 0,
    paddingX: 2,
    paddingTop: 1,
    paddingBottom: 1,
    border: ["top", "bottom"],
    borderColor: theme.borderSoft,
    gap: 1
  });

  const titleText = new TextRenderable(renderer, {
    width: "100%",
    content: title,
    fg: theme.text,
    attributes: TextAttributes.BOLD
  });

  const input = new InputRenderable(renderer, {
    id: "opentui-chat-picker-input",
    width: "100%",
    placeholder,
    textColor: theme.text,
    cursorColor: theme.accent
  });

  const select = new SelectRenderable(renderer, {
    id: "opentui-chat-picker-select",
    width: "100%",
    height: 8,
    textColor: theme.subtle,
    focusedTextColor: theme.text,
    selectedTextColor: theme.text,
    descriptionColor: theme.muted,
    selectedDescriptionColor: theme.subtle,
    showDescription: options.showDescription ?? true,
    showScrollIndicator: true,
    wrapSelection: true,
    itemSpacing: 0,
    options: []
  });

  const hint = new TextRenderable(renderer, {
    width: "100%",
    content: "Type to filter. Up/Down move. Enter select. Esc cancel.",
    fg: theme.muted
  });

  box.add(titleText);
  box.add(input);
  box.add(select);
  box.add(hint);

  return { box, title: titleText, input, select, hint };
}
