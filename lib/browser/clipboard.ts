export class ClipboardError extends Error {}

function describeClipboardError(error: unknown, action: "copy" | "paste"): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return action === "copy"
      ? "Clipboard access was denied. Select the code and press Ctrl+C (⌘C on Mac) instead."
      : "Clipboard access was denied. Click into the editor and press Ctrl+V (⌘V on Mac) instead.";
  }
  return `Could not ${action}: ${error instanceof Error ? error.message : String(error)}`;
}

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new ClipboardError("Clipboard is unavailable in this browser context. Select the code and copy it manually.");
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    throw new ClipboardError(describeClipboardError(error, "copy"));
  }
}

export async function readClipboardText(): Promise<string> {
  if (!navigator.clipboard?.readText) {
    throw new ClipboardError("Reading the clipboard is not supported here. Click into the editor and press Ctrl+V (⌘V on Mac).");
  }
  try {
    return await navigator.clipboard.readText();
  } catch (error) {
    throw new ClipboardError(describeClipboardError(error, "paste"));
  }
}
