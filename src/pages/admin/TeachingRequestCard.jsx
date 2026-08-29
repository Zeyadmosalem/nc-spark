import { motion } from 'framer-motion';
import { useDecideTeachingRequest } from '../../hooks/useAdmin';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import { useToast } from '../../components/ui/toast-context';
export default function TeachingRequestCard({ request }) {
  const { notify } = useToast();
  const decide = useDecideTeachingRequest();

  // Deciding removes the row. Naming the outcome is the only way to tell an
  // approval from a denial after the fact.
  const decideWith = (decision) => decide.mutate(
    { requestId: request.id, decision },
    {
      onSuccess: () => notify(
        decision === 'approve'
          ? `${request.trainerName} now teaches ${request.courseTitle}.`
          : `Request from ${request.trainerName} denied.`,
      ),
    },
  );
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="card no-hover card-accent"
    >
      <div className="cluster-between">
        <div className="cluster">
          <div className="avatar" aria-hidden="true">{request.trainerAvatar}</div>
          <div>
            <div className="semibold">{request.trainerName}</div>
            <div className="text-sm muted-2">
              wants to teach <strong>{request.courseTitle || 'a deleted course'}</strong>
            </div>
          </div>
        </div>
        <div className="cluster">
          {/*
            Both are buttons, and the destructive one is outlined rather than
            plain text — a bare word beside a filled button does not read as a
            control at all, which is a poor way to present the only way to
            refuse a request.
          */}
          <Button variant="primary" size="sm" icon="done"
                  pending={decide.isPending} onClick={() => decideWith('approve')}>
            Approve
          </Button>
          <Button variant="danger" size="sm" icon="close"
                  disabled={decide.isPending} onClick={() => decideWith('deny')}>
            Deny
          </Button>
        </div>
      </div>
      <Alert error={decide.error} />
    </motion.div>
  );
}
