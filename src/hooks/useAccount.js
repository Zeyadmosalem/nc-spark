import { useMutation } from '@tanstack/react-query';
import { updateMyProfile } from '../api/profiles';
import { changePassword } from '../api/auth';
import { profileChanged } from './useSession';

/**
 * Your own account.
 *
 * `grant update (name, avatar) on public.profiles to authenticated` and the
 * profiles_update_self policy have been in place since M1, and nothing ever
 * called them — so nobody using NC Spark could change their own display name,
 * in any role. The grant names those two columns exactly: role and status are
 * not writable here, which is why the account page can show them without any
 * risk of offering to change them.
 */

export function useUpdateMyProfile() {
  return useMutation({
    mutationFn: ({ name, avatar }) => updateMyProfile({ name, avatar }),
    // Not a query invalidation: the profile lives in useSession's local state,
    // not in the query cache, and the sidebar keeps its own copy of it.
    onSuccess: profileChanged,
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: ({ password }) => changePassword(password) });
}
