import { useUpdateCourse } from '../../hooks/useCourses';
import { useToast } from '../../components/ui/toast-context';
import CourseDialog from './CourseDialog';

/** The edit dialog owns its own mutation so its pending state is per-course. */
export default function EditDialog({ course, form, setForm, onClose }) {
  const { notify } = useToast();
  const update = useUpdateCourse();

  async function submit(e) {
    e.preventDefault();
    await update.mutateAsync({ id: course.id, ...form })
      .then(() => {
        notify('Course details saved.');
        onClose();
      })
      .catch(() => null);
  }

  return (
    <CourseDialog
      title={`Edit ${course.title}`}
      form={form}
      setForm={setForm}
      submitting={update.isPending}
      error={update.error}
      submitLabel="Save changes"
      onCancel={onClose}
      onSubmit={submit}
    />
  );
}
