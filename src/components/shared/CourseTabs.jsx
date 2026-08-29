import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon';

/**
 * The three views of one course, for the people who run it.
 *
 * A trainer's course was three unrelated screens: the builder at the course
 * id, the roster at /people, and the chat buried inside the builder's body
 * between Materials and the new-module form — so the only way to reach a
 * conversation with a class was to open the edit screen and scroll past the
 * module editor. A trainee, meanwhile, had tabs.
 *
 * `base` is the course's path, which differs by role: a trainer edits at
 * /trainer/courses/:id and an admin at /admin/content/:id, and both mount the
 * same components underneath.
 */
export default function CourseTabs({ base }) {
  const tabs = [
    { to: base, end: true, icon: 'curriculum', label: 'Content' },
    { to: `${base}/people`, icon: 'users', label: 'People' },
    { to: `${base}/chat`, icon: 'support', label: 'Chat' },
  ];

  return (
    <nav className="segmented" aria-label="Course sections">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className="segment segment-link">
          <span className="segment-content">
            <Icon name={tab.icon} size={15} />
            {tab.label}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
