import { getCollection, type CollectionEntry } from 'astro:content';
import { langOfId, type Lang } from './i18n';

export type Lesson = CollectionEntry<'lessons'>;

/** Lessons in one language, in course order. */
export async function getLessons(lang: Lang = 'en'): Promise<Lesson[]> {
  const all = await getCollection('lessons', (l) => langOfId(l.id) === lang && l.data.status === 'ready');
  return all.sort((a, b) => a.data.order - b.data.order);
}

/** URL slug of a lesson: its id without the language folder. */
export const slugOf = (lesson: Lesson) => lesson.id.split('/').pop()!;

export function groupByModule(lessons: Lesson[]): [string, Lesson[]][] {
  const map = new Map<string, Lesson[]>();
  for (const l of lessons) {
    if (!map.has(l.data.module)) map.set(l.data.module, []);
    map.get(l.data.module)!.push(l);
  }
  return [...map.entries()];
}
