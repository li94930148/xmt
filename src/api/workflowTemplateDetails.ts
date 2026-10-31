export function requestWorkflowTemplateDetail(
  id: number,
  authToken: string,
  cache?: RequestCache,
): Promise<Response> {
  return fetch(`/api/workflow-templates/${id}`, {
    headers: { Authorization: `Bearer ${authToken}` },
    ...(cache ? { cache } : {}),
  });
}
