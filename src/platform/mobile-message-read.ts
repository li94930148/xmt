export async function markMessagesReadIndividually(
  ids: number[],
  markRead: (id: number) => Promise<unknown>,
): Promise<{ succeededIds: number[]; failedIds: number[] }> {
  const settled = await Promise.allSettled(ids.map((id) => markRead(id)));
  return {
    succeededIds: ids.filter((_, index) => settled[index].status === 'fulfilled'),
    failedIds: ids.filter((_, index) => settled[index].status === 'rejected'),
  };
}
