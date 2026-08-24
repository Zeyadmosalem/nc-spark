import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../../hooks/useSession';
import { useUpdateMyProfile, useChangePassword } from '../../hooks/useAccount';
import Alert from '../../components/ui/Alert';
import PasswordField from '../../components/ui/PasswordField';
import StatusPill from '../../components/ui/StatusPill';
import PageSkeleton from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/toast-context';
import { fadeUp } from '../../lib/motion';

/**
 * Your own account. One page, mounted by all four role shells.
 *
 * Nothing in NC Spark could change a display name. The database has been ready
 * for this since M1 — `grant update (name, avatar) on public.profiles to
 * authenticated` and the profiles_update_self policy — and no screen ever
 * called it, so a trainee whose name was typed wrong at signup was stuck with
 * it, in every roster and every review queue a trainer reads.
 *
 * The grant names name and avatar exactly. Role, status and email are shown
 * here precisely because they are NOT writable: seeing them next to a field
 * that is editable is what makes it obvious which is which, and each says who
 * can change it instead of leaving the reader to guess.
 */

const ROLE_MEANS = {
  trainee: 'You take courses and your progress is recorded.',
  trainer: 'You own courses, write their content and mark written answers.',
  supervisor: 'You see cohort figures for the trainers assigned to you.',
  admin: 'You approve signups, assign roles and manage the curriculum.',
};

/** A short label for the circle in the sidebar — initials or a single emoji. */
const AVATAR_MAX = 4;

function Row({ label, value, note }) {
  return (
    <div style={{
      display: 'flex', gap: '1rem', alignItems: 'baseline',
      flexWrap: 'wrap', padding: '0.55rem 0',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{ width: 120, flexShrink: 0, fontSize: '0.82rem', color: 'var(--text-3)' }}>
        {label}
      </div>
      <div className="grow-field">
        <div className="semibold">{value}</div>
        {note && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: '0.15rem' }}>
            {note}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { profile, session } = useSession();

  if (!profile) return <PageSkeleton label="Loading your account" stats={0} rows={2} />;

  return (
    <motion.div
      className="page-body"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 720 }}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={fadeUp} custom={0}>
        <p className="eyebrow">Account</p>
        <h1 className="section-heading" style={{ marginBottom: '0.35rem' }}>
          Your details
        </h1>
        <p className="section-sub">
          How your name appears to everyone else, and how you sign in.
        </p>
      </motion.div>

      <motion.div variants={fadeUp} custom={1}>
        <IdentityCard profile={profile} />
      </motion.div>

      <motion.div variants={fadeUp} custom={2}>
        <AccessCard profile={profile} />
      </motion.div>

      <motion.div variants={fadeUp} custom={3}>
        <PasswordCard email={profile.email} lastSignIn={session?.user?.last_sign_in_at} />
      </motion.div>
    </motion.div>
  );
}

function IdentityCard({ profile }) {
  const { notify } = useToast();
  const save = useUpdateMyProfile();
  const [name, setName] = useState(profile.name ?? '');
  const [avatar, setAvatar] = useState(profile.avatar ?? '');

  const trimmedName = name.trim();
  const trimmedAvatar = avatar.trim();
  const dirty = trimmedName !== (profile.name ?? '')
    || trimmedAvatar !== (profile.avatar ?? '');

  // profiles.name is `not null default ''`, so a blank one stores happily and
  // then reads as an empty row in every roster a trainer opens.
  const problem = trimmedName === ''
    ? 'Your name is how you appear on every roster and review queue — it cannot be blank.'
    : trimmedAvatar.length > AVATAR_MAX
      ? `The badge holds ${AVATAR_MAX} characters or fewer.`
      : null;

  function submit(e) {
    e.preventDefault();
    save.mutate(
      { name: trimmedName, avatar: trimmedAvatar || null },
      { onSuccess: () => notify('Your details are saved.') },
    );
  }

  return (
    <form onSubmit={submit} className="card no-hover stack-md">
      <div className="card-title">Name and badge</div>

      <div className="cluster">
        <div className="grow-field">
          <label className="input-label" htmlFor="account-name">Display name</label>
          <input
            id="account-name" className="input-field" value={name}
            onChange={(e) => setName(e.target.value)}
            aria-describedby="account-name-hint"
          />
          <p className="input-hint mt-xs" id="account-name-hint">
            Trainers and administrators see this next to your work.
          </p>
        </div>

        <div className="field-sm">
          <label className="input-label" htmlFor="account-avatar">Badge</label>
          <input
            id="account-avatar" className="input-field" maxLength={AVATAR_MAX}
            placeholder={(trimmedName || '?').charAt(0).toUpperCase()}
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
          />
        </div>

        {/* The same circle the sidebar draws, so the effect of the field above
            is visible before it is saved rather than after. */}
        <div className="text-center">
          <div className="avatar" aria-hidden="true">
            {trimmedAvatar || (trimmedName || '?').charAt(0).toUpperCase()}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
            Preview
          </div>
        </div>
      </div>

      {problem && dirty && (
        <p className="text-xs warn m-0">{problem}</p>
      )}
      <Alert error={save.error} />

      <div>
        <button type="submit" className="btn btn-primary btn-sm"
                disabled={save.isPending || !dirty || Boolean(problem)}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function AccessCard({ profile }) {
  return (
    <div className="card no-hover">
      <div className="card-title">Your access</div>
      {/*
        Read-only, and said so. The column grant covers name and avatar only,
        so none of this could be changed here even if the page offered to —
        and a field that silently fails is worse than a line of text.
      */}
      <Row
        label="Email"
        value={profile.email}
        note="Used to sign in. An administrator changes this."
      />
      <Row
        label="Role"
        value={<span style={{ textTransform: 'capitalize' }}>{profile.role}</span>}
        note={ROLE_MEANS[profile.role] ?? 'Set by an administrator.'}
      />
      <Row
        label="Status"
        value={<StatusPill status={profile.status} />}
        note={profile.status === 'active'
          ? 'Your account is in full use.'
          : 'An administrator decides this.'}
      />
      {profile.createdAt && (
        <Row
          label="Joined"
          value={new Date(profile.createdAt).toLocaleDateString(undefined, {
            day: 'numeric', month: 'long', year: 'numeric',
          })}
        />
      )}
    </div>
  );
}

function PasswordCard({ email, lastSignIn }) {
  const { notify } = useToast();
  const change = useChangePassword();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);

  // Supabase's own floor. Saying it up front beats a rejection after typing
  // the same thing twice.
  const MIN = 6;
  const problem = password.length > 0 && password.length < MIN
    ? `Use at least ${MIN} characters.`
    : confirm.length > 0 && confirm !== password
      ? 'The two passwords do not match.'
      : null;

  const ready = password.length >= MIN && confirm === password;

  function submit(e) {
    e.preventDefault();
    change.mutate({ password }, {
      onSuccess: () => {
        notify('Your password is changed.');
        setPassword('');
        setConfirm('');
        setDone(true);
      },
    });
  }

  return (
    <form onSubmit={submit} className="card no-hover stack-md">
      <div className="card-title">Password</div>

      <p className="text-sm muted-2 m-0">
        You are signed in as {email}
        {lastSignIn && `, since ${new Date(lastSignIn).toLocaleString()}`}.
      </p>

      <div className="cluster">
        <div className="grow-field">
          <PasswordField
            label="New password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
          />
        </div>
        <div className="grow-field">
          <PasswordField
            label="Confirm it"
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
          />
        </div>
      </div>

      {problem && (
        <p className="text-xs warn m-0">{problem}</p>
      )}

      {/*
        A changed password does not sign other sessions out — Supabase keeps
        them until their refresh token expires. Somebody changing it because
        they think an account is compromised needs to know that.
      */}
      {done && (
        <Alert tone="success" title="Password changed">
          Any other browser already signed in to this account stays signed in
          until its session expires. Ask an administrator to suspend the account
          if you need those cut off now.
        </Alert>
      )}
      <Alert error={change.error} />

      <div>
        <button type="submit" className="btn btn-primary btn-sm"
                disabled={change.isPending || !ready}>
          {change.isPending ? 'Changing…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}
