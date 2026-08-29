import { useSetUserRole, useSuspendUser } from '../../hooks/useAdmin';
import StatusPill from '../../components/ui/StatusPill';
import Alert from '../../components/ui/Alert';
import { sinceLabel } from '../../api/activity';
import { useToast } from '../../components/ui/toast-context';
import { ROLES, titleCase, displayName } from './userDisplay';
import { initialOf } from '../../lib/format';

export default function UserRow({ user, isSelf, lastSeenAt }) {
  const { notify } = useToast();
  const changeRole = useSetUserRole();
  const suspend = useSuspendUser();

  const busy = changeRole.isPending || suspend.isPending;
  const isSuspended = user.status === 'suspended';
  const canAct = user.status === 'active' || isSuspended;

  return (
    <div className="card no-hover">
      <div className="cluster-between">
        <div className="cluster grow">
          <div className="avatar" style={{ width: 40, height: 40, flexShrink: 0 }} aria-hidden="true">
            {initialOf(user)}
          </div>
          <div className="grow">
            <h3 className="data-row-title" style={{ fontSize: '1rem', margin: 0 }}>
              {displayName(user)}
              {isSelf && (
                <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: '0.8rem' }}>
                  {' '}- you
                </span>
              )}
            </h3>
            <div className="data-row-meta">
              {user.email}
              {/* An account nobody uses looks exactly like one in daily use
                  without this. */}
              <span className="muted"> · last seen {sinceLabel(lastSeenAt)}</span>
            </div>
          </div>
        </div>

        <div className="data-row-actions">
          <StatusPill status={user.status} />

          {/* Acting on yourself is how an admin locks themselves out mid-session.
              The server refuses only the LAST active admin; this also refuses
              you demoting or suspending yourself while others remain, which the
              server permits but nobody means to do. */}
          <select
            className="input-field"
            style={{ width: 'auto', padding: '0.4rem 0.6rem' }}
            aria-label={`Role for ${user.name || user.email}`}
            value={user.role}
            disabled={busy || isSelf || !canAct}
            onChange={(e) => changeRole.mutate(
              { userId: user.id, role: e.target.value },
              { onSuccess: () => notify(`${displayName(user)} is now a ${e.target.value}.`) },
            )}
          >
            {ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
          </select>

          {canAct && !isSelf && (
            <button
              type="button"
              className={`btn btn-sm ${isSuspended ? 'btn-primary' : 'btn-danger'}`}
              disabled={busy}
              onClick={() => suspend.mutate(
                { userId: user.id, suspend: !isSuspended },
                {
                  onSuccess: () => notify(
                    isSuspended
                      ? `${displayName(user)} can sign in again.`
                      : `${displayName(user)} is suspended.`,
                  ),
                },
              )}
            >
              {busy ? 'Working...' : isSuspended ? 'Reinstate' : 'Suspend'}
            </button>
          )}
        </div>
      </div>
      <Alert error={changeRole.error ?? suspend.error} />
    </div>
  );
}
