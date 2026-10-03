import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { hasScanDraft } from '@/lib/scanDraft';

type GoogleAuthButtonProps = {
  /** Where Google should return after OAuth. Defaults to onboarding if a scan draft exists. */
  redirectPath?: string;
  label?: string;
};

export function GoogleAuthButton({
  redirectPath,
  label = 'Continue with Google',
}: GoogleAuthButtonProps) {
  const { signInWithGoogle, clearError } = useAuth();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    clearError();
    setBusy(true);
    const next = redirectPath ?? (hasScanDraft() ? '/onboarding' : '/admin/dashboard');
    const { error } = await signInWithGoogle(next);
    if (error) setBusy(false);
    // On success the browser leaves this page for Google.
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      disabled={busy}
      onClick={() => void handleClick()}
    >
      {busy ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z" />
          <path fill="#34A853" d="M12 22c2.6 0 4.8-.9 6.4-2.3l-3.1-2.4c-.9.6-2 1-3.3 1-2.5 0-4.6-1.7-5.4-4l-3.2 2.5C5.2 19.8 8.3 22 12 22z" />
          <path fill="#4A90E2" d="M6.6 14.3c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L3.4 8C2.5 9.8 2 11.4 2 13.1c0 1.7.5 3.3 1.4 4.7l3.2-2.5z" />
          <path fill="#FBBC05" d="M12 5.7c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.8 2.8 14.6 2 12 2 8.3 2 5.2 4.2 3.4 7.4l3.2 2.5c.8-2.3 2.9-4.2 5.4-4.2z" />
        </svg>
      )}
      {busy ? 'Redirecting…' : label}
    </Button>
  );
}
