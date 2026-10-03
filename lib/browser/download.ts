export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadTextFile(contents: string, fileName: string, mimeType = "text/plain"): void {
  downloadBlob(new Blob([contents], { type: `${mimeType};charset=utf-8` }), fileName);
}
