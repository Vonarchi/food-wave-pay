import { getSupabaseBuildHost, isSupabaseClientConfigured } from '@/integrations/supabase/client';

const CONNECTIVITY_SNIPPET = "Cannot reach server";

/** Extra context when auth fails with a network / env issue */
export function ConnectivityErrorHint({ message }: { message: string }) {
  if (!message.includes(CONNECTIVITY_SNIPPET)) return null;

  return (
    <div className="mt-2 rounded-md bg-muted/80 px-2 py-1.5 text-xs text-muted-foreground space-y-1">
      <p>
        <span className="font-medium text-foreground">This deployment is calling:</span>{" "}
        <code className="break-all">{getSupabaseBuildHost()}</code>
      </p>
      {!isSupabaseClientConfigured && (
        <p>Variables are missing in the build — add them in Vercel and redeploy.</p>
      )}
      {isSupabaseClientConfigured && (
        <p>
          Open DevTools → Network, retry login, and check the failed request.{" "}
          <span className="font-medium text-foreground">ERR_NAME_NOT_RESOLVED</span> means the URL is
          wrong or the project was removed.{" "}
          <span className="font-medium text-foreground">CORS/blocked</span> can be an extension or
          corporate network.
        </p>
      )}
    </div>
  );
}
