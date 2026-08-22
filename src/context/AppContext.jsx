import { createContext, useContext, useState, useEffect } from 'react';
import { USERS, COURSES, QUIZZES as DEFAULT_QUIZZES, CHAT_MESSAGES, PENDING_REQUESTS, getLevel, getLevelProgress, VIDEOS, ACTIVITIES, LEARNING_PATHS } from '../data/dummyData';

const AppContext = createContext(null);

export function AppProvider({ children, currentUser = null }) {
  // Auth now lives in useSession. This local copy exists only so the
  // not-yet-migrated mock mutations (XP, badges, quiz attempts) keep
  // working until each subsystem moves to the backend.
  const [localUser, setLocalUser] = useState(currentUser);
  const setCurrentUser = setLocalUser;
  useEffect(() => { setLocalUser(currentUser); }, [currentUser]);
  const [courses, setCourses] = useState(COURSES);
  const [quizzes, setQuizzes] = useState(() => {
    try {
      const raw = localStorage.getItem('nc_quizzes');
      return raw ? JSON.parse(raw) : DEFAULT_QUIZZES;
    } catch {
      return DEFAULT_QUIZZES;
    }
  });

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('nc_theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nc_theme', theme);
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem('nc_quizzes', JSON.stringify(quizzes)); } catch { /* ignore */ }
  }, [quizzes]);
  const [chatMessages, setChatMessages] = useState(CHAT_MESSAGES);
  const [videos] = useState(VIDEOS || []);
  const [pendingRequests, setPendingRequests] = useState(PENDING_REQUESTS);
  const [pendingCourseEnrollments, setPendingCourseEnrollments] = useState([]);
  const [pendingCourseTeachingRequests, setPendingCourseTeachingRequests] = useState([]);
  const [trainees, setTrainees] = useState(USERS.trainees);
  const [trainers, setTrainers] = useState(USERS.trainers);
  const [supervisors, setSupervisors] = useState(USERS.supervisors);
  const [notification, setNotification] = useState(null);
  const [activities, setActivities] = useState(ACTIVITIES);
  const [learningPaths] = useState(LEARNING_PATHS);

  function showNotification(msg) {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  }

  function toggleTheme() {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }

  function addXP(amount) {
    if (!localUser || localUser.role !== 'trainee') return;
    const prevLevel = getLevel(localUser.xp);
    const newXP = localUser.xp + amount;
    const newLevel = getLevel(newXP);
    const leveledUp = prevLevel.label !== newLevel.label;
    setCurrentUser((u) => ({ ...u, xp: newXP }));
    setTrainees((prev) => prev.map((s) => s.id === localUser.id ? { ...s, xp: newXP } : s));
    showNotification({ type: leveledUp ? 'levelup' : 'xp', amount, newLevel: newLevel.label });
  }

  function unlockBadge(badgeId) {
    if (!localUser || localUser.role !== 'trainee') return;
    if (localUser.badges.includes(badgeId)) return;
    const newBadges = [...localUser.badges, badgeId];
    setCurrentUser((u) => ({ ...u, badges: newBadges }));
    setTrainees((prev) => prev.map((s) => s.id === localUser.id ? { ...s, badges: newBadges } : s));
    showNotification({ type: 'badge', badgeId });
  }

  function sendChatMessage(courseId, text) {
    if (!localUser) return;
    const newMsg = {
      id: `m${Date.now()}`,
      userId: localUser.id,
      name: localUser.name,
      avatar: localUser.avatar,
      role: localUser.role,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isTrainer: localUser.role === 'trainer',
    };
    setChatMessages((prev) => ({ ...prev, [courseId]: [...(prev[courseId] || []), newMsg] }));
  }

  function submitQuizResult(quizId, score, total) {
    if (!localUser || localUser.role !== 'trainee') return;
    const quiz = quizzes[quizId];
    if (!quiz) {
      showNotification({ type: 'error', text: 'That quiz is no longer available.' });
      return;
    }
    // Fall back to the question count, and never divide by zero.
    const outOf = total || quiz.questions?.length || 0;
    const pct = outOf > 0 ? score / outOf : 0;
    const passed = pct >= (quiz.passMark ?? 0.7);
    const xpGained = passed ? 30 : 10;
    addXP(xpGained);
    if (pct >= 0.9) unlockBadge('badge_sharpshooter');
    if (pct >= 1.0) unlockBadge('badge_perfect');
    const existing = localUser.quizAttempts?.[quizId];
    const newAttempts = { ...localUser.quizAttempts, [quizId]: { attempts: (existing?.attempts || 0) + 1, score: Math.round(pct * 100), secondAttemptRequested: false, secondAttemptApproved: false } };
    setCurrentUser((u) => ({ ...u, quizAttempts: newAttempts }));
    setTrainees((prev) => prev.map((s) => s.id === localUser.id ? { ...s, quizAttempts: newAttempts } : s));
    
    // Auto complete the stage in the course if passed
    if (passed) {
      setCourses(prevCourses => prevCourses.map(c => {
        if (c.quizId === quizId) {
          const newStages = c.stages.map(s => s.type === 'quiz' ? { ...s, status: 'done' } : s);
          return { ...c, stages: newStages, progress: Math.min(100, c.progress + 15) };
        }
        return c;
      }));
    }
    return { passed, xpGained, pct };
  }

  function applyForCourse(courseId) {
    if (!localUser || localUser.role !== 'trainee') return;
    setPendingCourseEnrollments(prev => [...prev, { traineeId: localUser.id, courseId, requestedAt: new Date().toISOString() }]);
    showNotification({ type: 'info', text: 'Enrollment request sent to trainer.' });
  }

  function approveEnrollment(traineeId, courseId) {
    setPendingCourseEnrollments(prev => prev.filter(req => !(req.traineeId === traineeId && req.courseId === courseId)));
    setTrainees(prev => prev.map(t => {
      if (t.id === traineeId) {
        return { ...t, enrolledCourses: [...(t.enrolledCourses || []), courseId] };
      }
      return t;
    }));
    // If current user is the trainee being approved (e.g. for mock testing), update them too
    if (localUser?.id === traineeId) {
      setCurrentUser(u => ({ ...u, enrolledCourses: [...(u.enrolledCourses || []), courseId] }));
    }
    showNotification({ type: 'info', text: 'Trainee enrolled successfully.' });
  }

  // Trainer Teaching Requests
  function requestCourseTeaching(courseId) {
    if (!localUser || localUser.role !== 'trainer') return;
    setPendingCourseTeachingRequests(prev => [...prev, { trainerId: localUser.id, trainerName: localUser.name, courseId, requestedAt: new Date().toISOString() }]);
    showNotification({ type: 'info', text: 'Request to teach course submitted to Admin.' });
  }

  function approveTeachingRequest(trainerId, courseId) {
    setPendingCourseTeachingRequests(prev => prev.filter(req => !(req.trainerId === trainerId && req.courseId === courseId)));
    setTrainers(prev => prev.map(t => {
      if (t.id === trainerId) {
        return { ...t, courses: [...(t.courses || []), courseId] };
      }
      return t;
    }));
    // Assign trainer to the course
    setCourses(prev => prev.map(c => c.id === courseId ? { ...c, trainerId } : c));
    showNotification({ type: 'success', text: 'Trainer assigned to course successfully.' });
  }

  function submitQuizResultWithAnswers(quizId, score, total, answers) {
    const result = submitQuizResult(quizId, score, total);
    // store submission record for trainer review
    const submission = {
      id: `sub_${Date.now()}`,
      traineeId: localUser.id,
      traineeName: localUser.name,
      answers,
      score: Math.round((score / (total || 1)) * 100),
      createdAt: new Date().toISOString(),
      status: 'pending', // pending | reviewed
      feedback: null,
    };
    setQuizzes((prev) => {
      const q = prev[quizId] || {};
      const submissions = q.submissions ? [...q.submissions, submission] : [submission];
      return { ...prev, [quizId]: { ...q, submissions } };
    });
    showNotification({ type: 'info', text: 'Quiz submitted (preview stored for trainer review).' });
    return result;
  }

  function createQuiz(payload) {
    const id = `q${Date.now()}`;
    const q = { id, ...payload };
    setQuizzes((prev) => ({ ...prev, [id]: q }));
    showNotification({ type: 'success', text: 'Quiz created.' });
    return id;
  }

  function reviewSubmission(quizId, submissionId, updates) {
    setQuizzes((prev) => {
      const q = prev[quizId];
      if (!q) return prev;
      const submissions = (q.submissions || []).map((s) => s.id === submissionId ? { ...s, ...updates, status: updates.status || s.status } : s);
      return { ...prev, [quizId]: { ...q, submissions } };
    });
    showNotification({ type: 'success', text: 'Submission updated.' });
  }

  function assignQuizToCourse(courseId, quizId) {
    setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, quizId } : c));
  }

  function requestSecondAttempt(quizId) {
    if (!localUser) return;
    const quiz = quizzes[quizId];
    const course = courses.find((c) => c.quizId === quizId);
    const newReq = {
      id: `req${Date.now()}`,
      traineeId: localUser.id,
      traineeName: localUser.name,
      avatar: localUser.avatar,
      quizId,
      quizTitle: quiz.title,
      courseTitle: course?.title || '',
      score: localUser.quizAttempts?.[quizId]?.score || 0,
      requestedAt: new Date().toISOString().split('T')[0],
    };
    setPendingRequests((prev) => [...prev, newReq]);
    const updated = { ...localUser.quizAttempts, [quizId]: { ...localUser.quizAttempts[quizId], secondAttemptRequested: true } };
    setCurrentUser((u) => ({ ...u, quizAttempts: updated }));
    setTrainees((prev) => prev.map((s) => s.id === localUser.id ? { ...s, quizAttempts: updated } : s));
    showNotification({ type: 'info', text: 'Second attempt request sent to your trainer.' });
  }

  function approveSecondAttempt(requestId) {
    const req = pendingRequests.find((r) => r.id === requestId);
    if (!req) return;
    setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
    setTrainees((prev) => prev.map((s) => {
      if (s.id !== req.traineeId) return s;
      const updated = { ...s.quizAttempts, [req.quizId]: { ...s.quizAttempts[req.quizId], secondAttemptApproved: true } };
      return { ...s, quizAttempts: updated };
    }));
    showNotification({ type: 'success', text: `Approved second attempt for ${req.traineeName}` });
  }

  function denySecondAttempt(requestId) {
    setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
    showNotification({ type: 'info', text: 'Request denied.' });
  }

  // --- Admin CRUD Operations ---
  function addCourse(payload) {
    const id = `c${Date.now()}`;
    const newCourse = { id, ...payload, stages: [], improvementAreas: [], progress: 0 };
    setCourses(prev => [...prev, newCourse]);
    showNotification({ type: 'success', text: 'Course created.' });
    return id;
  }

  function updateCourse(courseId, updates) {
    setCourses(prev => prev.map(c => c.id === courseId ? { ...c, ...updates } : c));
    showNotification({ type: 'success', text: 'Course updated.' });
  }

  function deleteCourse(courseId) {
    setCourses(prev => prev.filter(c => c.id !== courseId));
    showNotification({ type: 'info', text: 'Course deleted.' });
  }

  function addQuiz(payload) {
    const id = `q${Date.now()}`;
    setQuizzes(prev => ({ ...prev, [id]: { id, questions: [], ...payload } }));
    showNotification({ type: 'success', text: 'Quiz created.' });
    return id;
  }

  function updateQuiz(quizId, updates) {
    setQuizzes(prev => {
      if (!prev[quizId]) return prev;
      return { ...prev, [quizId]: { ...prev[quizId], ...updates } };
    });
    showNotification({ type: 'success', text: 'Quiz updated.' });
  }

  function deleteQuiz(quizId) {
    setQuizzes(prev => {
      const next = { ...prev };
      delete next[quizId];
      return next;
    });
    showNotification({ type: 'info', text: 'Quiz deleted.' });
  }

  function addActivity(payload) {
    const id = `a${Date.now()}`;
    setActivities(prev => ({ ...prev, [id]: { id, ...payload } }));
    showNotification({ type: 'success', text: 'Activity created.' });
    return id;
  }

  function updateActivity(activityId, updates) {
    setActivities(prev => {
      if (!prev[activityId]) return prev;
      return { ...prev, [activityId]: { ...prev[activityId], ...updates } };
    });
    showNotification({ type: 'success', text: 'Activity updated.' });
  }

  function deleteActivity(activityId) {
    setActivities(prev => {
      const next = { ...prev };
      delete next[activityId];
      return next;
    });
    showNotification({ type: 'info', text: 'Activity deleted.' });
  }

  // --- Admin User Operations ---
  function addUser(role, payload) {
    const id = `${role.charAt(0)}${Date.now()}`;
    const newUser = { id, role, ...payload };
    if (role === 'trainee') {
      newUser.xp = 0; newUser.streak = 0; newUser.enrolledCourses = []; newUser.badges = []; newUser.activityCompletions = [];
      setTrainees(prev => [...prev, newUser]);
    } else if (role === 'trainer') {
      newUser.courses = [];
      setTrainers(prev => [...prev, newUser]);
    } else if (role === 'supervisor') {
      newUser.managedTrainers = [];
      setSupervisors(prev => [...prev, newUser]);
    }
    showNotification({ type: 'success', text: `${role} created.` });
    return id;
  }

  function updateUser(role, userId, updates) {
    if (role === 'trainee') setTrainees(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
    else if (role === 'trainer') setTrainers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
    else if (role === 'supervisor') setSupervisors(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
    showNotification({ type: 'success', text: `User updated.` });
  }

  function removeUser(role, userId) {
    if (role === 'trainee') setTrainees(prev => prev.filter(u => u.id !== userId));
    else if (role === 'trainer') setTrainers(prev => prev.filter(u => u.id !== userId));
    else if (role === 'supervisor') setSupervisors(prev => prev.filter(u => u.id !== userId));
    showNotification({ type: 'info', text: `User removed.` });
  }
  // -----------------------------

  // Activity completion
  function completeActivity(activityId) {
    if (!localUser || localUser.role !== 'trainee') return;
    if (localUser.activityCompletions?.includes(activityId)) return;

    const activity = activities[activityId];
    const xpGain = activity?.xp || 10;
    const prevCompletions = localUser.activityCompletions || [];
    const newCompletions = [...prevCompletions, activityId];

    setCurrentUser((u) => ({ ...u, activityCompletions: newCompletions }));
    setTrainees((prev) => prev.map((s) => s.id === localUser.id ? { ...s, activityCompletions: newCompletions } : s));
    addXP(xpGain);

    // A module counts as done when every one of its activities is either a
    // recorded completion or an attempted quiz.
    const isDone = (aId, completions) =>
      completions.includes(aId) || Boolean(quizzes[aId] && localUser.quizAttempts?.[aId]);

    // Only announce a module that THIS activity just completed. Previously
    // every module was re-checked on every completion, so any module already
    // finished was re-announced each time another activity was completed.
    for (const path of learningPaths) {
      for (const mod of path.modules) {
        if (!mod.activities.includes(activityId)) continue;
        const wasComplete = mod.activities.every((aId) => isDone(aId, prevCompletions));
        const nowComplete = mod.activities.every((aId) => isDone(aId, newCompletions));
        if (!wasComplete && nowComplete) {
          showNotification({ type: 'milestone', text: `Module "${mod.title}" complete! 🎉` });
        }
      }
    }
  }

  // Check if a module is unlocked for a trainee
  function isModuleUnlocked(pathId, moduleId) {
    const path = learningPaths.find((p) => p.id === pathId);
    if (!path) return false;
    const mod = path.modules.find((m) => m.id === moduleId);
    if (!mod) return false;
    if (!mod.unlockAfter) return true; // first module is always unlocked

    const prereq = path.modules.find((m) => m.id === mod.unlockAfter);
    if (!prereq) return true;

    const completions = localUser?.activityCompletions || [];
    return prereq.activities.every((aId) =>
      completions.includes(aId) || (quizzes[aId] && localUser?.quizAttempts?.[aId])
    );
  }

  // Supervisor: get team report
  function getTeamReport(supervisorId) {
    const supervisor = supervisors.find((s) => s.id === supervisorId);
    if (!supervisor) return null;

    const managedTrainerIds = supervisor.managedTrainers || [];
    const managedTrainersList = trainers.filter((t) => managedTrainerIds.includes(t.id));
    const allTrainees = trainees;

    const trainerReports = managedTrainersList.map((trainer) => {
      const trainerCourses = courses.filter((c) => c.trainerId === trainer.id);
      const courseIds = trainerCourses.map((c) => c.id);
      const enrolledTrainees = allTrainees.filter((t) =>
        t.enrolledCourses?.some((cId) => courseIds.includes(cId))
      );
      return {
        trainer,
        courses: trainerCourses,
        trainees: enrolledTrainees,
        avgXP: enrolledTrainees.length > 0 ? Math.round(enrolledTrainees.reduce((a, t) => a + t.xp, 0) / enrolledTrainees.length) : 0,
        totalTrainees: enrolledTrainees.length,
      };
    });

    return { supervisor, trainerReports };
  }

  const userLevel = localUser?.role === 'trainee' ? getLevel(localUser.xp) : null;
  const userLevelProgress = localUser?.role === 'trainee' ? getLevelProgress(localUser.xp) : 0;

  return (
    <AppContext.Provider value={{
      currentUser: localUser,
      courses, quizzes, chatMessages, activities, learningPaths,
      trainees, trainers, supervisors, pendingRequests, pendingCourseEnrollments, pendingCourseTeachingRequests,
      addXP, unlockBadge, sendChatMessage,
      approveEnrollment,
      requestCourseTeaching, approveTeachingRequest,
      addCourse,
      updateCourse,
      deleteCourse,
      addQuiz,
      updateQuiz,
      deleteQuiz,
      addActivity,
      updateActivity,
      deleteActivity,
      addUser,
      updateUser,
      removeUser,
      submitQuizResult, requestSecondAttempt,
      approveSecondAttempt, denySecondAttempt,
      notification, showNotification,
      theme, toggleTheme,
      userLevel, userLevelProgress,
      videos, createQuiz, assignQuizToCourse,
      submitQuizResultWithAnswers, reviewSubmission,
      completeActivity, isModuleUnlocked,
      getTeamReport, applyForCourse,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
