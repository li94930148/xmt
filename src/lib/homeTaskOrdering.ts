export type HomeTaskCategory =
  | 'message'
  | 'sync'
  | 'attention'
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
  'review',
  'production-review',
  'publishing',
];

export function orderHomeTasks<T extends { category: HomeTaskCategory }>(
  tasks: readonly T[],
  { isManagementRole, isReviewFirst, limit = 6 }: HomeTaskProfile,
): T[] {
  const priority: Record<HomeTaskCategory, number> = isManagementRole
    ? { message: 0, sync: 1, attention: 2, review: 3, 'production-review': 4, publishing: 5, draft: 6 }
    : isReviewFirst
      ? { message: 5, sync: 5, attention: 2, review: 1, 'production-review': 0, publishing: 3, draft: 4 }
      : { message: 5, sync: 5, attention: 1, review: 3, 'production-review': 4, publishing: 2, draft: 0 };
  const ordered = [...tasks].sort((left, right) => priority[left.category] - priority[right.category]);

  const featuredCategories = isManagementRole
    ? managerFeaturedCategories
    : isReviewFirst
      ? ['production-review', 'review', 'attention', 'publishing', 'draft', 'sync', 'message'] as HomeTaskCategory[]
      : ['draft', 'attention', 'publishing', 'review', 'production-review', 'sync', 'message'] as HomeTaskCategory[];
  const featured = featuredCategories
    .map((category) => ordered.find((task) => task.category === category))
    .filter((task): task is T => Boolean(task));
  const featuredTasks = new Set(featured);
  const remainingPriority: Record<HomeTaskCategory, number> = isReviewFirst && !isManagementRole
    ? { draft: 0, 'production-review': 1, attention: 2, publishing: 3, review: 4, sync: 5, message: 5 }
    : priority;
  const remaining = ordered
    .filter((task) => !featuredTasks.has(task))
    .sort((left, right) => remainingPriority[left.category] - remainingPriority[right.category]);
  return [...featured, ...remaining].slice(0, limit);
}
