import { useQuery } from '@tanstack/react-query';
import {
  myTrainers, teamCourses, teamEnrollments, teamQuizAttempts,
} from '../api/supervisor';

export const supervisorKeys = {
  trainers: ['supervisor', 'trainers'],
  courses: (ids) => ['supervisor', 'courses', [...ids].sort()],
  enrollments: ['supervisor', 'enrollments'],
  attempts: ['supervisor', 'attempts'],
};

export const useMyTrainers = () =>
  useQuery({ queryKey: supervisorKeys.trainers, queryFn: myTrainers });

/**
 * Held until the trainer list arrives. teamCourses filters by the ids it is
 * given, so firing with [] would cache an empty team and briefly tell a
 * supervisor they manage nothing.
 */
export const useTeamCourses = (trainerIds) =>
  useQuery({
    queryKey: supervisorKeys.courses(trainerIds ?? []),
    queryFn: () => teamCourses(trainerIds),
    enabled: Array.isArray(trainerIds) && trainerIds.length > 0,
  });

export const useTeamEnrollments = () =>
  useQuery({ queryKey: supervisorKeys.enrollments, queryFn: teamEnrollments });

export const useTeamQuizAttempts = () =>
  useQuery({ queryKey: supervisorKeys.attempts, queryFn: teamQuizAttempts });
