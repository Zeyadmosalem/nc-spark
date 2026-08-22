import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { HttpError, type Profile } from './auth.ts';

export interface AuditEntry {
  actor: Pick<Profile, 'id' | 'email'>;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Appends an audit entry. Throws if the write fails.
 *
 * Callers must await this BEFORE reporting success: an action reported as done
 * with no audit trail is worse than one that failed loudly. actor_email is
 * denormalised so the entry stays readable after the account is deleted.
 */
export async function writeAudit(service: SupabaseClient, entry: AuditEntry): Promise<void> {
  const { error } = await service.from('audit_log').insert({
    actor_id: entry.actor.id,
    actor_email: entry.actor.email,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
  if (error) throw new Error(`audit write failed: ${error.message}`);
}

/**
 * Refuses to leave the system with no active administrator. Locking everyone
 * out of administration is unrecoverable without direct database access.
 */
export async function assertNotLastAdmin(
  service: SupabaseClient,
  targetId: string,
  targetRole: string,
): Promise<void> {
  if (targetRole !== 'admin') return;
  const { count } = await service
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('status', 'active');
  if ((count ?? 0) <= 1) {
    throw new HttpError(409, 'Cannot remove the last active admin');
  }
}
