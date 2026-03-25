/**
 * Read status + body from a failed functions.invoke (Supabase hides details behind generic message).
 */
export async function formatEdgeFunctionFailure(error: unknown): Promise<string> {
  const base = error instanceof Error ? error.message : String(error);

  const ctx = error && typeof error === 'object' && 'context' in error ? (error as { context?: unknown }).context : undefined;
  if (!(ctx instanceof Response)) {
    return base;
  }

  const res = ctx as Response;
  const status = res.status;

  let raw = '';
  try {
    raw = await res.text();
  } catch {
    return `${status} ${res.statusText || ''}`.trim() || base;
  }

  if (raw) {
    try {
      const j = JSON.parse(raw) as { error?: string; message?: string };
      if (typeof j.error === 'string' && j.error.trim()) {
        return `[${status}] ${j.error}`;
      }
      if (typeof j.message === 'string' && j.message.trim()) {
        return `[${status}] ${j.message}`;
      }
    } catch {
      /* plain text body */
    }
    return `[${status}] ${raw.length > 600 ? `${raw.slice(0, 600)}…` : raw}`;
  }

  return `[${status}] ${base}`;
}
