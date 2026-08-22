// Converts the prototype's dummyData catalog into real rows.
// Idempotent: re-running replaces the seeded courses rather than duplicating.
//
// Usage: npm run db:seed-catalog

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { COURSES, LEARNING_PATHS, ACTIVITIES } from '../src/data/dummyData.js';

// Prefer a local stack if one is configured, matching the test harness.
const envFile = existsSync('.env.test.local') ? '.env.test.local' : '.env.test';
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const svc = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const slugFor = (c) => c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The prototype's activity shapes map onto the typed content column. Each key
// here is required by the per-type CHECK constraint on activities.content.
function contentFor(a) {
  switch (a.type) {
    case 'video':      return { videoId: a.videoId, duration: a.duration, description: a.description };
    case 'reading':    return { body: a.content, estimatedMinutes: a.estimatedMinutes };
    case 'flashcards': return { cards: a.cards };
    case 'matching':   return { pairs: a.pairs };
    case 'scenario':   return { steps: a.steps, description: a.description };
    case 'submission': return { description: a.description };
    default:           return {};
  }
}

async function main() {
  const { data: adminProfile } = await svc
    .from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle();
  const createdBy = adminProfile?.id ?? null;

  for (const course of COURSES) {
    const slug = slugFor(course);

    // Replace rather than duplicate. Cascades remove modules and activities.
    await svc.from('courses').delete().eq('slug', slug);

    const { data: row, error } = await svc.from('courses').insert({
      slug,
      title: course.title,
      subtitle: course.subtitle,
      description: course.description,
      color: course.color,
      icon: course.icon,
      created_by: createdBy,
    }).select().single();
    if (error) throw error;

    // Learning paths are collapsed into the course: a path's modules become
    // the course's modules.
    const path = LEARNING_PATHS.find((p) => p.courseId === course.id);
    const modules = path?.modules ?? [{ title: 'Course Content', activities: [] }];

    let modulePosition = 0;
    let activityCount = 0;
    for (const mod of modules) {
      modulePosition += 1;
      const { data: modRow, error: modErr } = await svc.from('modules').insert({
        course_id: row.id, title: mod.title, position: modulePosition,
      }).select().single();
      if (modErr) throw modErr;

      let activityPosition = 0;
      for (const activityId of mod.activities ?? []) {
        const a = ACTIVITIES[activityId];
        if (!a) continue; // quiz ids live in QUIZZES and arrive with M4
        activityPosition += 1;
        activityCount += 1;
        const { error: actErr } = await svc.from('activities').insert({
          module_id: modRow.id,
          type: a.type,
          title: a.title,
          position: activityPosition,
          xp: a.xp ?? 10,
          content: contentFor(a),
        });
        if (actErr) throw actErr;
      }
    }

    // Materials become external links for now; file upload lands in M3.
    for (const mat of course.materials ?? []) {
      const isLink = mat.type === 'link';
      await svc.from('course_materials').insert({
        course_id: row.id,
        name: mat.name,
        kind: isLink ? 'link' : mat.type,
        external_url: isLink ? 'https://example.com/placeholder' : null,
        storage_path: isLink ? null : `${row.id}/${mat.name}`,
        uploaded_by: createdBy,
      });
    }

    // Only publish what publish-course itself would allow. Seeding an empty
    // course as published would put something in the catalog that a trainee
    // can enrol in and then find nothing to do.
    if (activityCount > 0) {
      await svc.from('courses').update({ status: 'published' }).eq('id', row.id);
    }

    console.log(
      `seeded ${slug}  (${modulePosition} modules, ${activityCount} activities` +
      `${activityCount > 0 ? ', published' : ', left as draft — no activities'})`
    );
  }

  const { count } = await svc.from('courses').select('id', { count: 'exact', head: true });
  console.log(`done. ${count} courses in the catalog.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
