import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  useAllowedDomains, useAddAllowedDomain, useRemoveAllowedDomain,
} from '../../hooks/useAdmin';
import QueryError from '../shared/QueryError';
import Alert from '../ui/Alert';
import EmptyState from '../ui/EmptyState';
import { SkeletonList } from '../ui/Skeleton';
import { useToast } from '../ui/toast-context';

/**
 * The email domains that skip administrator approval.
 *
 * This is the control that decides whether the approval queue above it fills
 * up at all, and it had no UI: `allowed_domains` has RLS on and no policy, so
 * even an admin's browser cannot read it. Onboarding a whole organisation
 * meant somebody running SQL.
 *
 * The consequence of adding one is stated on the screen rather than left to be
 * inferred. Allowlisting a domain hands an active account to everyone with an
 * address there, with no further review — which is the point, and is also
 * exactly the sort of thing worth being sure about before clicking.
 */
export default function AllowedDomains() {
  const { notify } = useToast();
  const domains = useAllowedDomains();
  const add = useAddAllowedDomain();
  const remove = useRemoveAllowedDomain();

  const [value, setValue] = useState('');
  const [confirming, setConfirming] = useState(null);

  if (domains.isLoading) return <SkeletonList rows={2} label="Loading the domain allowlist" />;
  if (domains.error) {
    return <QueryError error={domains.error} what="the domain allowlist" />;
  }

  const list = domains.data ?? [];

  function submit(e) {
    e.preventDefault();
    const domain = value.trim();
    if (!domain) return;
    add.mutate({ domain }, {
      onSuccess: () => {
        notify(`Anyone with an address at ${domain.replace(/^@/, '').toLowerCase()} can now sign in without review.`);
        setValue('');
      },
    });
  }

  return (
    <div className="stack-md">
      {list.length === 0 ? (
        <EmptyState icon="🔒" title="Every signup needs approval">
          No domains are allowlisted, so everyone who signs up waits for you.
          Add a domain to let colleagues in without review.
        </EmptyState>
      ) : (
        <div className="card no-hover stack-xs">
          <AnimatePresence initial={false}>
            {list.map((d) => (
              <motion.div
                key={d.domain}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="data-row"
              >
                <span style={{ fontSize: '1.1rem' }} aria-hidden="true">✉️</span>
                <div className="data-row-main">
                  <div className="data-row-title">@{d.domain}</div>
                  <div className="data-row-meta">signs in without review</div>
                </div>
                <div className="data-row-actions">
                  {confirming === d.domain ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate({ domain: d.domain }, {
                          onSuccess: () => {
                            notify(`New signups at ${d.domain} will wait for approval.`);
                            setConfirming(null);
                          },
                        })}
                      >
                        Remove
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm"
                              onClick={() => setConfirming(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={remove.isPending}
                      onClick={() => setConfirming(d.domain)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Removing one is not retroactive, and that is easy to assume wrongly. */}
      {confirming && (
        <Alert tone="info">
          Removing a domain only affects new signups. Anyone already using an
          account at {confirming} keeps it — suspend them individually if that is
          what you meant.
        </Alert>
      )}

      <form className="cluster" onSubmit={submit}>
        <div className="grow-field">
          <label className="input-label" htmlFor="new-domain">Allow a domain</label>
          <input
            id="new-domain"
            className="input-field"
            placeholder="niagaracollege.ca"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-describedby="new-domain-hint"
          />
          <p className="input-hint mt-xs" id="new-domain-hint">
            The part after the @. Everyone with an address there gets an active
            account immediately, without review.
          </p>
        </div>
        <button type="submit" className="btn btn-primary"
                disabled={add.isPending || !value.trim()}>
          {add.isPending ? 'Adding…' : 'Allow'}
        </button>
      </form>

      <Alert error={add.error ?? remove.error} />
    </div>
  );
}
