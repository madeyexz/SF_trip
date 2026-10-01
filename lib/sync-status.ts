type SyncStatusInput = {
  count: number;
  noun: 'events' | 'items';
  sourceLabel?: string;
  timeLabel?: string;
  errors?: unknown;
};

function compact(value: unknown, limit: number) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function describeIngestionError(error: any) {
  let source = '';
  try {
    // Do not expose private calendar query tokens in the status bar.
    source = new URL(String(error?.sourceUrl || '')).hostname;
  } catch {}
  const stage = compact(error?.stage, 40);
  const rawMessage = String(typeof error === 'string' ? error : error?.message || '');
  const safeMessage = rawMessage.replace(/https?:\/\/[^\s"'<>]+/g, value => {
    try {
      return new URL(value).origin;
    } catch {
      return '[source URL]';
    }
  });
  const message = compact(safeMessage, 180) || 'Source ingestion failed.';
  const label = [source, stage].filter(Boolean).join(' / ');
  return label ? `${label}: ${message}` : message;
}

export function buildSyncStatus({ count, noun, sourceLabel, timeLabel, errors }: SyncStatusInput) {
  const problems = Array.isArray(errors) ? errors : [];
  const from = sourceLabel ? ` from "${sourceLabel}"` : '';
  if (!problems.length) {
    const at = timeLabel ? ` at ${timeLabel}` : '';
    return { message: `Synced ${count} ${noun}${from}${at}.`, isError: false };
  }
  const details = problems.slice(0, 2).map(describeIngestionError).join('; ');
  const more = problems.length > 2 ? `; ${problems.length - 2} more` : '';
  return {
    message: `Partial sync: loaded ${count} ${noun}${from}. ${problems.length} ingestion error${problems.length === 1 ? '' : 's'}: ${details}${more}. Review Sources and retry the failed sources.`,
    isError: true
  };
}
