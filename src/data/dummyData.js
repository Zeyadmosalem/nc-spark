// ============================================================
// NC SPARK — Dummy Data (replace with API calls when backend is ready)
// ============================================================

export const USERS = {
  admin: {
    id: 'u0',
    role: 'admin',
    name: 'Dr. Sarah Mitchell',
    avatar: 'SM',
    email: 'admin@ncspark.ca',
  },
  supervisors: [
    {
      id: 'sv1',
      role: 'supervisor',
      name: 'Dr. Nadia Al-Rashid',
      avatar: 'NR',
      email: 'n.alrashid@ncspark.ca',
      managedTrainers: ['t1', 't2'],
    },
  ],
  trainers: [
    {
      id: 't1',
      role: 'trainer',
      name: 'Prof. James Okafor',
      avatar: 'JO',
      email: 'j.okafor@ncspark.ca',
      courses: ['c1', 'c2'],
    },
    {
      id: 't2',
      role: 'trainer',
      name: 'Ms. Linda Zhao',
      avatar: 'LZ',
      email: 'l.zhao@ncspark.ca',
      courses: ['c3'],
    },
  ],
  trainees: [
    {
      id: 's1',
      role: 'trainee',
      name: 'Amira Al-Farhan',
      avatar: 'AA',
      email: 'amira@ncspark.ca',
      xp: 480,
      streak: 7,
      enrolledCourses: ['c1', 'c3'],
      badges: ['badge_streak7', 'badge_sharpshooter', 'badge_finisher'],
      quizAttempts: {
        'q1': { attempts: 1, score: 88, secondAttemptRequested: false, secondAttemptApproved: false },
        'q2': { attempts: 1, score: 62, secondAttemptRequested: true, secondAttemptApproved: false },
      },
      activityCompletions: ['a1', 'a2'],
    },
    {
      id: 's2',
      role: 'trainee',
      name: 'Marcus Thompson',
      avatar: 'MT',
      email: 'marcus@ncspark.ca',
      xp: 720,
      streak: 12,
      enrolledCourses: ['c1', 'c2'],
      badges: ['badge_streak7', 'badge_sharpshooter', 'badge_finisher', 'badge_perfect', 'badge_fastlearner'],
      quizAttempts: {
        'q1': { attempts: 1, score: 96, secondAttemptRequested: false, secondAttemptApproved: false },
      },
      activityCompletions: ['a1', 'a2', 'a3'],
    },
    {
      id: 's3',
      role: 'trainee',
      name: 'Priya Sharma',
      avatar: 'PS',
      email: 'priya@ncspark.ca',
      xp: 310,
      streak: 3,
      enrolledCourses: ['c1'],
      badges: ['badge_finisher'],
      quizAttempts: {
        'q1': { attempts: 2, score: 74, secondAttemptRequested: false, secondAttemptApproved: true },
      },
      activityCompletions: ['a1'],
    },
    {
      id: 's4',
      role: 'trainee',
      name: 'Carlos Mendes',
      avatar: 'CM',
      email: 'carlos@ncspark.ca',
      xp: 195,
      streak: 1,
      enrolledCourses: ['c1', 'c3'],
      badges: [],
      quizAttempts: {},
      activityCompletions: [],
    },
    {
      id: 's5',
      role: 'trainee',
      name: 'Yuki Tanaka',
      avatar: 'YT',
      email: 'yuki@ncspark.ca',
      xp: 850,
      streak: 20,
      enrolledCourses: ['c2', 'c3'],
      badges: ['badge_streak7', 'badge_sharpshooter', 'badge_finisher', 'badge_perfect', 'badge_fastlearner', 'badge_champion'],
      quizAttempts: {},
      activityCompletions: ['a1', 'a2', 'a3', 'a4', 'a5'],
    },
  ],
};


export const BADGES = {
  badge_streak7: { id: 'badge_streak7', icon: '🔥', label: '7-Day Streak', desc: 'Study 7 days in a row', xpReward: 50 },
  badge_sharpshooter: { id: 'badge_sharpshooter', icon: '🎯', label: 'Sharp Shooter', desc: 'Score 90%+ on any quiz', xpReward: 20 },
  badge_finisher: { id: 'badge_finisher', icon: '📘', label: 'Module Finisher', desc: 'Complete all stages in a module', xpReward: 20 },
  badge_fastlearner: { id: 'badge_fastlearner', icon: '⚡', label: 'Fast Learner', desc: 'Complete a quiz in under 3 minutes', xpReward: 20 },
  badge_perfect: { id: 'badge_perfect', icon: '💎', label: 'Perfect Score', desc: 'Score 100% on any quiz', xpReward: 30 },
  badge_champion: { id: 'badge_champion', icon: '🏆', label: 'Quiz Champion', desc: 'Pass 5 quizzes without a second attempt', xpReward: 40 },
  badge_streak30: { id: 'badge_streak30', icon: '🌟', label: '30-Day Legend', desc: 'Study 30 days in a row', xpReward: 100 },
  badge_completer: { id: 'badge_completer', icon: '🎓', label: 'Course Completer', desc: 'Finish an entire course', xpReward: 60 },
  badge_pathmaster: { id: 'badge_pathmaster', icon: '🗺️', label: 'Path Master', desc: 'Complete an entire learning path', xpReward: 80 },
};

export const LEVELS = [
  { min: 0, max: 99, label: 'Seedling', icon: '🌱', color: '#7fb88a' },
  { min: 100, max: 299, label: 'Apprentice', icon: '📖', color: '#003E7E' },
  { min: 300, max: 599, label: 'Trainee', icon: '⚡', color: '#002F6C' },
  { min: 600, max: 999, label: 'Expert', icon: '🔥', color: '#00A3E0' },
  { min: 1000, max: Infinity, label: 'Master', icon: '🏆', color: '#e8b34d' },
];

export function getLevel(xp) {
  return LEVELS.find((l) => xp >= l.min && xp <= l.max) || LEVELS[0];
}

export function getLevelProgress(xp) {
  const level = getLevel(xp);
  if (level.max === Infinity) return 100;
  const range = level.max - level.min;
  const progress = xp - level.min;
  return Math.round((progress / range) * 100);
}

export const COURSES = [
  {
    id: 'c1',
    title: 'Health and Safety (H&S)',
    subtitle: 'H&S Fundamentals',
    trainerId: 't1',
    color: '#002F6C',
    icon: '🏥',
    totalModules: 11,
    description: 'Learn the core principles of workplace health and safety, hazard identification, and compliance.',
    stages: [
      { id: 1, label: 'Start Module', status: 'done' },
      { id: 2, label: 'Learning Objectives', status: 'done' },
      { id: 3, label: 'Pre-Assessment', status: 'done' },
      { id: 4, label: 'Instructor Video', status: 'done' },
      { id: 5, label: 'Interactive Presentation', status: 'done' },
      { id: 6, label: 'Practice Activities', status: 'done' },
      { id: 7, label: 'Mini Quiz', status: 'current' },
      { id: 8, label: 'Reflection Activity', status: 'locked' },
      { id: 9, label: 'Trainer Feedback', status: 'locked' },
      { id: 10, label: 'Gamification Rewards', status: 'locked' },
      { id: 11, label: 'Unlock Next Lesson', status: 'locked' },
    ],
    progress: 68,
    videoId: 'PkZNo7MFNFg',
    videoTitle: 'H&S Crash Course — Hazard Identification',
    quizId: 'q1',
    activityId: 'a2',
    improvementAreas: [
      { topic: 'Risk Assessment', score: 54 },
      { topic: 'Emergency Protocols', score: 61 },
      { topic: 'Compliance Laws', score: 43 },
    ],
    materials: [
      { name: 'H&S Guidelines Manual', type: 'pdf', size: '2.4 MB' },
      { name: 'Hazard Checklist Template', type: 'pdf', size: '1.1 MB' },
      { name: 'First Aid Overview Slides', type: 'pptx', size: '5.6 MB' },
      { name: 'OSHA Regulations Website', type: 'link', size: 'Reference' }
    ]
  },
  {
    id: 'c2',
    title: 'Business Administration (BUS)',
    subtitle: 'BUS Essentials',
    trainerId: 't1',
    color: '#003E7E',
    icon: '💼',
    totalModules: 14,
    description: 'Master the fundamentals of business administration, organizational behavior, and efficient workflow management.',
    stages: [
      { id: 1, label: 'Start Module', status: 'done' },
      { id: 2, label: 'Learning Objectives', status: 'done' },
      { id: 3, label: 'Pre-Assessment', status: 'done' },
      { id: 4, label: 'Instructor Video', status: 'current' },
      { id: 5, label: 'Interactive Presentation', status: 'locked' },
      { id: 6, label: 'Practice Activities', status: 'locked' },
      { id: 7, label: 'Mini Quiz', status: 'locked' },
      { id: 8, label: 'Reflection Activity', status: 'locked' },
      { id: 9, label: 'Trainer Feedback', status: 'locked' },
      { id: 10, label: 'Gamification Rewards', status: 'locked' },
      { id: 11, label: 'Unlock Next Lesson', status: 'locked' },
    ],
    progress: 32,
    videoId: 'RBSGKlAvoiM',
    videoTitle: 'Business Administration — Operations & Strategy',
    quizId: 'q3',
    activityId: 'a1',
    improvementAreas: [
      { topic: 'Project Management', score: 48 },
      { topic: 'Data Analysis', score: 55 },
    ],
    materials: [
      { name: 'Business Administration Guidebook', type: 'pdf', size: '3.8 MB' },
      { name: 'Strategic Planning Template', type: 'docx', size: '820 KB' },
      { name: 'Intro to Corporate Finance Slides', type: 'pptx', size: '10.2 MB' }
    ]
  },
  {
    id: 'c3',
    title: 'Supply Chain Management (SCM)',
    subtitle: 'SCM Operations',
    trainerId: 't2',
    color: '#00A3E0',
    icon: '📦',
    totalModules: 9,
    description: 'Understand the end-to-end supply chain processes, from procurement and logistics to inventory control.',
    stages: [
      { id: 1, label: 'Start Module', status: 'done' },
      { id: 2, label: 'Learning Objectives', status: 'done' },
      { id: 3, label: 'Pre-Assessment', status: 'done' },
      { id: 4, label: 'Instructor Video', status: 'done' },
      { id: 5, label: 'Interactive Presentation', status: 'done' },
      { id: 6, label: 'Practice Activities', status: 'done' },
      { id: 7, label: 'Mini Quiz', status: 'done' },
      { id: 8, label: 'Reflection Activity', status: 'current' },
      { id: 9, label: 'Trainer Feedback', status: 'locked' },
      { id: 10, label: 'Gamification Rewards', status: 'locked' },
      { id: 11, label: 'Unlock Next Lesson', status: 'locked' },
    ],
    progress: 85,
    videoId: 'c9Wg6Cb_YlU',
    videoTitle: 'SCM Fundamentals — Procurement to Delivery',
    quizId: 'q2',
    activityId: 'a3',
    improvementAreas: [
      { topic: 'Logistics Mapping', score: 70 },
    ],
    materials: [
      { name: 'Procurement Strategy Document', type: 'pdf', size: '1.9 MB' },
      { name: 'SCM Flowchart Layout', type: 'pdf', size: '2.1 MB' },
      { name: 'Inventory Logistics Tracker', type: 'xlsx', size: '1.4 MB' }
    ]
  },
];

export const QUIZZES = {
  q1: {
    id: 'q1',
    courseId: 'c1',
    title: 'Mini Quiz — Loops & Iteration',
    timeLimit: 600,
    passMark: 0.7,
    questions: [
      {
        id: 'q1_1',
        type: 'mcq',
        prompt: 'Which loop guarantees at least one execution of its body?',
        options: ['for', 'while', 'do...while', 'forEach'],
        correct: 2,
        explanation: 'A do...while loop checks its condition AFTER the first execution, ensuring the body runs at least once.',
      },
      {
        id: 'q1_2',
        type: 'truefalse',
        prompt: 'In JavaScript, a for...of loop can iterate over plain objects.',
        correct: false,
        explanation: 'for...of works on iterables (arrays, strings, Maps, Sets). Plain objects are not iterable by default.',
      },
      {
        id: 'q1_3',
        type: 'mcq',
        prompt: 'What does the break statement do inside a loop?',
        options: [
          'Skips the current iteration and continues',
          'Exits the loop immediately',
          'Restarts the loop from the beginning',
          'Pauses execution for 1 second',
        ],
        correct: 1,
        explanation: 'break immediately terminates the loop and continues with the code after it.',
      },
      {
        id: 'q1_4',
        type: 'truefalse',
        prompt: 'The continue statement in a loop skips the rest of the current iteration.',
        correct: true,
        explanation: 'continue skips the remaining code in the current iteration and proceeds to the next one.',
      },
      {
        id: 'q1_5',
        type: 'mcq',
        prompt: 'Which array method creates a new array with the results of calling a function on every element?',
        options: ['forEach', 'filter', 'map', 'reduce'],
        correct: 2,
        explanation: 'Array.map() transforms each element and returns a new array of the same length.',
      },
      {
        id: 'q1_6',
        type: 'paragraph',
        prompt: 'In your own words, explain the difference between a for loop and a while loop. When would you choose one over the other?',
        guidance: 'Write at least 3 sentences. Your trainer will review this response.',
      },
    ],
  },
  q2: {
    id: 'q2',
    courseId: 'c3',
    title: 'Quiz — UX Principles & Heuristics',
    timeLimit: 480,
    passMark: 0.7,
    questions: [
      {
        id: 'q2_1',
        type: 'mcq',
        prompt: 'How many usability heuristics did Jakob Nielsen define?',
        options: ['5', '8', '10', '12'],
        correct: 2,
        explanation: 'Nielsen\'s 10 Usability Heuristics are the most widely used guidelines in UX design.',
      },
      {
        id: 'q2_2',
        type: 'truefalse',
        prompt: 'A high-fidelity prototype always requires real code to build.',
        correct: false,
        explanation: 'Hi-fi prototypes can be built in design tools like Figma or Adobe XD without any code.',
      },
      {
        id: 'q2_3',
        type: 'paragraph',
        prompt: 'Describe a real-world example where poor UX design caused a significant user problem. What would you have done differently?',
        guidance: 'Think of an app, website, or physical product. Be specific.',
      },
    ],
  },
  q3: {
    id: 'q3',
    courseId: 'c2',
    title: 'Quiz — Arrays & Linked Lists',
    timeLimit: 720,
    passMark: 0.75,
    questions: [
      {
        id: 'q3_1',
        type: 'mcq',
        prompt: 'What is the time complexity of accessing an element by index in an array?',
        options: ['O(n)', 'O(log n)', 'O(1)', 'O(n²)'],
        correct: 2,
        explanation: 'Arrays have O(1) random access because elements are stored contiguously in memory.',
      },
      {
        id: 'q3_2',
        type: 'truefalse',
        prompt: 'A singly linked list allows traversal in both forward and backward directions.',
        correct: false,
        explanation: 'Singly linked lists only traverse forward. You need a doubly linked list for bidirectional traversal.',
      },
    ],
  },
};

export const CHAT_MESSAGES = {
  c1: [
    { id: 'm1', userId: 't1', name: 'Prof. James Okafor', avatar: 'JO', role: 'trainer', text: 'Welcome everyone to the JavaScript Fundamentals chat! Feel free to ask questions here.', time: '9:00 AM', isTrainer: true },
    { id: 'm2', userId: 's1', name: 'Amira Al-Farhan', avatar: 'AA', role: 'trainee', text: 'Thank you! Quick question — is the mini quiz on loops open book?', time: '9:15 AM' },
    { id: 'm3', userId: 't1', name: 'Prof. James Okafor', avatar: 'JO', role: 'trainer', text: 'Good question Amira. No, it\'s closed book — but you can use the practice exercises as preparation.', time: '9:18 AM', isTrainer: true },
    { id: 'm4', userId: 's2', name: 'Marcus Thompson', avatar: 'MT', role: 'trainee', text: 'I found the do...while section confusing. Can we get a quick recap?', time: '10:02 AM' },
    { id: 'm5', userId: 't1', name: 'Prof. James Okafor', avatar: 'JO', role: 'trainer', text: 'Great point Marcus. I\'ll post a short video explanation by Friday. Meanwhile check the MDN docs link in the lesson.', time: '10:10 AM', isTrainer: true },
    { id: 'm6', userId: 's3', name: 'Priya Sharma', avatar: 'PS', role: 'trainee', text: 'Thank you prof! The practice activities were really helpful 😊', time: '11:30 AM' },
  ],
  c2: [
    { id: 'm1', userId: 't1', name: 'Prof. James Okafor', avatar: 'JO', role: 'trainer', text: 'Welcome to DSA! This is a challenging but incredibly rewarding course. Let\'s support each other.', time: '8:00 AM', isTrainer: true },
    { id: 'm2', userId: 's2', name: 'Marcus Thompson', avatar: 'MT', role: 'trainee', text: 'Excited for this one. Big O notation is something I\'ve always wanted to master.', time: '8:30 AM' },
  ],
  c3: [
    { id: 'm1', userId: 't2', name: 'Ms. Linda Zhao', avatar: 'LZ', role: 'trainer', text: 'Hello designers! This is our course chat — share your prototype links here for peer feedback.', time: '9:00 AM', isTrainer: true },
    { id: 'm2', userId: 's1', name: 'Amira Al-Farhan', avatar: 'AA', role: 'trainee', text: 'Here\'s my wireframe draft for the reflection activity: [figma link placeholder]', time: '2:15 PM' },
    { id: 'm3', userId: 's4', name: 'Carlos Mendes', avatar: 'CM', role: 'trainee', text: 'The Figma handoff section was really eye-opening!', time: '3:00 PM' },
  ],
};

export const PENDING_REQUESTS = [
  { id: 'req1', traineeId: 's1', traineeName: 'Amira Al-Farhan', avatar: 'AA', quizId: 'q2', quizTitle: 'Quiz — UX Principles & Heuristics', courseTitle: 'UX Design Principles', score: 62, requestedAt: '2026-07-11' },
];

export const ADMIN_STATS = {
  totalTrainees: 5,
  totalTrainers: 2,
  totalSupervisors: 1,
  totalCourses: 3,
  activeToday: 4,
  avgCompletion: 61,
  quizPassRate: 78,
};

export const VIDEOS = [
  {
    id: 'v1',
    title: 'Types of Concrete',
    source: 'youtube',
    videoId: 'sNMOuh6hh54',
    description: 'Three main constituents are actually enough to produce concrete: Binder (cement), Aggregate, and Water. Due to continually increasing demands for concrete quality and advances in admixture and concrete technology, many different kinds of concrete are now possible.',
  },
];

// ============================================================
// Activities (Phase 3+4)
// ============================================================
export const ACTIVITIES = {
  a1: {
    id: 'a1', type: 'video', title: 'Intro to Variables & Data Types',
    xp: 10, videoId: 'PkZNo7MFNFg', duration: '12:30',
    description: 'Learn the fundamental building blocks of JavaScript: variables, constants, and primitive data types.',
  },
  a2: {
    id: 'a2', type: 'reading', title: 'The Complete Guide to Data Types',
    xp: 8, estimatedMinutes: 5,
    content: `## Understanding Data Types in JavaScript

JavaScript has seven primitive data types and one complex type. Understanding these is critical before moving on to more advanced concepts.

### Primitive Types

**String** — Represents textual data. Strings are created using single quotes, double quotes, or backticks (template literals).

**Number** — Represents both integers and floating-point numbers. JavaScript uses 64-bit floating point format (IEEE 754).

**Boolean** — Has only two values: \`true\` and \`false\`. Often used in conditional logic and comparisons.

**Undefined** — A variable that has been declared but not assigned a value automatically has the value \`undefined\`.

**Null** — Represents the intentional absence of any value. It's an assignment value that means "no value."

**Symbol** — Introduced in ES6, symbols are unique and immutable primitive values, often used as object property keys.

**BigInt** — Allows representation of integers larger than 2^53 - 1, which is the limit for regular Number type.

### The typeof Operator

You can check the type of a value using the \`typeof\` operator. Note that \`typeof null\` returns "object" — this is a known bug in JavaScript that exists for historical reasons.

### Type Coercion

JavaScript is a dynamically typed language, which means variables can change types. Type coercion happens when JavaScript automatically converts one data type to another. This can be explicit (using functions like \`Number()\`, \`String()\`) or implicit (like when using \`==\` instead of \`===\`).

### Best Practices

- Always use \`const\` by default, \`let\` when you need to reassign
- Use \`===\` (strict equality) instead of \`==\` (loose equality)
- Be aware of truthy and falsy values in conditional statements
- Use template literals for string concatenation`,
  },
  a3: {
    id: 'a3', type: 'flashcards', title: 'JavaScript Keywords Flashcards',
    xp: 12,
    cards: [
      { front: 'What does `const` do?', back: 'Declares a block-scoped constant. The value cannot be reassigned after initialization.' },
      { front: 'What is `typeof`?', back: 'An operator that returns a string indicating the type of the operand.' },
      { front: 'What does `===` check?', back: 'Strict equality — checks both value AND type without coercion.' },
      { front: 'What is `NaN`?', back: 'Not-a-Number. A value resulting from invalid mathematical operations. NaN !== NaN is true.' },
      { front: 'What does `Array.prototype.map()` do?', back: 'Creates a new array populated with results of calling a provided function on every element.' },
      { front: 'What is a closure?', back: 'A function that has access to variables from its outer (enclosing) scope, even after the outer function has returned.' },
    ],
  },
  a4: {
    id: 'a4', type: 'matching', title: 'Match Data Types to Descriptions',
    xp: 15,
    pairs: [
      { term: 'String', definition: 'Textual data enclosed in quotes' },
      { term: 'Number', definition: '64-bit floating point numeric value' },
      { term: 'Boolean', definition: 'Logical true or false value' },
      { term: 'Undefined', definition: 'Variable declared but not assigned' },
      { term: 'Null', definition: 'Intentional absence of value' },
      { term: 'Symbol', definition: 'Unique and immutable identifier' },
    ],
  },
  a5: {
    id: 'a5', type: 'scenario', title: 'Debug the Login Function',
    xp: 20,
    description: 'You\'re a junior developer and your team lead has asked you to fix a bug in the login function.',
    steps: [
      {
        id: 'step1',
        text: 'A user reports that they can\'t log in even with the correct password. You check the login function and see:\n\n```js\nif (password == storedHash) { grant_access(); }\n```\n\nWhat\'s the most likely issue?',
        choices: [
          { id: 'a', text: 'The == operator is comparing a plain password to a hash — types differ', isCorrect: true, feedback: 'Correct! The loose equality `==` tries type coercion, but the real issue is comparing a plain password to a hash. You need to hash the input first.' },
          { id: 'b', text: 'The function grant_access() doesn\'t exist', isCorrect: false, feedback: 'Not quite. While possible, the question says the function exists. The comparison itself is the problem.' },
          { id: 'c', text: 'The password variable is undefined', isCorrect: false, feedback: 'The user is entering a password, so it\'s being passed. The comparison logic is the issue.' },
        ],
      },
      {
        id: 'step2',
        text: 'Good catch! Now your team lead asks you to also add rate limiting. After 5 failed attempts, the account should be locked for 15 minutes. How would you approach this?',
        choices: [
          { id: 'a', text: 'Store attempt count in localStorage on the client', isCorrect: false, feedback: 'Client-side rate limiting can be easily bypassed. An attacker could simply clear localStorage.' },
          { id: 'b', text: 'Track attempts server-side with timestamps per user/IP', isCorrect: true, feedback: 'Excellent! Server-side tracking is the secure approach. Store attempt count + last attempt timestamp, then check both before processing login.' },
          { id: 'c', text: 'Add a CAPTCHA after every login attempt', isCorrect: false, feedback: 'While CAPTCHAs help, they don\'t address rate limiting. A CAPTCHA after 3 attempts combined with server-side tracking would be better.' },
        ],
      },
    ],
  },
  a6: {
    id: 'a6', type: 'video', title: 'Understanding Async/Await',
    xp: 10, videoId: 'V_Kr9OSfDeU', duration: '15:00',
    description: 'Deep dive into asynchronous JavaScript — promises, async functions, and error handling patterns.',
  },
  a7: {
    id: 'a7', type: 'submission', title: 'Mini Project: Code Sandbox',
    xp: 35,
    description: 'Create a small JavaScript program demonstrating functions and scope. Zip your project files and upload them below.',
  },
};

// ============================================================
// Learning Paths (Phase 3)
// ============================================================
export const LEARNING_PATHS = [
  {
    id: 'lp1',
    title: 'JavaScript Fundamentals',
    description: 'Master the core concepts of JavaScript from basics to async programming.',
    courseId: 'c1',
    icon: '⚙️',
    modules: [
      { id: 'm1', title: 'Variables & Data Types', activities: ['a1', 'a2', 'q1'], unlockAfter: null },
      { id: 'm2', title: 'Functions & Scope', activities: ['a3', 'a4', 'a7'], unlockAfter: 'm1' },
      { id: 'm3', title: 'Async Programming', activities: ['a5', 'a6', 'q3'], unlockAfter: 'm2' },
    ],
  },
  {
    id: 'lp2',
    title: 'UX Design Mastery',
    description: 'From wireframes to prototypes — learn user-centered design.',
    courseId: 'c3',
    icon: '🎨',
    modules: [
      { id: 'm4', title: 'UX Fundamentals', activities: ['a1'], unlockAfter: null },
      { id: 'm5', title: 'Heuristics & Testing', activities: ['q2'], unlockAfter: 'm4' },
    ],
  },
];
