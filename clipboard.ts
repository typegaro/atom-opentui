import { platform } from "node:os";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import { spawn } from "node:child_process";

export type ClipboardCopyMethod = (text: string) => Promise<boolean>;
export type ClipboardReadMethod = () => Promise<string | undefined>;
export interface ClipboardImage {
  mimeType: string;
  bytes: Buffer;
}
export type ClipboardImageReadMethod = () => Promise<ClipboardImage | undefined>;

let cachedCopyMethod: Promise<ClipboardCopyMethod> | undefined;
let cachedReadMethod: Promise<ClipboardReadMethod> | undefined;
let cachedImageReadMethod: Promise<ClipboardImageReadMethod> | undefined;

async function commandExists(command: string): Promise<boolean> {
  const pathEnv = process.env.PATH ?? "";
  const extensions = platform() === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""];

  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) {
      continue;
    }

    for (const extension of extensions) {
      const candidate = join(dir, command.endsWith(extension.toLowerCase()) ? command : `${command}${extension}`);
      try {
        await access(candidate, constants.X_OK);
        return true;
      } catch {
        // Keep looking.
      }
    }
  }

  return false;
}

function writeToCommand(command: string, args: string[], text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "ignore", "ignore"]
    });

    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));

    child.stdin.on("error", () => {
      // The close/error handlers above will resolve the result.
    });
    child.stdin.end(text);
  });
}

function runCommand(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "ignore"]
    });

    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function readCommandBuffer(command: string, args: string[]): Promise<Buffer | undefined> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "ignore"]
    });
    const chunks: Buffer[] = [];

    child.on("error", () => resolve(undefined));
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(undefined);
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

async function readCommand(command: string, args: string[]): Promise<string | undefined> {
  const bytes = await readCommandBuffer(command, args);
  return bytes?.toString("utf8");
}

async function resolveCopyMethod(): Promise<ClipboardCopyMethod> {
  const os = platform();

  if (os === "darwin") {
    if (await commandExists("osascript")) {
      return async (text: string) => {
        const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return runCommand("osascript", ["-e", `set the clipboard to "${escaped}"`]);
      };
    }

    if (await commandExists("pbcopy")) {
      return (text: string) => writeToCommand("pbcopy", [], text);
    }
  }

  if (os === "linux") {
    if (process.env.WAYLAND_DISPLAY && (await commandExists("wl-copy"))) {
      return (text: string) => writeToCommand("wl-copy", [], text);
    }

    if (await commandExists("xclip")) {
      return (text: string) => writeToCommand("xclip", ["-selection", "clipboard"], text);
    }

    if (await commandExists("xsel")) {
      return (text: string) => writeToCommand("xsel", ["--clipboard", "--input"], text);
    }
  }

  if (os === "win32") {
    return (text: string) =>
      writeToCommand(
        "powershell.exe",
        [
          "-NonInteractive",
          "-NoProfile",
          "-Command",
          "[Console]::InputEncoding = [System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())"
        ],
        text
      );
  }

  return async () => false;
}

function imageFromBuffer(mimeType: string, bytes: Buffer | undefined): ClipboardImage | undefined {
  if (!bytes || bytes.length === 0) {
    return undefined;
  }
  return { mimeType, bytes };
}

async function resolveReadMethod(): Promise<ClipboardReadMethod> {
  const os = platform();

  if (os === "darwin") {
    if (await commandExists("pbpaste")) {
      return () => readCommand("pbpaste", []);
    }
  }

  if (os === "linux") {
    if (process.env.WAYLAND_DISPLAY && (await commandExists("wl-paste"))) {
      return () => readCommand("wl-paste", ["--no-newline"]);
    }

    if (await commandExists("xclip")) {
      return () => readCommand("xclip", ["-selection", "clipboard", "-out"]);
    }

    if (await commandExists("xsel")) {
      return () => readCommand("xsel", ["--clipboard", "--output"]);
    }
  }

  if (os === "win32") {
    return () => readCommand("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"]);
  }

  return async () => undefined;
}

async function resolveImageReadMethod(): Promise<ClipboardImageReadMethod> {
  const os = platform();

  if (os === "darwin") {
    if (await commandExists("osascript")) {
      return async () => {
        const script = "set imageData to (the clipboard as «class PNGf»)\nset stdout to (open for access POSIX file \"/dev/stdout\" with write permission)\nwrite imageData to stdout\nclose access stdout";
        const bytes = await readCommandBuffer("osascript", ["-e", script]);
        return imageFromBuffer("image/png", bytes);
      };
    }
  }

  if (os === "linux") {
    if (process.env.WAYLAND_DISPLAY && (await commandExists("wl-paste"))) {
      return async () => {
        const png = await readCommandBuffer("wl-paste", ["--no-newline", "--type", "image/png"]);
        if (png && png.length > 0) return { mimeType: "image/png", bytes: png };
        const jpeg = await readCommandBuffer("wl-paste", ["--no-newline", "--type", "image/jpeg"]);
        return imageFromBuffer("image/jpeg", jpeg);
      };
    }

    if (await commandExists("xclip")) {
      return async () => {
        const png = await readCommandBuffer("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"]);
        if (png && png.length > 0) return { mimeType: "image/png", bytes: png };
        const jpeg = await readCommandBuffer("xclip", ["-selection", "clipboard", "-t", "image/jpeg", "-o"]);
        return imageFromBuffer("image/jpeg", jpeg);
      };
    }
  }

  if (os === "win32") {
    return async () => {
      const command = "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $image = [System.Windows.Forms.Clipboard]::GetImage(); if ($null -eq $image) { exit 1 }; $stream = New-Object System.IO.MemoryStream; $image.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png); [Console]::OpenStandardOutput().Write($stream.ToArray(), 0, [int]$stream.Length)";
      const bytes = await readCommandBuffer("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", command]);
      return imageFromBuffer("image/png", bytes);
    };
  }

  return async () => undefined;
}

export async function copyToClipboardFallback(text: string): Promise<boolean> {
  cachedCopyMethod ??= resolveCopyMethod();
  const method = await cachedCopyMethod;
  return method(text).catch(() => false);
}

export async function readClipboardFallback(): Promise<string | undefined> {
  cachedReadMethod ??= resolveReadMethod();
  const method = await cachedReadMethod;
  const text = await method().catch(() => undefined);
  return text && text.length > 0 ? text : undefined;
}

export async function readClipboardImageFallback(): Promise<ClipboardImage | undefined> {
  cachedImageReadMethod ??= resolveImageReadMethod();
  const method = await cachedImageReadMethod;
  return method().catch(() => undefined);
}
