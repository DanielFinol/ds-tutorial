import { getCollection, type CollectionEntry } from 'astro:content';

export type Lesson = CollectionEntry<'lessons'>;

export async function getLessons(): Promise<Lesson[]> {
  const all = await getCollection('lessons');
  return all.sort((a, b) => a.data.order - b.data.order);
}

export function groupByModule(lessons: Lesson[]): [string, Lesson[]][] {
  const map = new Map<string, Lesson[]>();
  for (const l of lessons) {
    if (!map.has(l.data.module)) map.set(l.data.module, []);
    map.get(l.data.module)!.push(l);
  }
  return [...map.entries()];
}
