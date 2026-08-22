import { useEffect, useState, useCallback } from 'react';
import { getSession, onAuthChange } from '../api/auth';
import { fetchMyProfile } from '../api/profiles';

/**
 * Single source of truth for "who is signed in and may they use the app".
 * Status is derived from the profile row rather than the JWT, so a
 * suspension takes effect on the next load without waiting for token refresh.
 */
export function useSession() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (nextSession) => {
    setSession(nextSession);
    if (!nextSession) {
      setProfile(null);
      setIsLoading(false);
      return;
    }
    try {
      setProfile(await fetchMyProfile());
    } catch {
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    // A rejected session lookup must still settle the hook. Left unhandled it
    // pins status at 'loading' and the app never renders anything but a spinner.
    getSession()
      .catch(() => null)
      .then((s) => { if (active) load(s); });
    const unsubscribe = onAuthChange((s) => { if (active) load(s); });
    return () => { active = false; unsubscribe?.(); };
  }, [load]);

  let status = 'loading';
  if (!isLoading) {
    if (!session || !profile) status = 'signed-out';
    else status = profile.status === 'active' ? 'active' : profile.status;
  }

  return { session, profile, status, isLoading };
}
