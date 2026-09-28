type TopicWorkflowState = 'shooting' | 'publishing' | string;

type WorkflowLookupResult = { data: Array<{ id: number }> };

type WorkflowLookups = {
  getShooting: (topicId: number) => Promise<WorkflowLookupResult>;
  getPublishing: (topicId: number) => Promise<WorkflowLookupResult>;
};

/** Resolve workflow detail routes with the workflow record ID, not the topic ID. */
export async function getKanbanTopicDestination(
  topic: { id: number; status: TopicWorkflowState },
  lookups: WorkflowLookups,
): Promise<string | null> {
  if (topic.status === 'shooting') {
    const result = await lookups.getShooting(topic.id);
    return result.data[0] ? `/shooting/${result.data[0].id}` : null;
  }

  if (topic.status === 'publishing') {
    const result = await lookups.getPublishing(topic.id);
    return result.data[0] ? `/publishing/${result.data[0].id}` : null;
  }

  const pathByStatus: Record<string, string> = {
    pending: `/topics/${topic.id}`,
    approved: `/topics/${topic.id}`,
    rejected: `/topics/${topic.id}`,
    production: `/production/${topic.id}`,
    completed: `/topics/${topic.id}`,
  };
  return pathByStatus[topic.status] ?? `/topics/${topic.id}`;
}
