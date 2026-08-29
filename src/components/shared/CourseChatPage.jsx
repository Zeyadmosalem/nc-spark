import { useParams } from 'react-router-dom';
import { useCourseOutline } from '../../hooks/useCourses';
import PageHeader from '../ui/PageHeader';
import QueryError from './QueryError';
import PageSkeleton from '../ui/Skeleton';
import CourseTabs from './CourseTabs';
import CourseChat from './CourseChat';

/**
 * The staff view of one course's conversation.
 *
 * The chat existed only inside the course builder's body, below the materials
 * list and above the new-module form, so reaching it meant opening the edit
 * screen and scrolling past the module editor. A trainee had a tab for the
 * same thing. This is that tab, for the people who teach.
 */
export default function CourseChatPage({ backTo = '/trainer/courses' }) {
  const { courseId } = useParams();
  const course = useCourseOutline(courseId);

  if (course.isLoading) return <PageSkeleton label="Loading this course" />;
  if (course.error) {
    return (
      <div className="page-body">
        <QueryError error={course.error} what="this course" />
      </div>
    );
  }

  return (
    <div className="page-body stack-lg">
      <PageHeader
        eyebrow={course.data?.title ?? 'Course'}
        icon="support"
        title="Course chat"
        subtitle="Everyone learning and teaching this course can read this thread."
        backTo={backTo}
        backLabel="Back to courses"
      />

      <CourseTabs base={`${backTo}/${courseId}`} />

      {/* The PageHeader above is the title; the card does not repeat it. */}
      <CourseChat courseId={courseId} heading={null} />
    </div>
  );
}
