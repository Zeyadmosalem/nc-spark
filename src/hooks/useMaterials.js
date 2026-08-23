import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listCourseMaterials, addMaterialFile, addMaterialLink, removeMaterial,
} from '../api/materials';

export const materialKeys = {
  forCourse: (courseId) => ['materials', courseId],
};

export const useCourseMaterials = (courseId) =>
  useQuery({
    queryKey: materialKeys.forCourse(courseId),
    queryFn: () => listCourseMaterials(courseId),
    enabled: Boolean(courseId),
  });

/**
 * All three writes change one course's list and nothing else, so the
 * invalidation is scoped to that course rather than to every material in the
 * app. courseId rides in the variables for exactly that reason.
 */
function useMaterialMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: materialKeys.forCourse(variables.courseId) });
    },
  });
}

export const useAddMaterialFile = () =>
  useMaterialMutation(({ courseId, file, name }) => addMaterialFile({ courseId, file, name }));

export const useAddMaterialLink = () =>
  useMaterialMutation(({ courseId, name, url }) => addMaterialLink({ courseId, name, url }));

export const useRemoveMaterial = () =>
  useMaterialMutation(({ id, storagePath }) => removeMaterial({ id, storagePath }));
