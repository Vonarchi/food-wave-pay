/**
 * Read status + body from a failed functions.invoke (Supabase hides details behind generic message).
 * Pass `invokeResponse` from the same `invoke()` result — some builds omit `error.context`.
 *
 * Response body reads are time-bounded so a stalled stream cannot block UI spinners forever.
 */
const READ_BODY_MS = 8_000;

function readResponseTextBounded(res: Response): Promise<string> {
  return Promise.race([
    res.text(),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('edge_error_body_timeout')), READ_BODY_MS)
    ),
  ]).catch(() => '');
}

export async function formatEdgeFunctionFailure(
  error: unknown,
  invokeResponse?: Response | null
): Promise<string> {
  const base = error instanceof Error ? error.message : String(error);
  const res = resolveInvokeFailureResponse(error, invokeResponse);
  if (!res) return base;

  const status = res.status;
  let raw = '';
  try {
    raw = await readResponseTextBounded(res);
  } catch {
    return `[${status}] ${res.statusText || ''}`.trim() || base;
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

function resolveInvokeFailureResponse(error: unknown, invokeResponse?: Response | null): Response | undefined {
  if (invokeResponse instanceof Response) return invokeResponse;
  if (!error || typeof error !== 'object') return undefined;
  const e = error as { context?: unknown; response?: unknown };
  if (e.context instanceof Response) return e.context;
  if (e.response instanceof Response) return e.response;
  return undefined;
}
