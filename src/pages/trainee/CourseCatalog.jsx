import { useCourses, useMyEnrollments, useApplyForCourse } from '../../hooks/useCourses';
import QueryError from '../../components/shared/QueryError';

export default function CourseCatalog() {
  const { data: courses, isLoading, error } = useCourses();
  const { data: enrollments, isLoading: enrollmentsLoading, error: enrollmentsError } =
    useMyEnrollments();
  const apply = useApplyForCourse();

  // Enrolment state decides both which courses appear here and whether their
  // button is live. Rendering before it lands offers "Apply to enrol" on a
  // course the trainee already holds, and the click fails on the unique index.
  if (isLoading || enrollmentsLoading) {
    return <div className="page-body" role="status">Loading courses…</div>;
  }

  const failure = error ?? enrollmentsError;
  if (failure) {
    return (
      <div className="page-body">
        <QueryError error={failure} what="the catalog" />
      </div>
    );
  }

  const byCourse = new Map((enrollments ?? []).map((e) => [e.courseId, e]));
  // Anything already active or completed belongs in My Courses, not here.
  const available = (courses ?? []).filter((c) => {
    const status = byCourse.get(c.id)?.status;
    return status !== 'active' && status !== 'completed';
  });

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <p className="eyebrow">Course Catalog</p>
        <h1 className="section-heading">Browse Available Courses</h1>
        <p className="section-sub">Apply to join. Your trainer approves each request.</p>
      </div>

      {apply.error && (
        <div role="alert" style={{ color: 'var(--brand-accent)', fontSize: '0.85rem' }}>
          {apply.error.message}
        </div>
      )}

      {available.length === 0 ? (
        <div className="card no-hover" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-2)' }}>No further courses are available to you right now.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {available.map((course) => {
            const isPending = byCourse.get(course.id)?.status === 'pending';
            const accent = course.color || '#002F6C';
            return (
              <div key={course.id} className="course-card">
                <div className="course-card-header"
                     style={{ background: `linear-gradient(145deg, ${accent}dd, ${accent}aa)` }}>
                  <div className="course-card-icon">{course.icon || '📘'}</div>
                  <div className="course-card-title">{course.title}</div>
                  <div className="course-card-subtitle">{course.subtitle}</div>
                </div>
                <div className="course-card-body">
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                    {course.description}
                  </p>
                </div>
                <div className="course-card-footer">
                  <button
                    className={`btn btn-block btn-sm ${isPending ? 'btn-ghost' : 'btn-primary'}`}
                    disabled={isPending || apply.isPending}
                    onClick={() => apply.mutate(course.id)}
                  >
                    {isPending ? 'Awaiting approval' : 'Apply to enrol'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
