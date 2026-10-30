export type HomeTaskCategory =
  | 'message'
  | 'sync'
  | 'attention'
  | 'retro-action'
  | 'review'
  | 'production-review'
  | 'draft'
  | 'publishing';

type HomeTaskProfile = {
  isManagementRole: boolean;
  isReviewFirst: boolean;
  limit?: number;
};

const managerFeaturedCategories: HomeTaskCategory[] = [
  'message',
  'sync',
  'attention',
  'retro-action',
  'review',
  'production-review',
  'publishing',
];

export function orderHomeTasks<T extends { category: HomeTaskCategory }>(
  tasks: readonly T[],
  { isManagementRole, isReviewFirst, limit = 6 }: HomeTaskProfile,
): T[] {
  const priority: Record<HomeTaskCategory, number> = isManagementRole
    ? { message: 0, sync: 1, attention: 2, 'retro-action': 3, review: 4, 'production-review': 5, publishing: 6, draft: 7 }
    : isReviewFirst
      ? { message: 6, sync: 6, attention: 2, 'retro-action': 3, review: 1, 'production-review': 0, publishing: 4, draft: 5 }
      : { message: 6, sync: 6, attention: 1, 'retro-action': 2, review: 4, 'production-review': 5, publishing: 3, draft: 0 };
  const ordered = [...tasks].sort((left, right) => priority[left.category] - priority[right.category]);

  const featuredCategories = isManagementRole
    ? managerFeaturedCategories
    : isReviewFirst
      ? ['production-review', 'review', 'attention', 'retro-action', 'publishing', 'draft', 'sync', 'message'] as HomeTaskCategory[]
      : ['draft', 'attention', 'retro-action', 'publishing', 'review', 'production-review', 'sync', 'message'] as HomeTaskCategory[];
  const featured = featuredCategories
    .map((category) => ordered.find((task) => task.category === category))
    .filter((task): task is T => Boolean(task));
  const featuredTasks = new Set(featured);
  const remainingPriority: Record<HomeTaskCategory, number> = isReviewFirst && !isManagementRole
    ? { draft: 0, 'production-review': 1, attention: 2, 'retro-action': 3, publishing: 4, review: 5, sync: 6, message: 6 }
    : priority;
  const remaining = ordered
    .filter((task) => !featuredTasks.has(task))
    .sort((left, right) => remainingPriority[left.category] - remainingPriority[right.category]);
  return [...featured, ...remaining].slice(0, limit);
}
