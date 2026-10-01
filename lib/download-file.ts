export function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string,
  browser = { document, URL: window.URL, setTimeout: window.setTimeout.bind(window) }
) {
  const url = browser.URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = browser.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  browser.document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Keep the blob available while the browser starts the asynchronous download.
    browser.setTimeout(() => browser.URL.revokeObjectURL(url), 60_000);
  }
}
