import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 96, username: 'workflow-language-qa', role: 'admin', name: '审批流语言验收', enabled: true, force_change_password: false };
const template = {
  id: 961,
  name: '阶段顺序验收模板',
  description: '仅用于隔离浏览器语言回归',
  is_default: true,
  node_count: 1,
  topic_count: 0,
  creator_name: user.name,
};
const detail = {
  ...template,
  nodes: [{
    id: 1,
    name: '非法阶段示例',
    node_order: 1,
    status_from: 'pending',
    status_to: 'shooting',
    approver_type: 'role' as const,
    approver_value: 'director',
    is_required: true,
  }],
};
interface WorkflowMutationFixtureTemplate {
  id: number;
  name: string;
  description: string;
  is_default: boolean;
  node_count: number;
  topic_count: number;
  creator_name: string;
  nodes?: Array<Record<string, unknown>>;
}
const workflowMutationInitialTemplate: WorkflowMutationFixtureTemplate = {
  id: 961,
  name: '隔离审批流模板',
  description: '仅用于模板写入反馈回归',
  is_default: false,
  node_count: 0,
  topic_count: 0,
  creator_name: user.name,
  nodes: [],
};
const workflowMutationSurvivorTemplate: WorkflowMutationFixtureTemplate = {
  id: 963,
  name: '保留审批流模板',
  description: '用于验证删除期间仍禁止其他变更',
  is_default: false,
  node_count: 0,
  topic_count: 0,
  creator_name: user.name,
  nodes: [],
};
const workflowTemplateCreateFingerprint = (payload: Record<string, unknown>) => {
  const nodes = Array.isArray(payload.nodes)
    ? payload.nodes.map((node) => {
      const value = node as Record<string, unknown>;
      return [value.name, value.status_from, value.status_to, value.approver_type || 'role', value.approver_value || '', value.is_required !== false];
    })
    : [];
  return createHash('sha256').update(JSON.stringify([payload.name, payload.description || '', nodes])).digest('hex');
};
const workflowTemplateUpdateRequestFingerprint = (payload: Record<string, unknown>) => createHash('sha256')
  .update(JSON.stringify([payload.base_fingerprint, workflowTemplateCreateFingerprint(payload)]))
  .digest('hex');
const withWorkflowTemplateBaseFingerprint = (value: WorkflowMutationFixtureTemplate) => ({
  ...value,
  base_fingerprint: workflowTemplateCreateFingerprint({
    name: value.name,
    description: value.description,
    nodes: value.nodes || [],
  }),
});
let workflowMutationFixtureEnabled = false;
let workflowSuggestionFixtureEnabled = false;
let workflowMutationTemplates: WorkflowMutationFixtureTemplate[] = [];
let workflowMutationDetails = new Map<number, WorkflowMutationFixtureTemplate>();
let workflowMutationDetailReadRequests = new Map<number, number>();
let workflowMutationDetailFailureMode: 'status' | 'network' | 'invalid' | '' = '';
let workflowMutationDetailDelayMs = 0;
let workflowMutationDetailDelayRequest = 1;
let workflowMutationListRequests = 0;
let workflowMutationCreateRequests = 0;
let workflowMutationCreateBodies: Array<Record<string, unknown>> = [];
let workflowCreateRecoveryMode: 'created' | 'deleted' | '' = '';
let workflowCreateRecoveryStatusFailures = 0;
let workflowCreateRecoveryStatusRequests: Array<{ requestId: string; actorId: number }> = [];
let workflowCreateRecoveryStatusFingerprints: string[] = [];
let workflowCreateRecoveryLedger = new Map<string, { actorId: number; templateId: number; deleted: boolean; fingerprint: string }>();
let workflowMutationUpdateRequests = 0;
let workflowMutationUpdateBodies: Array<Record<string, unknown>> = [];
let workflowUpdateRecoveryStatusFailures = 0;
let workflowUpdateRecoveryStatusRequests = 0;
let loseNextWorkflowMutationUpdateResponse = false;
let workflowUpdateRecoveryLedger = new Map<string, { actorId: number; templateId: number; fingerprint: string }>();
let workflowMutationDeleteRequests = 0;
let loseNextWorkflowMutationDeleteResponse = false;
let failNextWorkflowMutationDelete = false;
let workflowMutationDeleteVerificationReadFailures = 0;
let failNextWorkflowMutationListRead = false;
let failNextWorkflowMutationCreate = false;
let failNextWorkflowMutationUpdate = false;
let failWorkflowMutationListAfterCreate = false;
let failWorkflowMutationListAfterUpdate = false;
let failWorkflowMutationListAfterDelete = false;
let workflowMutationCreateDelayMs = 0;
let workflowMutationUpdateDelayMs = 0;
let workflowMutationDeleteDelayMs = 0;
let workflowMutationCreateDelayRequest = 1;
let workflowMutationUpdateDelayRequest = 1;
let workflowMutationDeleteDelayRequest = 1;
let workflowMutationListDelayMs = 0;
let workflowMutationListDelayRequest = 1;
let deleteScenario = false;
let workflowTemplateExists = true;
let failNextWorkflowTemplateDelete = false;
let templateManagementTemplates: Array<Record<string, unknown>> = [];
let failNextTemplateManagementRead = false;
let templateManagementCreateCount = 0;
let templateManagementReadCount = 0;
let delayNextTemplateManagementCreate = false;
const rolePermission = { id: 11, code: 'topic:create', name: '创建选题', module: 'topic' };
const initialRoles = () => [
  { id: 1, code: 'admin', name: '管理员', description: '系统管理员', is_system: true, user_count: 1, permission_count: 2, permissions: [] },
  { id: 2, code: 'director', name: '负责人', description: '内容负责人', is_system: true, user_count: 1, permission_count: 1, permissions: [] },
  { id: 3, code: 'content_ops', name: '内容运营', description: '普通业务角色', is_system: false, user_count: 0, permission_count: 1, permissions: [rolePermission] },
];
let permissionRoles = initialRoles();
let roleReadRequests = 0;
let roleDetailReadRequests = 0;
let permissionReadRequests = 0;
let roleCreateRequests = 0;
let roleUpdateRequests = 0;
let roleDeleteRequests = 0;
let failNextRoleRead = false;
let failNextPermissionRead = false;
let failRoleReadAfterCreate = false;
let failRoleReadAfterUpdate = false;
let failNextRoleCreate = false;
let failNextRoleUpdate = false;
let loseNextRoleUpdateResponse = false;
let failNextRoleDetailRead = false;
let failNextRoleDelete = false;
let delayNextRoleCreate = false;
let loseNextRoleCreateResponse = false;
let failRoleCreateVerificationReadAfterCreate = false;
let failNextRoleCreateVerificationRead = false;
let roleCreateResponseConflict = false;
let loseNextRoleDeleteResponse = false;
let failRoleDeleteVerificationReadAfterDelete = false;
let failNextRoleDeleteVerificationRead = false;

const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  deleteScenario = req.query.delete === '1';
  workflowMutationFixtureEnabled = req.query.page === 'workflow-mutations' || req.query.page === 'workflow-create-recovery';
  workflowSuggestionFixtureEnabled = req.query.suggestedTransitionFixture === '1';
  if (workflowMutationFixtureEnabled) {
    const detailFailureModes = ['status', 'network', 'invalid'] as const;
    workflowMutationDetailFailureMode = detailFailureModes.find((mode) => mode === String(req.query.detailFailureMode || '')) || '';
    workflowMutationDetailDelayMs = Number(req.query.detailDelayMs) || 0;
    workflowMutationDetailDelayRequest = Number(req.query.detailDelayRequest) || 1;
    const initialWorkflowMutationTemplates = req.query.deleteRefreshFailOnce === '1' || req.query.includeSurvivor === '1'
      ? [workflowMutationInitialTemplate, workflowMutationSurvivorTemplate]
      : [workflowMutationInitialTemplate];
    workflowMutationTemplates = initialWorkflowMutationTemplates.map((item) => ({ ...item, nodes: undefined }));
    workflowMutationDetails = new Map(initialWorkflowMutationTemplates.map((item) => [item.id, {
      ...item,
      nodes: item.id === workflowMutationInitialTemplate.id && req.query.detailNodeFixture === '1'
        ? [{
          id: 964,
          name: '详情验收节点',
          node_order: 1,
          status_from: 'pending',
          status_to: 'approved',
          approver_type: 'role',
          approver_value: 'director',
          is_required: true,
        }]
        : [],
    }]));
    workflowMutationDetailReadRequests = new Map();
    workflowMutationListRequests = 0;
    workflowMutationCreateRequests = 0;
    workflowMutationCreateBodies = [];
    workflowCreateRecoveryMode = req.query.page === 'workflow-create-recovery'
      ? (req.query.recoveryMode === 'deleted' ? 'deleted' : 'created')
      : '';
    workflowCreateRecoveryStatusFailures = Number(req.query.statusFailCount) || 0;
    workflowCreateRecoveryStatusRequests = [];
    workflowCreateRecoveryStatusFingerprints = [];
    workflowCreateRecoveryLedger = new Map();
    workflowMutationUpdateRequests = 0;
    workflowMutationUpdateBodies = [];
    workflowUpdateRecoveryStatusFailures = Number(req.query.updateStatusFailCount) || 0;
    workflowUpdateRecoveryStatusRequests = 0;
    loseNextWorkflowMutationUpdateResponse = req.query.updateCommitLost === '1';
    workflowUpdateRecoveryLedger = new Map();
    workflowMutationDeleteRequests = 0;
    loseNextWorkflowMutationDeleteResponse = req.query.deleteCommitLost === '1';
    failNextWorkflowMutationDelete = req.query.deleteFailOnce === '1';
    workflowMutationDeleteVerificationReadFailures = Number(req.query.deleteVerifyReadFailOnce) || 0;
    failNextWorkflowMutationListRead = req.query.initialListFail === '1';
    failNextWorkflowMutationCreate = req.query.createFailOnce === '1';
    failNextWorkflowMutationUpdate = req.query.updateFailOnce === '1';
    failWorkflowMutationListAfterCreate = req.query.createRefreshFailOnce === '1';
    failWorkflowMutationListAfterUpdate = req.query.updateRefreshFailOnce === '1';
    failWorkflowMutationListAfterDelete = req.query.deleteRefreshFailOnce === '1';
    workflowMutationCreateDelayMs = Number(req.query.createDelayMs) || 0;
    workflowMutationUpdateDelayMs = Number(req.query.updateDelayMs) || 0;
    workflowMutationDeleteDelayMs = Number(req.query.deleteDelayMs) || 0;
    workflowMutationCreateDelayRequest = Number(req.query.createDelayRequest) || 1;
    workflowMutationUpdateDelayRequest = Number(req.query.updateDelayRequest) || 1;
    workflowMutationDeleteDelayRequest = Number(req.query.deleteDelayRequest) || 1;
    workflowMutationListDelayMs = Number(req.query.listDelayMs) || 0;
    workflowMutationListDelayRequest = Number(req.query.listDelayRequest) || 1;
  }
  workflowTemplateExists = true;
  failNextWorkflowTemplateDelete = false;
  if (req.query.page === 'permissions') {
    permissionRoles = initialRoles();
    roleReadRequests = 0;
    roleDetailReadRequests = 0;
    permissionReadRequests = 0;
    roleCreateRequests = 0;
    roleUpdateRequests = 0;
    roleDeleteRequests = 0;
    failNextRoleRead = req.query.initialRoleReadFail === '1';
    failNextPermissionRead = req.query.initialPermissionReadFail === '1';
    failRoleReadAfterCreate = req.query.createRefreshFail === '1';
    failRoleReadAfterUpdate = req.query.updateRefreshFail === '1';
    failNextRoleCreate = req.query.createFailOnce === '1';
    failNextRoleUpdate = req.query.updateFailOnce === '1';
    loseNextRoleUpdateResponse = req.query.updateCommitLost === '1';
    failNextRoleDetailRead = req.query.updateVerifyReadFailOnce === '1';
    failNextRoleDelete = req.query.deleteFailOnce === '1';
    loseNextRoleDeleteResponse = req.query.deleteCommitLost === '1';
    failRoleDeleteVerificationReadAfterDelete = req.query.deleteVerifyReadFailOnce === '1';
    failNextRoleDeleteVerificationRead = false;
    delayNextRoleCreate = req.query.delayCreate === '1';
    loseNextRoleCreateResponse = req.query.createCommitLost === '1';
    failRoleCreateVerificationReadAfterCreate = req.query.createVerifyReadFailOnce === '1';
    failNextRoleCreateVerificationRead = false;
    roleCreateResponseConflict = req.query.createConflict === '1';
  }
  if (req.query.page === 'templates') {
    templateManagementTemplates = [];
    failNextTemplateManagementRead = req.query.initialReadFail === '1';
    templateManagementCreateCount = 0;
    templateManagementReadCount = 0;
    delayNextTemplateManagementCreate = false;
  }
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  const route = req.query.page === 'permissions' ? '/permissions' : req.query.page === 'templates' ? '/templates' : '/workflow-designer';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','workflow-language-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace(${JSON.stringify(route)});</script>`);
});
app.get('/api/auth/me', (req, res) => {
  const token = String(req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return res.json(token.endsWith(':97')
    ? { ...user, id: 97, username: 'workflow-language-qa-other', name: '另一测试账号' }
    : user);
});
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/roles', (_req, res) => {
  roleReadRequests += 1;
  if (failNextRoleCreateVerificationRead) {
    failNextRoleCreateVerificationRead = false;
    return res.status(503).json({ message: '模拟角色创建结果读取失败' });
  }
  if (failNextRoleRead) {
    failNextRoleRead = false;
    return res.status(503).json({ message: '模拟角色列表读取失败' });
  }
  return res.json(permissionRoles);
});
app.get('/api/roles/:id', (req, res) => {
  roleDetailReadRequests += 1;
  if (failNextRoleDeleteVerificationRead) {
    failNextRoleDeleteVerificationRead = false;
    return res.status(503).json({ message: '模拟角色删除结果读取失败' });
  }
  if (failNextRoleDetailRead) {
    failNextRoleDetailRead = false;
    return res.status(503).json({ message: '模拟角色当前状态读取失败' });
  }
  const role = permissionRoles.find((item) => item.id === Number(req.params.id));
  if (!role) return res.status(404).json({ message: '角色不存在' });
  return res.json(role);
});
app.post('/api/roles', async (req, res) => {
  roleCreateRequests += 1;
  if (failNextRoleCreate) {
    failNextRoleCreate = false;
    return res.status(503).json({ message: '模拟角色创建失败' });
  }
  const id = 4;
  permissionRoles = [...permissionRoles, { id, code: req.body.code, name: roleCreateResponseConflict ? '服务器已存在的不同角色' : req.body.name, description: req.body.description, is_system: false, user_count: 0, permission_count: req.body.permission_ids?.length ?? 0, permissions: [] }];
  if (delayNextRoleCreate) {
    delayNextRoleCreate = false;
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  if (failRoleReadAfterCreate) failNextRoleRead = true;
  if (loseNextRoleCreateResponse) {
    loseNextRoleCreateResponse = false;
    failNextRoleCreateVerificationRead = failRoleCreateVerificationReadAfterCreate;
    return res.status(503).json({ message: '模拟服务器已创建但响应丢失' });
  }
  return res.json({ message: '角色创建成功', id });
});
app.put('/api/roles/:id', (req, res) => {
  roleUpdateRequests += 1;
  if (failNextRoleUpdate) {
    failNextRoleUpdate = false;
    return res.status(503).json({ message: '模拟角色更新失败' });
  }
  permissionRoles = permissionRoles.map((role) => role.id === Number(req.params.id)
    ? { ...role, name: req.body.name, description: req.body.description, permission_count: req.body.permission_ids?.length ?? role.permission_count, permissions: (req.body.permission_ids || []).map((id: number) => ({ ...rolePermission, id })) }
    : role);
  if (loseNextRoleUpdateResponse) {
    loseNextRoleUpdateResponse = false;
    return res.status(503).json({ message: '模拟服务器已提交但响应丢失' });
  }
  if (failRoleReadAfterUpdate) failNextRoleRead = true;
  return res.json({ message: '角色更新成功' });
});
app.delete('/api/roles/:id', (_req, res) => {
  roleDeleteRequests += 1;
  if (failNextRoleDelete) {
    failNextRoleDelete = false;
    return res.status(503).json({ message: '模拟角色删除失败' });
  }
  permissionRoles = permissionRoles.filter((role) => role.id !== Number(_req.params.id));
  if (loseNextRoleDeleteResponse) {
    loseNextRoleDeleteResponse = false;
    failNextRoleDeleteVerificationRead = failRoleDeleteVerificationReadAfterDelete;
    return res.status(503).json({ message: '模拟服务器已删除但响应丢失' });
  }
  return res.json({ message: '角色删除成功' });
});
app.get('/api/permissions', (_req, res) => {
  permissionReadRequests += 1;
  if (failNextPermissionRead) {
    failNextPermissionRead = false;
    return res.status(503).json({ message: '模拟权限清单读取失败' });
  }
  return res.json({ permissions: [rolePermission], grouped: { topic: [rolePermission] } });
});
app.get('/api/workflow-templates', async (_req, res) => {
  if (workflowMutationFixtureEnabled) {
    workflowMutationListRequests += 1;
    if (workflowMutationListDelayMs > 0 && workflowMutationListRequests === workflowMutationListDelayRequest) {
      const delay = workflowMutationListDelayMs;
      workflowMutationListDelayMs = 0;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (failNextWorkflowMutationListRead) {
      failNextWorkflowMutationListRead = false;
      return res.status(503).json({ message: '模拟审批流模板列表暂不可用' });
    }
    return res.json(workflowMutationTemplates);
  }
  return res.json(workflowTemplateExists ? [{ ...template, is_default: !deleteScenario }] : []);
});
app.get('/api/workflow-templates/create-requests/:requestId', (req, res) => {
  if (!workflowMutationFixtureEnabled) return res.status(404).json({ message: '模拟创建请求不存在' });
  const requestId = String(req.params.requestId);
  const token = String(req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const actorId = token.endsWith(':97') ? 97 : user.id;
  workflowCreateRecoveryStatusRequests.push({ requestId, actorId });
  const fingerprint = String(req.query.fingerprint || '');
  workflowCreateRecoveryStatusFingerprints.push(fingerprint);
  if (workflowCreateRecoveryStatusFailures > 0) {
    workflowCreateRecoveryStatusFailures -= 1;
    return res.status(503).json({ message: '模拟创建结果核实暂不可用' });
  }
  const recovery = workflowCreateRecoveryLedger.get(requestId);
  if (!recovery || recovery.actorId !== actorId) return res.status(404).json({ message: '尚未找到对应审批流模板' });
  if (recovery.fingerprint !== fingerprint) return res.status(409).json({ message: '请求内容与服务端记录不一致' });
  if (recovery.deleted) return res.status(410).json({ message: '对应审批流模板已删除' });
  return res.json({ templateId: recovery.templateId });
});
app.get('/api/workflow-templates/:id/update-requests/:requestId', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!workflowMutationFixtureEnabled) return res.status(404).json({ message: '模拟更新请求不存在' });
  workflowUpdateRecoveryStatusRequests += 1;
  if (workflowUpdateRecoveryStatusFailures > 0) {
    workflowUpdateRecoveryStatusFailures -= 1;
    return res.status(503).json({ message: '模拟更新结果核实暂不可用' });
  }
  const templateId = Number(req.params.id);
  const requestId = String(req.params.requestId);
  const token = String(req.get('Authorization') || '').replace(/^Bearer\\s+/i, '');
  const actorId = token.endsWith(':97') ? 97 : user.id;
  const fingerprint = String(req.query.fingerprint || '');
  const recovery = workflowUpdateRecoveryLedger.get(requestId);
  if (!recovery || recovery.actorId !== actorId || recovery.templateId !== templateId) {
    return res.json({ state: 'not_found' });
  }
  if (recovery.fingerprint !== fingerprint) return res.status(409).json({ message: '更新内容与服务端记录不一致', code: 'WORKFLOW_TEMPLATE_UPDATE_REQUEST_CONFLICT' });
  return res.json({ state: 'updated', templateId });
});
app.get('/api/workflow-templates/:id', async (req, res) => {
  if (workflowMutationFixtureEnabled) {
    const id = Number(req.params.id);
    const requestCount = (workflowMutationDetailReadRequests.get(id) || 0) + 1;
    workflowMutationDetailReadRequests.set(id, requestCount);
    if (workflowMutationDetailDelayMs > 0 && requestCount === workflowMutationDetailDelayRequest) {
      const delay = workflowMutationDetailDelayMs;
      workflowMutationDetailDelayMs = 0;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (id === workflowMutationInitialTemplate.id && workflowMutationDeleteVerificationReadFailures > 0) {
      workflowMutationDeleteVerificationReadFailures -= 1;
      return res.status(503).json({ message: '模拟审批流模板删除结果读取失败' });
    }
    if (id === workflowMutationInitialTemplate.id && requestCount === 1 && workflowMutationDetailFailureMode) {
      const failureMode = workflowMutationDetailFailureMode;
      workflowMutationDetailFailureMode = '';
      if (failureMode === 'status') return res.status(503).json({ message: '模拟审批流模板详情暂不可用' });
      if (failureMode === 'network') return res.json({ message: 'network failure should be intercepted by the browser fixture' });
      return res.json({ id, name: 37, description: null, nodes: 'invalid-nodes-payload' });
    }
    const workflowTemplate = workflowMutationDetails.get(id);
    if (!workflowTemplate) return res.status(404).json({ message: '模拟审批流模板不存在' });
    return res.json(withWorkflowTemplateBaseFingerprint(workflowTemplate));
  }
  return res.json(withWorkflowTemplateBaseFingerprint(detail as WorkflowMutationFixtureTemplate));
});
app.post('/api/workflow-templates', async (req, res) => {
  if (!workflowMutationFixtureEnabled) return res.json({ message: '审批流模板已创建' });
  workflowMutationCreateRequests += 1;
  workflowMutationCreateBodies.push(JSON.parse(JSON.stringify(req.body || {})) as Record<string, unknown>);
  if (workflowMutationCreateDelayMs > 0 && workflowMutationCreateRequests === workflowMutationCreateDelayRequest) {
    const delay = workflowMutationCreateDelayMs;
    workflowMutationCreateDelayMs = 0;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  if (failNextWorkflowMutationCreate) {
    failNextWorkflowMutationCreate = false;
    return res.status(503).json({ message: '模拟审批流模板创建失败' });
  }
  const id = 962;
  const created: WorkflowMutationFixtureTemplate = {
    id,
    name: String(req.body?.name || ''),
    description: String(req.body?.description || ''),
    is_default: false,
    node_count: Array.isArray(req.body?.nodes) ? req.body.nodes.length : 0,
    topic_count: 0,
    creator_name: user.name,
  };
  workflowMutationTemplates = [...workflowMutationTemplates, created];
  workflowMutationDetails.set(id, { ...created, nodes: Array.isArray(req.body?.nodes) ? req.body.nodes : [] });
  const requestId = String(req.body?.client_request_id || '');
  if (workflowCreateRecoveryMode && requestId) {
    workflowCreateRecoveryLedger.set(requestId, {
      actorId: String(req.get('Authorization') || '').endsWith(':97') ? 97 : user.id,
      templateId: id,
      deleted: workflowCreateRecoveryMode === 'deleted',
      fingerprint: workflowTemplateCreateFingerprint(req.body as Record<string, unknown>),
    });
    if (workflowCreateRecoveryMode === 'deleted') {
      workflowMutationTemplates = workflowMutationTemplates.filter((item) => item.id !== id);
      workflowMutationDetails.delete(id);
    }
  }
  if (failWorkflowMutationListAfterCreate) failNextWorkflowMutationListRead = true;
  return res.json({ message: '审批流模板已创建', id });
});
app.put('/api/workflow-templates/:id', async (req, res) => {
  if (!workflowMutationFixtureEnabled) return res.json({ message: '审批流模板已更新' });
  workflowMutationUpdateRequests += 1;
  workflowMutationUpdateBodies.push(JSON.parse(JSON.stringify(req.body || {})) as Record<string, unknown>);
  if (workflowMutationUpdateDelayMs > 0 && workflowMutationUpdateRequests === workflowMutationUpdateDelayRequest) {
    const delay = workflowMutationUpdateDelayMs;
    workflowMutationUpdateDelayMs = 0;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  if (failNextWorkflowMutationUpdate) {
    failNextWorkflowMutationUpdate = false;
    return res.status(503).json({ message: '模拟审批流模板更新失败' });
  }
  const id = Number(req.params.id);
  const requestId = String(req.body?.client_request_id || '');
  const actorId = String(req.get('Authorization') || '').endsWith(':97') ? 97 : user.id;
  const requestFingerprint = workflowTemplateUpdateRequestFingerprint(req.body as Record<string, unknown>);
  if (requestId) {
    const existing = workflowUpdateRecoveryLedger.get(requestId);
    if (existing && (existing.actorId !== actorId || existing.templateId !== id || existing.fingerprint !== requestFingerprint)) {
      return res.status(409).json({ message: '更新请求编号范围或内容冲突', code: 'WORKFLOW_TEMPLATE_UPDATE_REQUEST_CONFLICT' });
    }
    if (existing) return res.json({ message: '审批流模板更新成功', idempotent_replay: true });
  }
  const current = workflowMutationDetails.get(id);
  if (!current) return res.status(404).json({ message: '模拟审批流模板不存在' });
  const currentBaseFingerprint = withWorkflowTemplateBaseFingerprint(current).base_fingerprint;
  if (req.body?.base_fingerprint !== currentBaseFingerprint) {
    return res.status(409).json({ message: '模拟原模板快照已变化', code: 'WORKFLOW_TEMPLATE_UPDATE_BASE_CONFLICT', base_fingerprint: currentBaseFingerprint });
  }
  const updated: WorkflowMutationFixtureTemplate = {
    ...current,
    name: String(req.body?.name || ''),
    description: String(req.body?.description || ''),
    node_count: Array.isArray(req.body?.nodes) ? req.body.nodes.length : 0,
  };
  workflowMutationDetails.set(id, { ...updated, nodes: Array.isArray(req.body?.nodes) ? req.body.nodes : [] });
  workflowMutationTemplates = workflowMutationTemplates.map((item) => item.id === id ? updated : item);
  if (requestId) workflowUpdateRecoveryLedger.set(requestId, { actorId, templateId: id, fingerprint: requestFingerprint });
  if (failWorkflowMutationListAfterUpdate) failNextWorkflowMutationListRead = true;
  if (loseNextWorkflowMutationUpdateResponse) {
    loseNextWorkflowMutationUpdateResponse = false;
    return res.status(503).json({ message: '模拟服务器已提交但更新响应丢失' });
  }
  return res.json({ message: '审批流模板已更新' });
});
app.delete('/api/workflow-templates/:id', async (_req, res) => {
  if (workflowMutationFixtureEnabled) {
    workflowMutationDeleteRequests += 1;
    if (workflowMutationDeleteDelayMs > 0 && workflowMutationDeleteRequests === workflowMutationDeleteDelayRequest) {
      const delay = workflowMutationDeleteDelayMs;
      workflowMutationDeleteDelayMs = 0;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const id = Number(_req.params.id);
    if (failNextWorkflowMutationDelete) {
      failNextWorkflowMutationDelete = false;
      return res.status(503).json({ message: '模拟审批流模板删除请求失败' });
    }
    workflowMutationTemplates = workflowMutationTemplates.filter((item) => item.id !== id);
    workflowMutationDetails.delete(id);
    if (failWorkflowMutationListAfterDelete) failNextWorkflowMutationListRead = true;
    if (loseNextWorkflowMutationDeleteResponse) {
      loseNextWorkflowMutationDeleteResponse = false;
      return res.status(503).json({ message: '模拟服务器已删除但响应丢失' });
    }
    return res.json({ message: '模拟审批流模板已删除' });
  }
  if (failNextWorkflowTemplateDelete) {
    failNextWorkflowTemplateDelete = false;
    return res.status(503).json({ message: '模拟删除失败' });
  }
  workflowTemplateExists = false;
  return res.json({ message: '模板已删除' });
});
app.get('/api/templates', (_req, res) => {
  templateManagementReadCount++;
  if (failNextTemplateManagementRead) {
    failNextTemplateManagementRead = false;
    return res.status(503).json({ message: '模拟选题模板列表刷新失败' });
  }
  return res.json({ data: templateManagementTemplates });
});
app.post('/__qa/fail-next-template-management-read', (_req, res) => {
  failNextTemplateManagementRead = true;
  return res.json({ ok: true });
});
app.post('/api/templates', async (req, res) => {
  templateManagementCreateCount += 1;
  const id = 1201;
  templateManagementTemplates.push({ ...req.body, id, creator_id: user.id, creator_name: user.name, created_at: '2026-10-09 10:00:00', updated_at: '2026-10-09 10:00:00' });
  if (delayNextTemplateManagementCreate) {
    delayNextTemplateManagementCreate = false;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return res.json({ message: '模板创建成功', id });
});
app.get('/api/workflow/shadow-logs', (_req, res) => res.json(workflowSuggestionFixtureEnabled ? [
  { node_id: 964, from_state: 'pending', to_state: 'approved', action: 'approved', reason: 'shadow mode - no enforcement' },
  { node_id: 964, from_state: 'pending', to_state: 'shooting', action: 'approved', reason: 'shadow mode - no enforcement' },
  { node_id: 964, from_state: 'pending', to_state: 'shooting', action: 'approved', reason: 'shadow mode - no enforcement' },
] : []));
app.get('/api/users', (_req, res) => res.json({ data: [user], total: 1, page: 1, limit: 10 }));
app.use('/api', (_req, res) => res.json({ success: true, data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

function parseCssColor(value: string) {
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const expanded = hex.length === 3 ? hex.split('').map((part) => `${part}${part}`).join('') : hex;
    if (expanded.length === 6) return { rgb: [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16)), alpha: 1 };
  }
  const channels = value.match(/[\d.]+/g)?.map(Number) || [];
  if (channels.length < 3) return null;
  const rgb = value.startsWith('color(srgb ')
    ? channels.slice(0, 3).map((channel) => channel * 255)
    : channels.slice(0, 3);
  return { rgb, alpha: channels[3] ?? 1 };
}

function relativeLuminance(rgb: number[]) {
  const channels = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

async function contrastRatio(locator: import('playwright').Locator) {
  const styles = await locator.evaluate((element) => {
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    ancestors.reverse();
    const backgrounds = [getComputedStyle(document.documentElement).backgroundColor];
    for (const ancestor of ancestors) backgrounds.push(getComputedStyle(ancestor).backgroundColor);
    return { foreground: getComputedStyle(element).color, backgrounds };
  });
  const foreground = parseCssColor(styles.foreground)?.rgb;
  if (!foreground) return 0;
  let background = [255, 255, 255];
  for (const value of styles.backgrounds) {
    const layer = parseCssColor(value);
    if (!layer) continue;
    background = layer.rgb.map((channel, index) => channel * layer.alpha + background[index] * (1 - layer.alpha));
  }
  const text = relativeLuminance(foreground);
  const surface = relativeLuminance(background);
  return (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05);
}

async function assertWithinViewport(locator: import('playwright').Locator, width: number, height: number, label: string) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert(box, `${label} has a visible bounding box`);
  assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height,
    `${label} stays within the ${width}x${height} viewport`);
}

async function assertMinimumHitTarget(locator: import('playwright').Locator, label: string) {
  const box = await locator.boundingBox();
  assert(box, `${label} has a visible bounding box`);
  assert(box.width >= 40 && box.height >= 40, `${label} is at least 40x40px: ${JSON.stringify({ width: box.width, height: box.height })}`);
}

async function assertInsideWorkflowCard(locator: import('playwright').Locator, label: string) {
  const bounds = await locator.evaluate((element) => {
    const card = element.closest('.xmt-card, [data-policy-reason]');
    if (!card) return null;
    const controlRect = element.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      inside: controlRect.left >= cardRect.left && controlRect.top >= cardRect.top
        && controlRect.right <= cardRect.right && controlRect.bottom <= cardRect.bottom,
      control: { left: controlRect.left, top: controlRect.top, right: controlRect.right, bottom: controlRect.bottom },
      card: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom },
    };
  });
  assert(bounds?.inside, `${label} remains inside its clipping card: ${JSON.stringify(bounds)}`);
}

async function assertTabReachable(
  page: import('playwright').Page,
  start: import('playwright').Locator,
  target: import('playwright').Locator,
  label: string,
) {
  await start.focus();
  const focusableCount = await page.locator('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])').count();
  let reachedByKeyboard = false;
  for (let index = 0; index <= focusableCount; index += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => document.activeElement === element)) {
      reachedByKeyboard = true;
      break;
    }
  }
  assert(reachedByKeyboard, `${label} is reachable in the keyboard Tab order`);
}

if (process.env.XMT_WORKFLOW_LANGUAGE_QA_SERVE === '1') {
  console.log(`Isolated workflow language QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  type ObservedHttpResponse = { url: string; method: string; pathname: string; status: number };
  type ObservedConsoleError = ObservedHttpResponse & { message: string };
  const errors: string[] = [];
  const expectedHttpErrors: ObservedConsoleError[] = [];
  const observedUnavailableConsoleErrors: Array<{ message: string; sourceUrl: string }> = [];
  const unavailableResponses: ObservedHttpResponse[] = [];
  const classifiedUnavailableResponses = new Set<ObservedHttpResponse>();
  const expectedRecoveryResponses: ObservedHttpResponse[] = [];
  const expectedRecoveryErrors: ObservedConsoleError[] = [];
  const expectedRoleDeleteNotFoundResponses: ObservedHttpResponse[] = [];
  const expectedRoleDeleteNotFoundErrors: ObservedConsoleError[] = [];
  const expectedWorkflowDeleteNotFoundResponses: ObservedHttpResponse[] = [];
  const expectedWorkflowDeleteNotFoundErrors: ObservedConsoleError[] = [];
  const expectedWorkflowCreateConflictResponses: ObservedHttpResponse[] = [];
  const expectedWorkflowCreateConflictErrors: ObservedConsoleError[] = [];
  const classifiedExpectedResponses = new Set<ObservedHttpResponse>();
  const expectedConsoleErrorBuckets = [
    { responses: expectedRecoveryResponses, errors: expectedRecoveryErrors },
    { responses: expectedRoleDeleteNotFoundResponses, errors: expectedRoleDeleteNotFoundErrors },
    { responses: expectedWorkflowDeleteNotFoundResponses, errors: expectedWorkflowDeleteNotFoundErrors },
    { responses: expectedWorkflowCreateConflictResponses, errors: expectedWorkflowCreateConflictErrors },
  ];
  const expectedPermissionFailureLogs: string[] = [];
  const expectedWorkflowFailureLogs: string[] = [];
  const expectedWorkflowDetailFailureLogs: string[] = [];
  const expectedWorkflowDetailNetworkErrors: string[] = [];
  const expectedWorkflowCreateRequestFailures: string[] = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    const responseUrl = new URL(response.url());
    const method = response.request().method();
    const status = response.status();
    const observedResponse = { url: response.url(), method, pathname: responseUrl.pathname, status };
    if (status === 503) unavailableResponses.push(observedResponse);
    if (method === 'GET'
      && /^\/api\/workflow-templates\/create-requests\/[^/]+$/.test(responseUrl.pathname)
      && [404, 409, 410].includes(status)) {
      expectedRecoveryResponses.push(observedResponse);
    }
    if (method === 'GET' && responseUrl.pathname === '/api/roles/3' && status === 404) {
      expectedRoleDeleteNotFoundResponses.push(observedResponse);
    }
    if (method === 'GET' && responseUrl.pathname === '/api/workflow-templates/961' && status === 404) {
      expectedWorkflowDeleteNotFoundResponses.push(observedResponse);
    }
    if (method === 'POST' && responseUrl.pathname === '/api/workflow-templates' && status === 409) {
      expectedWorkflowCreateConflictResponses.push(observedResponse);
    }
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const recoveryStatusMatch = message.text().match(/status of (404|409|410) \(/);
    if (recoveryStatusMatch) {
      const status = Number(recoveryStatusMatch[1]);
      const sourceUrl = message.location().url;
      const source = (() => {
        try { return new URL(sourceUrl); } catch { return null; }
      })();
      const matchingBucket = source && expectedConsoleErrorBuckets.find(({ responses }) => responses.some((response) => (
        !classifiedExpectedResponses.has(response)
        && response.status === status
        && new URL(response.url).origin === source.origin
        && response.pathname === source.pathname
      )));
      const matchingResponse = matchingBucket?.responses.find((response) => (
        !classifiedExpectedResponses.has(response)
        && response.status === status
        && source
        && new URL(response.url).origin === source.origin
        && response.pathname === source.pathname
      ));
      if (matchingBucket && matchingResponse) {
        classifiedExpectedResponses.add(matchingResponse);
        matchingBucket.errors.push({ ...matchingResponse, message: message.text() });
      } else {
        errors.push(`${message.text()} [${sourceUrl || 'unknown source URL'}]`);
      }
    } else if (message.text().includes('503 (Service Unavailable)')) observedUnavailableConsoleErrors.push({ message: message.text(), sourceUrl: message.location().url });
    else if (message.text().includes('permissions.management_load_failed')) expectedPermissionFailureLogs.push(message.text());
    else if (message.text().includes('workflow.templates_load_failed')) expectedWorkflowFailureLogs.push(message.text());
    else if (message.text().includes('workflow.template_detail_load_failed')) expectedWorkflowDetailFailureLogs.push(message.text());
    else if (message.text().includes('ERR_EMPTY_RESPONSE') || message.text().includes('ERR_CONNECTION_RESET') || message.text().includes('ERR_FAILED')) expectedWorkflowDetailNetworkErrors.push(message.text());
    else errors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    if (request.url().endsWith('/api/workflow-templates') && request.method() === 'POST') {
      expectedWorkflowCreateRequestFailures.push(request.url());
    }
  });
  await page.goto(`${base}/__qa`);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  const editWorkflowButton = page.getByRole('button', { name: '编辑审批流 阶段顺序验收模板', exact: true });
  assert.equal(await editWorkflowButton.count(), 1, 'the template edit icon has a descriptive accessible name');
  await editWorkflowButton.click();
  await page.getByRole('heading', { name: '编辑审批流' }).waitFor();
  for (const [label, id] of [
    ['模板名称', 'workflow-template-name'],
    ['描述', 'workflow-template-description'],
    ['节点名称', 'workflow-node-0-name'],
    ['审批类型', 'workflow-node-0-approver-type'],
    ['从状态', 'workflow-node-0-status-from'],
    ['到状态', 'workflow-node-0-status-to'],
    ['审批人值', 'workflow-node-0-approver-value'],
  ] as const) {
    const field = page.getByLabel(label, { exact: true });
    assert.equal(await field.count(), 1, `${label} is associated with exactly one form control`);
    assert.equal(await field.getAttribute('id'), id, `${label} points to its stable form-control id`);
  }
  assert.equal(await page.getByLabel('必须审批', { exact: true }).count(), 1, 'the required-approval checkbox remains label-associated');
  assert.equal(await page.getByRole('button', { name: '删除节点 1', exact: true }).count(), 1, 'the node remove action exposes its target and is not a form submit button');
  await page.getByText('高风险', { exact: true }).waitFor();
  await page.getByText(/需处理：不允许从「待审核」直接进入「成片制作」/).waitFor();
  const nodeCard = page.locator('[title*="历史参考记录："]');
  assert.equal(await nodeCard.count(), 1, 'the invalid node exposes one explanation tooltip');
  const tooltip = await nodeCard.getAttribute('title');
  assert(tooltip);
  assert.match(tooltip, /历史参考记录：0 条/);
  assert.match(tooltip, /风险提示：高风险/);
  assert.match(tooltip, /规则类别：阶段顺序/);
  assert.match(tooltip, /流程变更由你确认并保存/);
  assert.doesNotMatch(tooltip, /Shadow logs|Risk score|Blocked reason|Failed rule|strict mode|Workflow check/i);
  const body = await page.locator('body').innerText();
  assert.doesNotMatch(body, /high 路|medium 路|low 路|必须修复：strict mode/i);
  await page.screenshot({ path: '/tmp/xmt-workflow-language-1440.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'workflow editor fits a 390px viewport without horizontal overflow');
  assert.match(await page.locator('body').innerText(), /需处理：不允许从「待审核」直接进入「成片制作」/);
  await page.screenshot({ path: '/tmp/xmt-workflow-language-390.png', fullPage: true });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('heading', { name: '编辑审批流' }).waitFor({ state: 'hidden' });

  for (const theme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/__qa?theme=${theme}`);
    await page.getByRole('heading', { name: '审批流设计' }).waitFor();
    const workflowBadge = page.getByTestId('workflow-default-badge');
    assert.ok((await workflowBadge.getAttribute('class'))?.includes('bg-studio-primary-soft'), `${theme} default workflow badge uses the soft primary surface token`);
    assert.ok((await workflowBadge.getAttribute('class'))?.includes('text-studio-primary-contrast'), `${theme} default workflow badge uses the contrast-safe primary text token`);
    assert.ok(await contrastRatio(workflowBadge) >= 4.5, `${theme} default workflow badge contrast is at least 4.5:1`);
    assert.ok(await contrastRatio(page.getByTestId('workflow-default-icon').locator('svg')) >= 4.5, `${theme} default workflow icon contrast is at least 4.5:1`);

    await page.goto(`${base}/__qa?page=permissions&theme=${theme}`);
    await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
    const systemRoleBadge = page.getByTestId('system-role-badge').first();
    assert.ok((await systemRoleBadge.getAttribute('class'))?.includes('bg-studio-primary-soft'), `${theme} system role badge uses the soft primary surface token`);
    assert.ok((await systemRoleBadge.getAttribute('class'))?.includes('text-studio-primary-contrast'), `${theme} system role badge uses the contrast-safe primary text token`);
    assert.ok(await contrastRatio(systemRoleBadge) >= 4.5, `${theme} system role badge contrast is at least 4.5:1`);
    assert.ok(await contrastRatio(page.getByTestId('role-icon-admin').locator('svg')) >= 4.5, `${theme} administrator role icon contrast is at least 4.5:1`);
    const customRoleDelete = page.getByRole('button', { name: '删除角色 内容运营' });
    await customRoleDelete.hover();
    const deleteHoverBackground = await customRoleDelete.evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.notEqual(deleteHoverBackground, 'rgba(0, 0, 0, 0)', `${theme} role delete hover applies its semantic surface`);
    assert.ok(await contrastRatio(customRoleDelete.locator('svg')) >= 3, `${theme} hovered role delete icon contrast is at least 3:1`);
    assert.equal(await page.getByRole('button', { name: '编辑角色 管理员' }).count(), 1, `${theme} edit action exposes an accessible role name`);
    await page.screenshot({ path: `/tmp/xmt-permission-badges-${theme}.png` });
  }

  const workflowAffordanceWrites: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      workflowAffordanceWrites.push(`${request.method()} ${pathname}`);
    }
  });
  for (const theme of ['light', 'dark'] as const) {
    for (const [width, height] of [[320, 844], [390, 844], [1440, 960]] as const) {
      await page.setViewportSize({ width, height });
      const suggestionFixtureQuery = width <= 390 ? '&suggestedTransitionFixture=1' : '';
      await page.goto(`${base}/__qa?page=workflow-mutations&detailNodeFixture=1${suggestionFixtureQuery}&theme=${theme}`);
      await page.getByRole('heading', { name: '审批流设计', exact: true }).waitFor();
      const templateDelete = page.getByRole('button', { name: '删除审批流 隔离审批流模板', exact: true });
      const templateEdit = page.getByRole('button', { name: '编辑审批流 隔离审批流模板', exact: true });
      await templateDelete.waitFor({ state: 'visible' });
      await templateEdit.waitFor({ state: 'visible' });
      workflowAffordanceWrites.length = 0;
      await assertWithinViewport(templateEdit, width, height, `${theme} ${width}px workflow-template edit action`);
      await assertWithinViewport(templateDelete, width, height, `${theme} ${width}px workflow-template delete action`);
      await assertMinimumHitTarget(templateEdit, `${theme} ${width}px workflow-template edit action`);
      await assertMinimumHitTarget(templateDelete, `${theme} ${width}px workflow-template delete action`);
      await assertInsideWorkflowCard(templateEdit, `${theme} ${width}px workflow-template edit action`);
      await assertInsideWorkflowCard(templateDelete, `${theme} ${width}px workflow-template delete action`);
      await assertTabReachable(page, templateEdit, templateDelete, `${theme} ${width}px workflow-template delete action`);
      await templateDelete.hover();
      const templateHoverBackground = await templateDelete.evaluate((element) => getComputedStyle(element).backgroundColor);
      assert.notEqual(templateHoverBackground, 'rgba(0, 0, 0, 0)', `${theme} ${width}px workflow-template delete hover applies its semantic surface`);
      assert.ok(await contrastRatio(templateDelete.locator('svg')) >= 3, `${theme} ${width}px hovered workflow-template delete icon contrast is at least 3:1`);

      if (theme === 'light' && width === 320) {
        await templateDelete.click();
        await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor();
        await page.getByText('确定删除审批流模板“隔离审批流模板”吗？', { exact: true }).waitFor();
        await page.getByRole('button', { name: '取消', exact: true }).click();
        await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor({ state: 'hidden' });
        assert.equal(workflowMutationDeleteRequests, 0, 'cancelling workflow-template deletion does not issue a DELETE');
        assert.deepEqual(workflowAffordanceWrites, [], 'opening and cancelling workflow-template deletion issues no business write');
      }

      await templateEdit.click();
      await page.getByRole('heading', { name: '编辑审批流', exact: true }).waitFor();
      const nodeDelete = page.getByRole('button', { name: '删除节点 1', exact: true });
      const addNode = page.getByRole('button', { name: '添加节点', exact: true });
      await nodeDelete.waitFor({ state: 'visible' });
      workflowAffordanceWrites.length = 0;
      await assertWithinViewport(nodeDelete, width, height, `${theme} ${width}px workflow-node delete action`);
      await assertMinimumHitTarget(nodeDelete, `${theme} ${width}px workflow-node delete action`);
      await assertInsideWorkflowCard(nodeDelete, `${theme} ${width}px workflow-node delete action`);
      await assertWithinViewport(addNode, width, height, `${theme} ${width}px workflow add-node action`);
      await assertMinimumHitTarget(addNode, `${theme} ${width}px workflow add-node action`);
      assert.equal(await addNode.getAttribute('data-reactbits-button'), 'secondary', `${theme} ${width}px add-node action uses the shared Studio button`);
      assert.ok(await contrastRatio(addNode) >= 4.5, `${theme} ${width}px workflow add-node action text contrast is at least 4.5:1`);
      await assertTabReachable(page, addNode, nodeDelete, `${theme} ${width}px workflow-node delete action`);
      await nodeDelete.hover();
      const nodeHoverBackground = await nodeDelete.evaluate((element) => getComputedStyle(element).backgroundColor);
      assert.notEqual(nodeHoverBackground, 'rgba(0, 0, 0, 0)', `${theme} ${width}px workflow-node delete hover applies its semantic surface`);
      assert.ok(await contrastRatio(nodeDelete.locator('svg')) >= 3, `${theme} ${width}px hovered workflow-node delete icon contrast is at least 3:1`);
      assert.equal(workflowMutationDeleteRequests, 0, `${theme} ${width}px node focus and hover do not issue a template DELETE`);
      assert.deepEqual(workflowAffordanceWrites, [], `${theme} ${width}px node focus and hover issue no business write`);
      assert.equal(workflowMutationCreateRequests, 0, `${theme} ${width}px node focus and hover do not create a template`);
      assert.equal(workflowMutationUpdateRequests, 0, `${theme} ${width}px node focus and hover do not update a template`);
      if (width <= 390) {
        const suggestedTransition = page.getByRole('button', { name: '应用建议：拍摄中', exact: true });
        await suggestedTransition.waitFor({ state: 'visible' });
        await assertWithinViewport(suggestedTransition, width, height, `${theme} ${width}px suggested-transition action`);
        await assertMinimumHitTarget(suggestedTransition, `${theme} ${width}px suggested-transition action`);
        assert.equal(await suggestedTransition.getAttribute('data-reactbits-button'), 'ghost', `${theme} ${width}px suggested-transition action uses the shared Studio button`);
        assert.ok((await suggestedTransition.getAttribute('class'))?.includes('text-studio-primary-contrast'), `${theme} ${width}px suggested-transition action uses the contrast-safe Studio text token`);
        assert.ok(await contrastRatio(suggestedTransition) >= 4.5, `${theme} ${width}px suggested-transition action text contrast is at least 4.5:1`);
        await assertTabReachable(page, nodeDelete, suggestedTransition, `${theme} ${width}px suggested-transition action`);
        await suggestedTransition.focus();
        assert.equal(await suggestedTransition.evaluate((element) => document.activeElement === element), true, `${theme} ${width}px suggested-transition action receives keyboard focus`);
        await page.keyboard.press('Enter');
        assert.equal(await page.getByLabel('到状态', { exact: true }).inputValue(), 'shooting', `${theme} ${width}px Enter applies the suggested transition in the editor`);
      }
      const nodeCountBeforeAdd = await page.getByLabel('节点名称').count();
      await addNode.click();
      assert.equal(await page.getByLabel('节点名称').count(), nodeCountBeforeAdd + 1, `${theme} ${width}px add-node action appends an editable node`);
      assert.deepEqual(workflowAffordanceWrites, [], `${theme} ${width}px local node editing issues no business write`);
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await page.getByRole('heading', { name: '编辑审批流', exact: true }).waitFor({ state: 'hidden' });
    }
  }

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/__qa?page=permissions&theme=light`);
    await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `permission role cards fit a ${width}px viewport without horizontal overflow`);
    const roleNames = page.getByTestId('role-name');
    for (let index = 0; index < await roleNames.count(); index += 1) {
      assert.equal(await roleNames.nth(index).evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length;
      }), 1, `role names remain on one line at ${width}px`);
    }
    const editButtons = page.getByTitle('编辑');
    assert.equal(await editButtons.count(), 3, `role edit actions remain available at ${width}px`);
    for (let index = 0; index < await editButtons.count(); index += 1) {
      const box = await editButtons.nth(index).boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width, `role edit action stays inside the ${width}px viewport`);
    }
    const deleteRole = page.getByRole('button', { name: '删除角色 内容运营' });
    const deleteBox = await deleteRole.boundingBox();
    assert(deleteBox && deleteBox.x >= 0 && deleteBox.x + deleteBox.width <= width, `custom role delete action stays inside the ${width}px viewport`);
    await page.screenshot({ path: `/tmp/xmt-permission-roles-${width}.png` });
  }

  await page.goto(`${base}/__qa?page=permissions&initialRoleReadFail=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('alert').getByText('模拟角色列表读取失败', { exact: true }).waitFor();
  assert.equal(await page.getByText('暂无角色', { exact: true }).count(), 0, 'a failed role read must not be presented as an empty role list');
  assert.equal(await page.getByTestId('role-name').count(), 0, 'unavailable role data is not rendered as a real empty result');
  const roleReadsBeforeRetry = roleReadRequests;
  await page.getByRole('button', { name: '重新加载角色列表', exact: true }).click();
  await page.getByText('内容运营', { exact: true }).waitFor();
  assert.equal(roleReadRequests, roleReadsBeforeRetry + 1, 'role list retry performs one read');

  await page.goto(`${base}/__qa?page=permissions&initialPermissionReadFail=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('alert').getByText('模拟权限清单读取失败', { exact: true }).waitFor();
  assert.equal(await page.getByTestId('role-name').count(), 0, 'the page does not show editable roles when the permission catalog is unavailable');
  const permissionReadsBeforeRetry = permissionReadRequests;
  await page.getByRole('button', { name: '重新加载角色列表', exact: true }).click();
  await page.getByText('内容运营', { exact: true }).waitFor();
  assert.equal(permissionReadRequests, permissionReadsBeforeRetry + 1, 'permission catalog retry performs one read');

  await page.goto(`${base}/__qa?page=permissions&createFailOnce=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('button', { name: '新建角色', exact: true }).click();
  await page.getByRole('heading', { name: '新建角色', exact: true }).waitFor();
  await page.getByPlaceholder('如 editor').fill('retry_create_role');
  await page.getByPlaceholder('如 编辑').fill('创建失败后重试角色');
  const failedRoleCreateResponse = page.waitForResponse((response) => response.url().endsWith('/api/roles') && response.request().method() === 'POST' && response.status() === 503);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await failedRoleCreateResponse;
  await page.getByRole('alert').getByText('角色创建结果尚未确认。请只读核实服务器角色列表；核实期间所有角色写入均已暂停。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '新建角色', exact: true }).count(), 1, 'a rejected create keeps its form open for retry');
  const pendingRoleCreateDialog = page.getByRole('dialog', { name: '新建角色', exact: true });
  assert.equal(await pendingRoleCreateDialog.count(), 1, 'the pending create retains its accessible dialog');
  assert.equal(await page.getByPlaceholder('如 editor').isDisabled(), true, 'a create with an ambiguous server result cannot be edited before readback');
  assert.equal(await page.getByPlaceholder('如 editor').inputValue(), 'retry_create_role', 'the locked create form retains the original role code');
  assert.equal(await page.getByPlaceholder('如 编辑').inputValue(), '创建失败后重试角色', 'the locked create form retains the original role name');
  assert.equal(roleCreateRequests, 1, 'the rejected create issues exactly one request before explicit retry');
  assert.equal(permissionRoles.length, 3, 'a rejected create does not mutate the server role fixture');
  assert.equal(permissionRoles.some((role) => role.code === 'retry_create_role'), false, 'a failed create is absent from the server role fixture');

  const verifyAbsentRoleButton = pendingRoleCreateDialog.getByRole('button', { name: '只读核实创建结果', exact: true });
  assert.equal(await verifyAbsentRoleButton.isVisible(), true, 'the read-only verification action is inside the active dialog, not behind its backdrop');
  assert.equal(await verifyAbsentRoleButton.isEnabled(), true, 'read-only role create verification is available after the failed POST');
  const absentRoleRead = page.waitForResponse((response) => response.url().endsWith('/api/roles') && response.request().method() === 'GET' && response.status() === 200);
  await verifyAbsentRoleButton.click();
  await absentRoleRead;
  await page.getByRole('alert').getByText('只读读取的服务器角色列表中未找到编码“retry_create_role”。系统不会自动重发；角色编码在服务器端唯一，你可以恢复原表单后手动重试。', { exact: true }).waitFor();
  assert.equal(roleCreateRequests, 1, 'read-only create verification does not repeat the POST');

  const restoreRoleFormButton = pendingRoleCreateDialog.getByRole('button', { name: '恢复原表单后手动重试', exact: true });
  assert.equal(await restoreRoleFormButton.isVisible(), true, 'the safe recovery action stays inside the active dialog');
  await restoreRoleFormButton.click();
  assert.equal(await page.getByPlaceholder('如 editor').inputValue(), 'retry_create_role', 'the confirmed-absent recovery restores the original role code');
  assert.equal(await page.getByPlaceholder('如 编辑').inputValue(), '创建失败后重试角色', 'the confirmed-absent recovery restores the original role name');

  const retriedRoleCreate = page.waitForResponse((response) => response.url().endsWith('/api/roles') && response.request().method() === 'POST' && response.status() === 200);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await retriedRoleCreate;
  await page.getByText('创建成功', { exact: true }).waitFor();
  await page.getByTestId('role-name').filter({ hasText: '创建失败后重试角色' }).waitFor();
  await page.getByRole('heading', { name: '新建角色', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(roleCreateRequests, 2, 'an explicit create retry issues exactly one additional request');
  assert.equal(permissionRoles.length, 4, 'the explicit create retry mutates the server role fixture once');

  await page.goto(`${base}/__qa?page=permissions&createCommitLost=1&createVerifyReadFailOnce=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('button', { name: '新建角色', exact: true }).click();
  await page.getByRole('heading', { name: '新建角色', exact: true }).waitFor();
  await page.getByPlaceholder('如 editor').fill('committed_create_role');
  await page.getByPlaceholder('如 编辑').fill('响应丢失后核实创建角色');
  const committedButUnconfirmedCreate = page.waitForResponse((response) => response.url().endsWith('/api/roles') && response.request().method() === 'POST' && response.status() === 503);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await committedButUnconfirmedCreate;
  await page.getByRole('alert').getByText('角色创建结果尚未确认。请只读核实服务器角色列表；核实期间所有角色写入均已暂停。', { exact: true }).waitFor();
  assert.equal(permissionRoles.filter((role) => role.code === 'committed_create_role').length, 1, 'the fixture committed the role before returning an ambiguous response');
  assert.equal(roleCreateRequests, 1, 'the committed-but-unconfirmed create issued exactly one POST');

  const failedCreateRead = page.waitForResponse((response) => response.url().endsWith('/api/roles') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '只读核实创建结果', exact: true }).click();
  await failedCreateRead;
  await page.getByRole('alert').getByText('模拟角色创建结果读取失败', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('alert').getByText('角色创建结果尚未确认。请只读核实服务器角色列表；核实期间所有角色写入均已暂停。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '新建角色', exact: true }).isDisabled(), true, 'refresh restores the pending create verification lock');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:role-create-pending:v1:user:96') !== null), true, 'the pending create payload is stored per account for refresh recovery');
  assert.equal(roleCreateRequests, 1, 'restoring pending create verification does not issue another POST');

  const verifiedCreatedRole = page.waitForResponse((response) => response.url().endsWith('/api/roles') && response.request().method() === 'GET' && response.status() === 200);
  await page.getByRole('button', { name: '只读核实创建结果', exact: true }).click();
  await verifiedCreatedRole;
  await page.getByText('创建已确认', { exact: true }).waitFor();
  await page.getByTestId('role-name').filter({ hasText: '响应丢失后核实创建角色' }).waitFor();
  assert.equal(permissionRoles.filter((role) => role.code === 'committed_create_role').length, 1, 'readback confirms the single committed role');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:role-create-pending:v1:user:96')), null, 'confirmed create readback clears the per-account recovery snapshot');
  assert.equal(roleCreateRequests, 1, 'read-only create recovery never repeats the committed POST');

  await page.goto(`${base}/__qa?page=permissions&createCommitLost=1&createConflict=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('button', { name: '新建角色', exact: true }).click();
  await page.getByRole('heading', { name: '新建角色', exact: true }).waitFor();
  await page.getByPlaceholder('如 editor').fill('conflicted_create_role');
  await page.getByPlaceholder('如 编辑').fill('本次创建的名称');
  const conflictedRoleCreate = page.waitForResponse((response) => response.url().endsWith('/api/roles') && response.request().method() === 'POST' && response.status() === 503);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await conflictedRoleCreate;
  const conflictedRoleRead = page.waitForResponse((response) => response.url().endsWith('/api/roles') && response.request().method() === 'GET' && response.status() === 200);
  await page.getByRole('button', { name: '只读核实创建结果', exact: true }).click();
  await conflictedRoleRead;
  await page.getByRole('alert').getByText('服务器中已存在编码“conflicted_create_role”的角色“服务器已存在的不同角色”，但名称、描述或权限集合与本次创建不一致。页面已显示服务器当前值，不会自动覆盖或重发。', { exact: true }).waitFor();
  assert.equal(permissionRoles.filter((role) => role.code === 'conflicted_create_role').length, 1, 'an existing code with different details remains a single authoritative server role');
  assert.equal(roleCreateRequests, 1, 'conflict readback does not repeat the role create');
  await page.getByRole('button', { name: '采用服务器当前状态并结束核实', exact: true }).click();
  await page.getByRole('alert').waitFor({ state: 'hidden' });
  assert.equal(await page.getByTestId('role-name').filter({ hasText: '服务器已存在的不同角色' }).count(), 1, 'accepting the observed state leaves the server role visible');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:role-create-pending:v1:user:96')), null, 'accepting observed server state clears pending create recovery');
  assert.equal(roleCreateRequests, 1, 'ending conflict recovery does not submit another create');

  await page.goto(`${base}/__qa?page=permissions&createRefreshFail=1&delayCreate=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('button', { name: '新建角色', exact: true }).click();
  await page.getByRole('heading', { name: '新建角色', exact: true }).waitFor();
  await page.getByPlaceholder('如 editor').fill('qa_role');
  await page.getByPlaceholder('如 编辑').fill('隔离测试角色');
  const roleCreateResponse = page.waitForResponse((response) => response.url().endsWith('/api/roles') && response.request().method() === 'POST' && response.status() === 200);
  const failedRoleListRefresh = page.waitForResponse((response) => response.url().endsWith('/api/roles') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '创建', exact: true }).evaluate((button) => {
    button.click();
    button.click();
  });
  await Promise.all([roleCreateResponse, failedRoleListRefresh]);
  await page.getByText('服务器已确认角色创建，但列表刷新失败；请重新加载确认，不要重复创建。', { exact: true }).waitFor();
  assert.equal(roleCreateRequests, 1, 'rapid duplicate role create submits once');
  assert.equal(permissionRoles.length, 4, 'the isolated role create was confirmed by the server fixture');
  assert.equal(await page.getByTestId('role-name').count(), 3, 'the page does not fabricate a role row before reloading server data');
  const roleReadsBeforeWriteRetry = roleReadRequests;
  await page.getByRole('button', { name: '重新加载角色列表', exact: true }).click();
  await page.getByText('隔离测试角色', { exact: true }).waitFor();
  assert.equal(roleReadRequests, roleReadsBeforeWriteRetry + 1, 'post-write recovery retries only the list read');
  assert.equal(roleCreateRequests, 1, 'read-only retry does not repeat role creation');

  await page.goto(`${base}/__qa?page=permissions&updateFailOnce=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('button', { name: '编辑角色 内容运营' }).click();
  await page.getByRole('heading', { name: '编辑角色', exact: true }).waitFor();
  const editRoleDialog = page.getByRole('dialog', { name: '编辑角色' });
  await page.getByPlaceholder('如 编辑').fill('编辑失败后重试角色');
  const failedRoleUpdateResponse = page.waitForResponse((response) => response.url().endsWith('/api/roles/3') && response.request().method() === 'PUT' && response.status() === 503);
  await editRoleDialog.getByRole('button', { name: '保存', exact: true }).click();
  await failedRoleUpdateResponse;
  await editRoleDialog.getByRole('alert').getByText('角色更新结果尚未确认。请只读核实服务器当前角色状态；核实完成前，所有角色写入均已暂停。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '编辑角色', exact: true }).count(), 1, 'a rejected update keeps its form open for retry');
  assert.equal(await page.getByPlaceholder('如 编辑').inputValue(), '编辑失败后重试角色', 'a rejected update retains the edited role name');
  assert.equal(await page.getByPlaceholder('如 编辑').isDisabled(), true, 'an unconfirmed update locks the retained form');
  assert.equal(await editRoleDialog.getByRole('button', { name: '保存', exact: true }).isDisabled(), true, 'an unconfirmed update cannot be resubmitted before readback');
  assert.equal(await editRoleDialog.getByRole('button', { name: '取消', exact: true }).isDisabled(), true, 'an unconfirmed update cannot discard its retained form');
  assert.equal(await editRoleDialog.getByRole('button', { name: '只读核实角色权限', exact: true }).isVisible(), true, 'read-only recovery is reachable inside the edit dialog');
  assert.equal(roleUpdateRequests, 1, 'the rejected update issues exactly one request before explicit retry');
  assert.equal(permissionRoles.find((role) => role.id === 3)?.name, '内容运营', 'a rejected update does not mutate the server role fixture');
  assert.equal(await page.getByTestId('role-name').filter({ hasText: '内容运营' }).count(), 1, 'the role list keeps the original server-confirmed name after rejection');

  const unchangedRoleReadback = page.waitForResponse((response) => response.url().endsWith('/api/roles/3') && response.request().method() === 'GET' && response.status() === 200);
  await editRoleDialog.getByRole('button', { name: '只读核实角色权限', exact: true }).click();
  await unchangedRoleReadback;
  await editRoleDialog.getByRole('alert').getByText('已读取服务器角色“内容运营”，但名称、描述或权限集合与本次修改不一致。页面已显示服务器当前值，不会自动覆盖或重发。', { exact: true }).waitFor();
  const restoreUpdatedRoleFormButton = editRoleDialog.getByRole('button', { name: '恢复原表单后手动重试', exact: true });
  assert.equal(await restoreUpdatedRoleFormButton.isVisible(), true, 'readback makes explicit form recovery available inside the dialog');
  await restoreUpdatedRoleFormButton.click();
  assert.equal(await page.getByPlaceholder('如 编辑').inputValue(), '编辑失败后重试角色', 'restoring after readback preserves the intended edit');
  assert.equal(await page.getByPlaceholder('如 编辑').isDisabled(), false, 'the form unlocks only after readback confirms the server state');
  assert.equal(roleUpdateRequests, 1, 'readback and form restoration do not automatically repeat the update');

  const retriedRoleUpdate = page.waitForResponse((response) => response.url().endsWith('/api/roles/3') && response.request().method() === 'PUT' && response.status() === 200);
  await editRoleDialog.getByRole('button', { name: '保存', exact: true }).click();
  await retriedRoleUpdate;
  await page.getByText('更新成功', { exact: true }).waitFor();
  await page.getByTestId('role-name').filter({ hasText: '编辑失败后重试角色' }).waitFor();
  await page.getByRole('heading', { name: '编辑角色', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(roleUpdateRequests, 2, 'an explicit update retry issues exactly one additional request');
  assert.equal(permissionRoles.find((role) => role.id === 3)?.name, '编辑失败后重试角色', 'the explicit update retry changes the server role fixture');

  await page.goto(`${base}/__qa?page=permissions&updateCommitLost=1&updateVerifyReadFailOnce=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('button', { name: '编辑角色 内容运营' }).click();
  await page.getByRole('heading', { name: '编辑角色', exact: true }).waitFor();
  await page.getByPlaceholder('如 编辑').fill('响应丢失后核实角色');
  await page.getByPlaceholder('角色描述').fill('只读核实权限集合');
  await page.getByRole('checkbox').first().uncheck();
  const committedButUnconfirmedUpdate = page.waitForResponse((response) => response.url().endsWith('/api/roles/3') && response.request().method() === 'PUT' && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await committedButUnconfirmedUpdate;
  await page.getByRole('alert').getByText('角色更新结果尚未确认。请只读核实服务器当前角色状态；核实完成前，所有角色写入均已暂停。', { exact: true }).waitFor();
  assert.equal(permissionRoles.find((role) => role.id === 3)?.name, '响应丢失后核实角色', 'the isolated server committed the role update before returning 503');
  assert.equal(permissionRoles.find((role) => role.id === 3)?.permissions.length, 0, 'the isolated server committed the updated permission set');
  assert.equal(await page.getByPlaceholder('如 编辑').isDisabled(), true, 'the unconfirmed role form cannot be changed');
  assert.equal(await page.getByRole('button', { name: '保存', exact: true }).isDisabled(), true, 'the unconfirmed role form cannot be resubmitted');
  assert.equal(await page.getByRole('button', { name: '关闭角色编辑', exact: true }).isDisabled(), true, 'the pending role edit cannot be dismissed before readback');
  assert.equal(await page.getByRole('button', { name: '新建角色', exact: true }).isDisabled(), true, 'other role writes stay paused while the update result is unknown');
  assert.equal(roleUpdateRequests, 1, 'a committed-but-unconfirmed update has exactly one PUT');

  const failedRoleStatusRead = page.waitForResponse((response) => response.url().endsWith('/api/roles/3') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('dialog', { name: '编辑角色' }).getByRole('button', { name: '只读核实角色权限', exact: true }).click();
  await failedRoleStatusRead;
  await page.getByText('模拟角色当前状态读取失败', { exact: true }).waitFor();
  assert.equal(roleUpdateRequests, 1, 'a failed status read does not repeat the role update');

  await page.reload();
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('alert').getByText('角色更新结果尚未确认。请只读核实服务器当前角色状态；核实完成前，所有角色写入均已暂停。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '新建角色', exact: true }).isDisabled(), true, 'refresh restores the pending role verification lock outside the edit dialog');
  assert.equal(roleUpdateRequests, 1, 'restoring pending verification after refresh does not repeat the role update');

  const verifiedRoleStatus = page.waitForResponse((response) => response.url().endsWith('/api/roles/3') && response.request().method() === 'GET' && response.status() === 200);
  await page.getByRole('button', { name: '只读核实角色权限', exact: true }).click();
  await verifiedRoleStatus;
  await page.getByTestId('role-name').filter({ hasText: '响应丢失后核实角色' }).waitFor();
  await page.getByRole('heading', { name: '编辑角色', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.getByText('只读核实权限集合', { exact: true }).count(), 1, 'the page updates the displayed description from the authoritative role readback');
  assert.equal(await page.getByText('0 权限', { exact: true }).count(), 1, 'the page updates the displayed permission count from the authoritative role readback');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:role-update-pending:v1:user:96')), null, 'a confirmed readback clears the per-account pending verification snapshot');
  assert.equal(roleDetailReadRequests, 2, 'role recovery performs only the two explicit read-only status checks');
  assert.equal(roleReadRequests, 2, 'only the page reload performs an additional full list read; recovery itself uses the role detail GET');
  assert.equal(roleUpdateRequests, 1, 'read-only verification does not repeat the committed role update');

  await page.goto(`${base}/__qa?page=permissions&updateRefreshFail=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('button', { name: '编辑角色 内容运营' }).click();
  await page.getByRole('heading', { name: '编辑角色', exact: true }).waitFor();
  await page.getByPlaceholder('如 编辑').fill('更新后的内容运营');
  const roleUpdateResponse = page.waitForResponse((response) => response.url().endsWith('/api/roles/3') && response.request().method() === 'PUT' && response.status() === 200);
  const failedRoleUpdateRefresh = page.waitForResponse((response) => response.url().endsWith('/api/roles') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await Promise.all([roleUpdateResponse, failedRoleUpdateRefresh]);
  await page.getByText('服务器已确认角色更新，但列表刷新失败；请重新加载确认，不要重复保存。', { exact: true }).waitFor();
  assert.equal(roleUpdateRequests, 1, 'the role update was sent once before the failed list refresh');
  assert.equal(await page.getByText('更新后的内容运营', { exact: true }).count(), 0, 'the page does not invent updated role details before reloading');
  const roleReadsBeforeUpdateRetry = roleReadRequests;
  await page.getByRole('button', { name: '重新加载角色列表', exact: true }).click();
  await page.getByText('更新后的内容运营', { exact: true }).waitFor();
  assert.equal(roleReadRequests, roleReadsBeforeUpdateRetry + 1, 'update recovery retries only the list read');
  assert.equal(roleUpdateRequests, 1, 'read-only update recovery does not repeat the role update');

  await page.goto(`${base}/__qa?page=permissions&deleteFailOnce=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('button', { name: '删除角色 内容运营' }).click();
  await page.getByRole('heading', { name: '确认删除角色', exact: true }).waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(roleDeleteRequests, 0, 'cancelling role deletion does not issue a write');
  await page.getByRole('button', { name: '删除角色 内容运营' }).click();
  const failedRoleDelete = page.waitForResponse((response) => response.url().endsWith('/api/roles/3') && response.request().method() === 'DELETE' && response.status() === 503);
  await page.getByRole('button', { name: '删除角色', exact: true }).click();
  await failedRoleDelete;
  await page.getByRole('alert').getByText('角色删除结果尚未确认。请只读核实服务器当前角色状态；核实期间所有角色写入均已暂停。', { exact: true }).waitFor();
  assert.equal(permissionRoles.some((role) => role.id === 3), true, 'failed role deletion leaves the server role intact');
  assert.equal(await page.getByRole('heading', { name: '确认删除角色', exact: true }).count(), 0, 'an ambiguous delete closes its confirmation and exposes the read-only recovery notice');
  assert.equal(await page.getByRole('button', { name: '新建角色', exact: true }).isDisabled(), true, 'an ambiguous role deletion pauses other role writes');
  const failedDeleteStatusRead = page.waitForResponse((response) => response.url().endsWith('/api/roles/3') && response.request().method() === 'GET' && response.status() === 200);
  await page.getByRole('button', { name: '只读核实删除结果', exact: true }).click();
  await failedDeleteStatusRead;
  await page.getByRole('alert').getByText('服务器仍存在角色“内容运营”，本次删除尚未得到确认。页面已显示服务器当前资料，不会自动重发。', { exact: true }).waitFor();
  assert.equal(roleDeleteRequests, 1, 'read-only delete verification does not repeat DELETE');
  await page.getByRole('button', { name: '采用服务器当前状态并结束核实', exact: true }).click();
  await page.getByRole('alert').waitFor({ state: 'hidden' });
  assert.equal(roleDeleteRequests, 1, 'accepting the authoritative existing role does not retry deletion');
  await page.getByRole('button', { name: '删除角色 内容运营' }).click();
  await page.getByRole('button', { name: '删除角色', exact: true }).click();
  await page.getByRole('heading', { name: '确认删除角色', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(permissionRoles.some((role) => role.id === 3), false, 'successful role deletion removes the isolated role');
  assert.equal(await page.getByTestId('role-name').count(), 2, 'confirmed role deletion immediately updates the current list');
  assert.equal(roleDeleteRequests, 2, 'failed delete retry issues exactly one additional request');

  await page.goto(`${base}/__qa?page=permissions&deleteCommitLost=1&deleteVerifyReadFailOnce=1`);
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('button', { name: '删除角色 内容运营' }).click();
  await page.getByRole('heading', { name: '确认删除角色', exact: true }).waitFor();
  const committedButUnconfirmedDelete = page.waitForResponse((response) => response.url().endsWith('/api/roles/3') && response.request().method() === 'DELETE' && response.status() === 503);
  await page.getByRole('button', { name: '删除角色', exact: true }).click();
  await committedButUnconfirmedDelete;
  await page.getByRole('alert').getByText('角色删除结果尚未确认。请只读核实服务器当前角色状态；核实期间所有角色写入均已暂停。', { exact: true }).waitFor();
  assert.equal(permissionRoles.some((role) => role.id === 3), false, 'the fixture committed deletion before returning an ambiguous response');
  assert.equal(roleDeleteRequests, 1, 'the committed-but-unconfirmed deletion issued exactly one DELETE');
  const failedDeleteRead = page.waitForResponse((response) => response.url().endsWith('/api/roles/3') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '只读核实删除结果', exact: true }).click();
  await failedDeleteRead;
  await page.getByRole('alert').getByText('模拟角色删除结果读取失败', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: '角色权限管理', exact: true }).waitFor();
  await page.getByRole('alert').getByText('角色删除结果尚未确认。请只读核实服务器当前角色状态；核实期间所有角色写入均已暂停。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '新建角色', exact: true }).isDisabled(), true, 'refresh restores the pending role deletion lock');
  assert.equal(roleDeleteRequests, 1, 'refresh recovery does not repeat the committed DELETE');
  const confirmedDeletedRoleRead = page.waitForResponse((response) => response.url().endsWith('/api/roles/3') && response.request().method() === 'GET' && response.status() === 404);
  await page.getByRole('button', { name: '只读核实删除结果', exact: true }).click();
  await confirmedDeletedRoleRead;
  await page.getByText('删除已确认', { exact: true }).waitFor();
  await page.getByRole('alert').waitFor({ state: 'hidden' });
  assert.equal(await page.getByTestId('role-name').count(), 2, '404 readback confirms the committed role deletion');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:role-delete-pending:v1:user:96')), null, 'confirmed deletion clears the per-account recovery snapshot');
  assert.equal(roleDeleteRequests, 1, 'read-only deletion recovery does not issue a second DELETE');

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/__qa?delete=1`);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.getByTitle('删除').click();
  await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor();
  failNextWorkflowTemplateDelete = true;
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('审批流模板“阶段顺序验收模板”仍在服务器上，本次删除未确认；如仍需删除，请重新确认操作。', { exact: true }).waitFor();
  assert.equal(workflowTemplateExists, true, 'failed workflow template deletion leaves the isolated template intact');
  assert.equal(await page.getByRole('heading', { name: '确认删除', exact: true }).count(), 0, 'ambiguous deletion closes its confirmation after read-back confirms the template still exists');
  await page.getByTitle('删除').click();
  await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('删除成功', { exact: true }).waitFor();
  assert.equal(workflowTemplateExists, false, 'successful workflow template deletion removes the isolated template');

  await page.goto(`${base}/__qa?page=templates&initialReadFail=1`);
  await page.getByRole('heading', { name: '选题模板', exact: true }).waitFor();
  await page.getByText('列表读取失败，暂时无法确认已有模板。请重新加载列表后再试。', { exact: true }).waitFor();
  assert.equal(await page.getByText('还没有选题模板', { exact: true }).count(), 0, 'a failed initial read must not look like an empty template library');
  const failedInitialReadCount = templateManagementReadCount;
  await page.request.post(`${base}/__qa/fail-next-template-management-read`);
  const failedTemplateRetry = page.waitForResponse((response) => response.url().endsWith('/api/templates') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await failedTemplateRetry;
  await page.getByRole('status').getByText('模板列表仍无法刷新，请稍后重试；不要重复提交已确认的操作。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '重新加载列表', exact: true }).count(), 1, 'an unavailable retry keeps one visible list-reload action');
  const recoveredInitialTemplateRead = page.waitForResponse((response) => response.url().endsWith('/api/templates') && response.request().method() === 'GET' && response.status() === 200);
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await recoveredInitialTemplateRead;
  await page.getByText('还没有选题模板', { exact: true }).waitFor();
  assert.equal(templateManagementReadCount, failedInitialReadCount + 2, 'each explicit initial-load retry performs one GET and the final read recovers');

  await page.goto(`${base}/__qa?page=templates`);
  await page.getByRole('heading', { name: '选题模板', exact: true }).waitFor();
  await page.getByRole('textbox', { name: '名称' }).fill('刷新失败模板');
  await page.getByRole('textbox', { name: '模板正文' }).fill('仅用于隔离刷新恢复测试。');
  delayNextTemplateManagementCreate = true;
  failNextTemplateManagementRead = true;
  const templateCreate = page.waitForResponse((response) => response.url().endsWith('/api/templates') && response.request().method() === 'POST' && response.status() === 200);
  const failedTemplateRefresh = page.waitForResponse((response) => response.url().endsWith('/api/templates') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '保存模板', exact: true }).evaluate((button) => {
    const form = button.closest('form');
    if (!(form instanceof HTMLFormElement)) throw new Error('template form was not found');
    form.requestSubmit();
    form.requestSubmit();
  });
  await Promise.all([templateCreate, failedTemplateRefresh]);
  await page.getByText('模板已创建；列表刷新失败，请重新加载列表确认。', { exact: true }).waitFor();
  assert.equal(templateManagementTemplates.length, 1, 'the create mutation persisted despite the failed list refresh');
  assert.equal(templateManagementCreateCount, 1, 'template create was submitted once before the refresh retry');
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await page.getByText('刷新失败模板', { exact: true }).waitFor();
  assert.equal(templateManagementCreateCount, 1, 'retry reload does not repeat the template create mutation');

  await page.goto(`${base}/__qa?page=workflow-mutations&initialListFail=1`);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.getByRole('alert').getByText('审批流模板列表读取失败，当前无法确认是否有可用模板。请重新加载列表。', { exact: true }).waitFor();
  assert.equal(await page.getByText('暂无审批流模板', { exact: true }).count(), 0, 'a failed initial workflow template read is not presented as an empty list');
  assert.equal(workflowMutationTemplates.length, 1, 'the initial read failure leaves the isolated fixture populated');
  const workflowListReadsBeforeInitialRetry = workflowMutationListRequests;
  await page.getByRole('button', { name: '重新加载审批流模板列表', exact: true }).click();
  await page.getByText('隔离审批流模板', { exact: true }).waitFor();
  assert.equal(workflowMutationListRequests, workflowListReadsBeforeInitialRetry + 1, 'initial workflow list recovery performs one read');

  await page.goto(`${base}/__qa?page=workflow-mutations&createFailOnce=1&createRefreshFailOnce=1&createDelayMs=180&createDelayRequest=2&listDelayMs=180&listDelayRequest=3`);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.getByRole('button', { name: '新建模板', exact: true }).click();
  await page.getByRole('heading', { name: '新建审批流', exact: true }).waitFor();
  await page.getByLabel('模板名称', { exact: true }).fill('创建失败后重试审批流');
  await page.getByLabel('描述', { exact: true }).fill('显式重试并验证列表只读恢复');
  const failedWorkflowCreate = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates') && response.request().method() === 'POST' && response.status() === 503);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await failedWorkflowCreate;
  await page.getByText('服务器暂未找到对应记录。可使用相同请求编号安全重试；请求内容保持不变。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '新建审批流', exact: true }).count(), 1, 'a rejected workflow template create keeps its form open');
  assert.equal(await page.getByLabel('模板名称', { exact: true }).inputValue(), '创建失败后重试审批流', 'a rejected create retains the entered template name');
  assert.equal(await page.getByLabel('描述', { exact: true }).inputValue(), '显式重试并验证列表只读恢复', 'a rejected create retains the entered description');
  assert.equal(workflowMutationCreateRequests, 1, 'the failed create issues one POST before explicit retry');
  assert.equal(workflowMutationTemplates.length, 1, 'the failed create does not mutate the fixture list');
  assert.equal(workflowMutationTemplates.some((item) => item.name === '创建失败后重试审批流'), false, 'the rejected create is absent from server-confirmed fixture data');
  assert.equal(workflowCreateRecoveryStatusRequests.length, 1, 'the failed POST is followed by one read-only status check');
  const originalCreatePayload = workflowMutationCreateBodies[0];
  const originalCreateRequestId = String(originalCreatePayload.client_request_id || '');
  assert.match(originalCreateRequestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'the client persists a UUID request key for a template create');
  assert.deepEqual(workflowCreateRecoveryStatusRequests[0], { requestId: originalCreateRequestId, actorId: 96 }, 'the status check uses the original request UUID and account');
  assert.equal(workflowMutationCreateRequests, 1, 'a read-only 404 status check does not automatically repeat the POST');

  const createRequestsBeforeRetry = workflowMutationCreateRequests;
  const delayedWorkflowCreateRequest = page.waitForRequest((request) => request.url().endsWith('/api/workflow-templates') && request.method() === 'POST');
  const retriedWorkflowCreate = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates') && response.request().method() === 'POST' && response.status() === 200);
  const failedWorkflowCreateRefresh = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '使用同一请求编号安全重试', exact: true }).evaluate((element) => {
    if (!(element instanceof HTMLButtonElement)) throw new Error('workflow create submit button was not found');
    element.click();
    element.click();
  });
  await delayedWorkflowCreateRequest;
  await page.waitForTimeout(40);
  assert.equal(workflowMutationCreateRequests, createRequestsBeforeRetry + 1, 'rapid duplicate clicks during the delayed POST still issue only one create request');
  assert.equal(workflowMutationTemplates.length, 1, 'the delayed POST has not mutated fixture data before its response');
  await Promise.all([retriedWorkflowCreate, failedWorkflowCreateRefresh]);
  await page.getByRole('alert').getByText('服务器已确认模板“创建失败后重试审批流”创建成功，内容已保存，但列表未刷新；请只重新加载列表，不要重复提交。', { exact: true }).waitFor();
  assert.equal(workflowMutationCreateRequests, createRequestsBeforeRetry + 1, 'the delayed successful retry is the only additional POST');
  assert.equal(workflowMutationCreateBodies.length, 2, 'the explicit not-found retry is the only second create request');
  assert.equal(workflowMutationCreateBodies[1].client_request_id, originalCreateRequestId, 'explicit retry reuses the exact original request UUID');
  assert.deepEqual(workflowMutationCreateBodies[1], originalCreatePayload, 'explicit retry preserves the exact original create payload');
  assert.equal(workflowMutationTemplates.length, 2, 'the successful retry creates exactly one server fixture row');
  assert.equal(await page.getByRole('heading', { name: '新建审批流', exact: true }).count(), 0, 'the confirmed create closes the form even when its list refresh fails');
  assert.equal(await page.getByText('创建失败后重试审批流', { exact: true }).count(), 0, 'the client does not fabricate a row before reloading the list');
  assert.equal(await page.getByRole('button', { name: /^新建模板/ }).isDisabled(), true, 'a confirmed create with an unavailable list blocks another create');
  assert.equal(await page.getByRole('button', { name: /^编辑审批流 隔离审批流模板/ }).isDisabled(), true, 'a confirmed create with an unavailable list blocks editing stale rows');
  assert.equal(await page.getByRole('button', { name: /^删除审批流 隔离审批流模板/ }).isDisabled(), true, 'a confirmed create with an unavailable list blocks deletion of stale rows');
  assert.equal(workflowMutationCreateRequests, 2, 'blocked create actions do not issue another POST');
  assert.equal(workflowMutationUpdateRequests, 0, 'blocked edit actions do not issue a PUT');
  assert.equal(workflowMutationDeleteRequests, 0, 'blocked delete actions do not issue a DELETE');
  const workflowListReadsBeforeCreateRecovery = workflowMutationListRequests;
  const createRecoveryRequest = page.waitForRequest((request) => request.url().endsWith('/api/workflow-templates') && request.method() === 'GET');
  const createRecoveryResponse = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates') && response.request().method() === 'GET' && response.status() === 200);
  await page.getByRole('button', { name: '重新加载审批流模板列表', exact: true }).evaluate((element) => {
    if (!(element instanceof HTMLButtonElement)) throw new Error('workflow list reload button was not found');
    element.click();
    element.click();
  });
  await createRecoveryRequest;
  await page.waitForTimeout(40);
  assert.equal(workflowMutationListRequests, workflowListReadsBeforeCreateRecovery + 1, 'rapid duplicate list-retry clicks during the delayed GET issue only one request');
  assert.equal(workflowMutationCreateRequests, 2, 'list-retry clicks do not repeat the confirmed create');
  assert.equal(workflowMutationUpdateRequests, 0, 'list-retry clicks do not issue an update');
  assert.equal(workflowMutationDeleteRequests, 0, 'list-retry clicks do not issue a delete');
  await createRecoveryResponse;
  const workflowListReadsAfterCreateRecovery = workflowMutationListRequests;
  await page.getByText('创建失败后重试审批流', { exact: true }).waitFor();
  assert.equal(workflowMutationListRequests, workflowListReadsAfterCreateRecovery, 'post-create recovery completes with exactly one list GET');
  assert.equal(workflowMutationCreateRequests, createRequestsBeforeRetry + 1, 'post-create recovery does not repeat the POST');
  assert.equal(await page.getByRole('button', { name: '新建模板', exact: true }).isEnabled(), true, 'a successful list recovery re-enables create actions');
  assert.equal(await page.getByRole('button', { name: '编辑审批流 隔离审批流模板', exact: true }).isEnabled(), true, 'a successful list recovery re-enables editing');
  assert.equal(await page.getByRole('button', { name: '删除审批流 隔离审批流模板', exact: true }).isEnabled(), true, 'a successful list recovery re-enables deletion');
  await page.getByRole('button', { name: '编辑审批流 隔离审批流模板', exact: true }).click();
  await page.getByRole('heading', { name: '编辑审批流', exact: true }).waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('heading', { name: '编辑审批流', exact: true }).waitFor({ state: 'hidden' });

  await page.goto(`${base}/__qa?page=workflow-create-recovery&statusFailCount=2`);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.getByRole('button', { name: '新建模板', exact: true }).click();
  await page.getByRole('heading', { name: '新建审批流', exact: true }).waitFor();
  await page.getByLabel('模板名称', { exact: true }).fill('响应丢失后恢复审批流');
  await page.getByLabel('描述', { exact: true }).fill('验证服务端已提交后的只读恢复');
  let lostCreateResponseCount = 0;
  await page.route('**/api/workflow-templates', async (route) => {
    if (route.request().method() === 'POST' && lostCreateResponseCount === 0) {
      lostCreateResponseCount += 1;
      await route.fetch();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  const lostWorkflowCreate = page.waitForEvent('requestfailed', (request) => request.url().endsWith('/api/workflow-templates') && request.method() === 'POST');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await lostWorkflowCreate;
  await page.getByRole('button', { name: '只读核实创建结果', exact: true }).waitFor();
  assert.equal(workflowMutationCreateRequests, 1, 'server committed the create once even though the browser lost its response');
  assert.equal(workflowMutationTemplates.filter((item) => item.name === '响应丢失后恢复审批流').length, 1, 'lost-response fixture contains exactly one committed template');
  assert.equal(await page.getByRole('heading', { name: '新建审批流', exact: true }).count(), 1, 'uncertain create keeps the form open until status is confirmed');
  assert.equal(await page.getByLabel('模板名称', { exact: true }).inputValue(), '响应丢失后恢复审批流', 'uncertain create retains the original name');
  assert.equal(await page.getByLabel('描述', { exact: true }).inputValue(), '验证服务端已提交后的只读恢复', 'uncertain create retains the original description');
  assert.equal(workflowCreateRecoveryStatusRequests.length, 1, 'a lost POST triggers only one initial status GET');
  const pendingRecovery = await page.evaluate(() => {
    const key = 'xmt:workflow-template-create-pending:v1:actor:96';
    const value = window.sessionStorage.getItem(key);
    return { key, value };
  });
  assert.ok(pendingRecovery.value, 'the pending request marker is saved in session storage under the creating actor ID');
  const pendingRecoveryRecord = JSON.parse(pendingRecovery.value) as { actorId: number; requestId: string; payload: Record<string, unknown> };
  assert.equal(pendingRecoveryRecord.actorId, 96, 'the saved recovery marker is scoped to actor 96');
  assert.equal(pendingRecoveryRecord.requestId, workflowMutationCreateBodies[0].client_request_id, 'the saved marker uses the submitted request UUID');
  assert.equal(pendingRecoveryRecord.payload.name, '响应丢失后恢复审批流', 'the saved marker retains the original form values');
  const createCountBeforeReadOnlyCheck = workflowMutationCreateRequests;
  const statusCountBeforeReadOnlyCheck = workflowCreateRecoveryStatusRequests.length;
  const unavailableStatusCheck = page.waitForResponse((response) => response.url().includes('/api/workflow-templates/create-requests/') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '只读核实创建结果', exact: true }).click();
  await unavailableStatusCheck;
  await page.getByRole('button', { name: '只读核实创建结果', exact: true }).waitFor();
  assert.equal(workflowCreateRecoveryStatusRequests.length, statusCountBeforeReadOnlyCheck + 1, 'explicit status check issues one status GET');
  assert.equal(workflowMutationCreateRequests, createCountBeforeReadOnlyCheck, 'status check never automatically repeats the create POST');

  await page.evaluate(() => {
    window.localStorage.setItem('xmt_user', JSON.stringify({ ...JSON.parse(window.localStorage.getItem('xmt_user') || '{}'), id: 97, username: 'workflow-language-qa-other', name: '另一测试账号' }));
    window.localStorage.setItem('xmt_token', 'workflow-language-fixture:97');
  });
  const otherActorListRead = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates') && response.request().method() === 'GET' && response.status() === 200);
  await page.reload();
  await otherActorListRead;
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.waitForTimeout(100);
  assert.equal(workflowCreateRecoveryStatusRequests.length, statusCountBeforeReadOnlyCheck + 1, 'another actor does not query the first actor’s saved request');
  assert.equal(workflowMutationCreateRequests, createCountBeforeReadOnlyCheck, 'switching actors does not repeat the first actor’s create');
  assert.equal(await page.getByRole('heading', { name: '新建审批流', exact: true }).count(), 0, 'another actor does not inherit the first actor’s pending form');
  assert.ok(await page.evaluate((key) => window.sessionStorage.getItem(key), pendingRecovery.key), 'switching actors preserves but does not expose the first actor’s session marker');

  await page.evaluate(() => {
    window.localStorage.setItem('xmt_user', JSON.stringify({ ...JSON.parse(window.localStorage.getItem('xmt_user') || '{}'), id: 96, username: 'workflow-language-qa', name: '审批流语言验收' }));
    window.localStorage.setItem('xmt_token', 'workflow-language-fixture');
  });
  const restoredActorSuccessNotice = page.getByRole('status').getByText('审批流模板“响应丢失后恢复审批流”已创建，不会重复创建。', { exact: true });
  const restoredActorSuccessNoticeVisible = restoredActorSuccessNotice.waitFor({ state: 'visible' });
  const restoredActorStatus = page.waitForResponse((response) => response.url().includes('/api/workflow-templates/create-requests/') && response.request().method() === 'GET' && response.status() === 200);
  await page.reload();
  await Promise.all([restoredActorStatus, restoredActorSuccessNoticeVisible]);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.getByText('响应丢失后恢复审批流', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '新建审批流', exact: true }).count(), 0, 'a status GET after refresh confirms creation and closes the form');
  assert.equal(await page.evaluate((key) => window.sessionStorage.getItem(key), pendingRecovery.key), null, 'confirmed recovery clears the actor-scoped saved marker');
  assert.equal(workflowMutationCreateRequests, createCountBeforeReadOnlyCheck, 'refresh recovery never repeats the committed POST');
  assert.equal(workflowMutationUpdateRequests, 0, 'create recovery performs no PUT');
  assert.equal(workflowMutationDeleteRequests, 0, 'create recovery performs no DELETE');
  assert.ok(workflowMutationListRequests >= 2, 'successful status recovery refreshes the list using GET');
  assert.equal(workflowCreateRecoveryStatusRequests.length, statusCountBeforeReadOnlyCheck + 2, 'only the owning actor’s explicit check and refresh issue status GETs');
  assert.deepEqual(workflowCreateRecoveryStatusRequests.at(-1), { requestId: pendingRecoveryRecord.requestId, actorId: 96 }, 'refresh recovery remains scoped to the original request and actor');
  await page.unroute('**/api/workflow-templates');

  await page.goto(`${base}/__qa?page=workflow-create-recovery&recoveryMode=deleted`);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.getByRole('button', { name: '新建模板', exact: true }).click();
  await page.getByRole('heading', { name: '新建审批流', exact: true }).waitFor();
  await page.getByLabel('模板名称', { exact: true }).fill('已删除的创建请求');
  await page.getByLabel('描述', { exact: true }).fill('验证删除墓碑禁止重建');
  let lostDeletedCreateResponseCount = 0;
  await page.route('**/api/workflow-templates', async (route) => {
    if (route.request().method() === 'POST' && lostDeletedCreateResponseCount === 0) {
      lostDeletedCreateResponseCount += 1;
      await route.fetch();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  const lostDeletedCreate = page.waitForEvent('requestfailed', (request) => request.url().endsWith('/api/workflow-templates') && request.method() === 'POST');
  const deletedRecoveryResponse = page.waitForResponse((response) => response.url().includes('/api/workflow-templates/create-requests/') && response.request().method() === 'GET' && response.status() === 410);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await lostDeletedCreate;
  await deletedRecoveryResponse;
  await page.getByText('模板“已删除的创建请求”已创建后被删除，不会因为恢复或重试而重新创建。', { exact: true }).waitFor();
  await page.getByRole('status').getByText('原创建请求已完成，但对应模板已删除；不会重新创建。', { exact: true }).waitFor();
  assert.equal(workflowMutationCreateRequests, 1, '410 tombstone handling does not issue another POST');
  assert.equal(workflowMutationTemplates.some((item) => item.name === '已删除的创建请求'), false, 'deleted tombstone does not recreate the removed template');
  assert.equal(workflowCreateRecoveryStatusRequests.length, 1, 'lost deleted-create response is resolved through one read-only status GET');
  assert.equal(await page.getByRole('heading', { name: '新建审批流', exact: true }).count(), 0, '410 recovery closes the original creation form');
  assert.equal(await page.getByRole('button', { name: '只读核实创建结果', exact: true }).count(), 0, '410 recovery does not offer a retry or repeat-status action');
  assert.equal(workflowMutationUpdateRequests, 0, 'deleted tombstone recovery performs no PUT');
  assert.equal(workflowMutationDeleteRequests, 0, 'deleted tombstone recovery performs no DELETE');
  assert.equal(expectedWorkflowCreateRequestFailures.length, 2, 'both server-committed create responses intentionally lost in the browser fixture are counted');
  await page.unroute('**/api/workflow-templates');

  await page.goto(`${base}/__qa?page=workflow-create-recovery`);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.getByRole('button', { name: '新建模板', exact: true }).click();
  await page.getByRole('heading', { name: '新建审批流', exact: true }).waitFor();
  await page.getByLabel('模板名称', { exact: true }).fill('请求编号冲突恢复');
  await page.getByLabel('描述', { exact: true }).fill('确保另一份内容不会被误认作本次创建');
  let conflictPostRequests = 0;
  let conflictingTemplateRequestId = '';
  let expectedConflictFingerprint = '';
  await page.route('**/api/workflow-templates', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    conflictPostRequests += 1;
    const submitted = route.request().postDataJSON() as Record<string, unknown>;
    conflictingTemplateRequestId = String(submitted.client_request_id || '');
    const conflictingPayload = { ...submitted, name: '服务器记录的另一份同编号模板' };
    expectedConflictFingerprint = workflowTemplateCreateFingerprint(submitted);
    workflowCreateRecoveryLedger.set(conflictingTemplateRequestId, {
      actorId: 96,
      templateId: 964,
      deleted: false,
      fingerprint: workflowTemplateCreateFingerprint(conflictingPayload),
    });
    workflowMutationTemplates.push({
      ...workflowMutationInitialTemplate,
      id: 964,
      name: String(conflictingPayload.name),
      description: String(conflictingPayload.description || ''),
    });
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ message: '审批流模板请求编号已用于其他账号或内容。' }),
    });
  });
  const conflictingCreateResponse = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates') && response.request().method() === 'POST' && response.status() === 409);
  const conflictingCreateStatus = page.waitForResponse((response) => response.url().includes('/api/workflow-templates/create-requests/') && response.request().method() === 'GET' && response.status() === 409);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await Promise.all([conflictingCreateResponse, conflictingCreateStatus]);
  const conflictNotice = '请求编号对应的账号或内容与当前恢复内容不一致。为避免重复创建，已暂停重试；请核对模板列表和账号。';
  await page.getByRole('alert').getByText(conflictNotice, { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '新建审批流', exact: true }).count(), 1, 'a conflicting request key never closes the original form as if its payload had succeeded');
  assert.equal(await page.getByRole('button', { name: '使用同一请求编号安全重试', exact: true }).count(), 0, 'a mismatched request fingerprint never enables retry');
  assert.equal(conflictPostRequests, 1, 'the conflict scenario issues only its initial POST');
  assert.equal(workflowCreateRecoveryStatusFingerprints.at(-1), expectedConflictFingerprint, 'read-only verification sends a fingerprint of the frozen original payload');
  assert.equal(await page.evaluate(() => {
    const value = window.sessionStorage.getItem('xmt:workflow-template-create-pending:v1:actor:96');
    return value ? (JSON.parse(value) as { requestId?: string }).requestId : null;
  }), conflictingTemplateRequestId, 'the conflicting recovery marker is retained for manual review');

  const repeatedConflictStatus = page.waitForResponse((response) => response.url().includes('/api/workflow-templates/create-requests/') && response.request().method() === 'GET' && response.status() === 409);
  await page.getByRole('button', { name: '只读核实创建结果', exact: true }).click();
  await repeatedConflictStatus;
  await page.getByRole('alert').getByText(conflictNotice, { exact: true }).waitFor();
  assert.equal(conflictPostRequests, 1, 'rechecking a request-key conflict remains read-only');
  assert.equal(await page.getByRole('heading', { name: '新建审批流', exact: true }).count(), 1, 'rechecking a conflict does not falsely confirm the mismatched template');
  assert.equal(await page.evaluate(() => window.sessionStorage.getItem('xmt:workflow-template-create-pending:v1:actor:96') !== null), true, 'the request key stays available for manual investigation');
  await page.evaluate(() => window.sessionStorage.removeItem('xmt:workflow-template-create-pending:v1:actor:96'));

  await page.goto(`${base}/__qa?page=workflow-mutations&updateFailOnce=1&updateRefreshFailOnce=1&updateDelayMs=180&updateDelayRequest=2`);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.getByRole('button', { name: '编辑审批流 隔离审批流模板', exact: true }).click();
  await page.getByRole('heading', { name: '编辑审批流', exact: true }).waitFor();
  await page.getByLabel('模板名称', { exact: true }).fill('更新失败后重试审批流');
  await page.getByLabel('描述', { exact: true }).fill('显式重试并验证更新列表只读恢复');
  const failedWorkflowUpdate = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates/961') && response.request().method() === 'PUT' && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await failedWorkflowUpdate;
  await page.getByRole('alert').getByText('服务器暂未找到这次更新记录。原内容与请求编号已保留；只有点击“使用同一请求编号安全重试”才会再次提交。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '编辑审批流', exact: true }).count(), 1, 'a rejected workflow template update keeps its form open');
  assert.equal(await page.getByLabel('模板名称', { exact: true }).inputValue(), '更新失败后重试审批流', 'a not-found update recovery retains the original submitted name');
  assert.equal(await page.getByLabel('描述', { exact: true }).inputValue(), '显式重试并验证更新列表只读恢复', 'a not-found update recovery retains the original submitted description');
  assert.equal(await page.getByLabel('模板名称', { exact: true }).isDisabled(), true, 'the original form remains read-only until explicit same-request retry');
  assert.equal(await page.getByRole('button', { name: '使用同一请求编号安全重试', exact: true }).isEnabled(), true, 'not-found recovery offers an explicit same-request retry');
  assert.equal(workflowMutationUpdateRequests, 1, 'the failed update issues one PUT before explicit retry');
  assert.equal(workflowMutationDetails.get(961)?.name, '隔离审批流模板', 'the rejected update does not mutate server-confirmed detail');
  assert.equal(workflowMutationTemplates[0]?.name, '隔离审批流模板', 'the rejected update does not mutate the server fixture list');

  const updateRequestsBeforeRetry = workflowMutationUpdateRequests;
  const delayedWorkflowUpdateRequest = page.waitForRequest((request) => request.url().endsWith('/api/workflow-templates/961') && request.method() === 'PUT');
  const retriedWorkflowUpdate = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates/961') && response.request().method() === 'PUT' && response.status() === 200);
  const updatedStatusResponse = page.waitForResponse((response) => response.url().includes('/api/workflow-templates/961/update-requests/') && response.request().method() === 'GET' && response.status() === 200);
  const failedWorkflowUpdateRefresh = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates') && response.request().method() === 'GET' && response.status() === 503);
  const sameRequestRetry = page.getByRole('button', { name: '使用同一请求编号安全重试', exact: true });
  await sameRequestRetry.evaluate((element) => {
    if (!(element instanceof HTMLButtonElement)) throw new Error('workflow update submit button was not found');
    element.click();
    element.click();
  });
  await delayedWorkflowUpdateRequest;
  await page.waitForTimeout(40);
  assert.equal(workflowMutationUpdateRequests, updateRequestsBeforeRetry + 1, 'rapid duplicate clicks during the delayed PUT still issue only one update request');
  assert.equal(workflowMutationDetails.get(961)?.name, '隔离审批流模板', 'the delayed PUT has not mutated fixture detail before its response');
  const [retryResponse, retryStatusResponse] = await Promise.all([retriedWorkflowUpdate, updatedStatusResponse]);
  await failedWorkflowUpdateRefresh;
  assert.equal(retryStatusResponse.headers()['cache-control'], 'no-store', 'the update receipt check is explicitly non-cacheable');
  const firstUpdateBody = workflowMutationUpdateBodies[0];
  const secondUpdateBody = workflowMutationUpdateBodies[1];
  assert.equal(firstUpdateBody.client_request_id, secondUpdateBody.client_request_id, 'explicit recovery reuses the original request UUID');
  assert.equal(firstUpdateBody.base_fingerprint, secondUpdateBody.base_fingerprint, 'explicit recovery reuses the original edit baseline');
  assert.deepEqual(
    Object.fromEntries(Object.entries(secondUpdateBody).filter(([key]) => !['client_request_id', 'base_fingerprint'].includes(key))),
    Object.fromEntries(Object.entries(firstUpdateBody).filter(([key]) => !['client_request_id', 'base_fingerprint'].includes(key))),
    'explicit recovery resends the complete original update payload unchanged',
  );
  assert.equal(new URL(retryStatusResponse.url()).searchParams.get('fingerprint'), workflowTemplateUpdateRequestFingerprint(secondUpdateBody), 'status GET uses the composite baseline-and-payload fingerprint');
  assert.equal(retryResponse.status(), 200);
  await page.getByRole('alert').getByText('服务器已确认模板“更新失败后重试审批流”更新成功，内容已保存，但列表未刷新；请只重新加载列表，不要重复提交。', { exact: true }).waitFor();
  assert.equal(workflowMutationUpdateRequests, updateRequestsBeforeRetry + 1, 'the delayed successful retry is the only additional PUT');
  assert.equal(workflowMutationDetails.get(961)?.name, '更新失败后重试审批流', 'the explicit retry updates the server-confirmed detail once');
  assert.equal(await page.getByRole('heading', { name: '编辑审批流', exact: true }).count(), 0, 'the confirmed update closes the form even when its list refresh fails');
  assert.equal(await page.getByText('更新失败后重试审批流', { exact: true }).count(), 0, 'the client does not fabricate an updated row before reloading');
  assert.equal(await page.getByRole('button', { name: /^新建模板/ }).isDisabled(), true, 'a confirmed update with an unavailable list blocks creating from stale state');
  assert.equal(await page.getByRole('button', { name: /^编辑审批流 隔离审批流模板/ }).isDisabled(), true, 'a confirmed update with an unavailable list blocks editing stale rows');
  assert.equal(await page.getByRole('button', { name: /^删除审批流 隔离审批流模板/ }).isDisabled(), true, 'a confirmed update with an unavailable list blocks deleting stale rows');
  assert.equal(workflowMutationCreateRequests, 0, 'blocked create actions do not issue a POST');
  assert.equal(workflowMutationUpdateRequests, 2, 'blocked edit actions do not issue another PUT');
  assert.equal(workflowMutationDeleteRequests, 0, 'blocked delete actions do not issue a DELETE');
  const workflowListReadsBeforeUpdateRecovery = workflowMutationListRequests;
  await page.getByRole('button', { name: '重新加载审批流模板列表', exact: true }).click();
  await page.getByText('更新失败后重试审批流', { exact: true }).waitFor();
  assert.equal(workflowMutationListRequests, workflowListReadsBeforeUpdateRecovery + 1, 'post-update recovery performs one list GET');
  assert.equal(workflowMutationUpdateRequests, updateRequestsBeforeRetry + 1, 'post-update recovery does not repeat the PUT');
  assert.equal(await page.getByRole('button', { name: '新建模板', exact: true }).isEnabled(), true, 'a successful update-list recovery re-enables create actions');
  assert.equal(await page.getByRole('button', { name: '编辑审批流 更新失败后重试审批流', exact: true }).isEnabled(), true, 'a successful update-list recovery re-enables editing');
  assert.equal(await page.getByRole('button', { name: '删除审批流 更新失败后重试审批流', exact: true }).isEnabled(), true, 'a successful update-list recovery re-enables deletion');
  await page.getByRole('button', { name: '编辑审批流 更新失败后重试审批流', exact: true }).click();
  await page.getByRole('heading', { name: '编辑审批流', exact: true }).waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('heading', { name: '编辑审批流', exact: true }).waitFor({ state: 'hidden' });

  await page.goto(`${base}/__qa?page=workflow-mutations&updateCommitLost=1&updateStatusFailCount=1`);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.getByRole('button', { name: '编辑审批流 隔离审批流模板', exact: true }).click();
  await page.getByRole('heading', { name: '编辑审批流', exact: true }).waitFor();
  await page.getByLabel('模板名称', { exact: true }).fill('响应丢失后恢复审批流');
  await page.getByLabel('描述', { exact: true }).fill('提交已完成，但浏览器没有收到确认');
  const lostWorkflowUpdate = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates/961') && response.request().method() === 'PUT' && response.status() === 503);
  const failedWorkflowUpdateStatus = page.waitForResponse((response) => response.url().includes('/api/workflow-templates/961/update-requests/') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await Promise.all([lostWorkflowUpdate, failedWorkflowUpdateStatus]);
  await page.getByRole('alert').getByText('暂时无法只读核实上次更新结果；恢复记录已保留，当前窗口保持只读。', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('模板名称', { exact: true }).isDisabled(), true, 'a lost response with a failed status read leaves the original editor locked');
  assert.equal(workflowMutationDetails.get(961)?.name, '响应丢失后恢复审批流', 'the isolated fixture commits before simulating the lost response');
  assert.equal(workflowMutationUpdateRequests, 1, 'the lost-response path sends exactly one PUT before reload');
  const pendingUpdateMarker = await page.evaluate(() => {
    const raw = window.sessionStorage.getItem('xmt:workflow-template-update-pending:v1:actor:96');
    return raw ? JSON.parse(raw) as Record<string, unknown> : null;
  });
  assert(pendingUpdateMarker, 'the in-memory isolated browser fixture retains the recovery marker');
  assert.equal(pendingUpdateMarker.actorId, 96);
  assert.equal(pendingUpdateMarker.templateId, 961);
  assert.equal(pendingUpdateMarker.rejected, false);
  assert.equal((pendingUpdateMarker.payload as Record<string, unknown>).name, '响应丢失后恢复审批流');
  assert.equal((pendingUpdateMarker.basePayload as Record<string, unknown>).name, '隔离审批流模板');
  assert.equal(pendingUpdateMarker.requestFingerprint, workflowTemplateUpdateRequestFingerprint(workflowMutationUpdateBodies[0]));

  const recoveredWorkflowStatus = page.waitForResponse((response) => response.url().includes('/api/workflow-templates/961/update-requests/') && response.request().method() === 'GET' && response.status() === 200);
  const readBackWorkflowDetail = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates/961') && response.request().method() === 'GET' && response.status() === 200);
  await page.reload();
  await Promise.all([recoveredWorkflowStatus, readBackWorkflowDetail]);
  await page.getByText('响应丢失后恢复审批流', { exact: true }).waitFor();
  await page.getByRole('heading', { name: '编辑审批流', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(workflowMutationUpdateRequests, 1, 'reload recovery verifies the receipt without resending the PUT');
  assert.equal(workflowUpdateRecoveryStatusRequests, 2, 'the status read is retried only after page reload');
  assert.equal(await page.evaluate(() => window.sessionStorage.getItem('xmt:workflow-template-update-pending:v1:actor:96')), null, 'verified update recovery clears the stored marker');

  await page.goto(`${base}/__qa?page=workflow-mutations&deleteRefreshFailOnce=1&deleteDelayMs=180&deleteDelayRequest=1&listDelayMs=180&listDelayRequest=2`);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.getByRole('button', { name: '删除审批流 隔离审批流模板', exact: true }).click();
  await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor();
  const delayedWorkflowDeleteRequest = page.waitForRequest((request) => request.url().endsWith('/api/workflow-templates/961') && request.method() === 'DELETE');
  const confirmedWorkflowDelete = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates/961') && response.request().method() === 'DELETE' && response.status() === 200);
  const failedWorkflowDeleteRefresh = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '确认删除', exact: true }).evaluate((element) => {
    if (!(element instanceof HTMLButtonElement)) throw new Error('workflow delete confirm button was not found');
    element.click();
    element.click();
  });
  await delayedWorkflowDeleteRequest;
  await page.waitForTimeout(40);
  assert.equal(workflowMutationDeleteRequests, 1, 'rapid duplicate clicks during the delayed DELETE issue only one request');
  assert.equal(workflowMutationTemplates.length, 2, 'the delayed DELETE has not removed its fixture row before the response');
  await Promise.all([confirmedWorkflowDelete, failedWorkflowDeleteRefresh]);
  await page.getByRole('alert').getByText('服务器已确认模板“隔离审批流模板”删除成功，已从当前列表移除，但列表未刷新；请只重新加载列表，不要重复删除。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '确认删除', exact: true }).count(), 0, 'a confirmed DELETE closes its confirmation even when the follow-up read fails');
  assert.equal(await page.getByText('隔离审批流模板', { exact: true }).count(), 0, 'the confirmed deletion removes its stale row immediately');
  assert.equal(await page.getByText('保留审批流模板', { exact: true }).count(), 1, 'unrelated fixture rows remain visible while refresh is unavailable');
  assert.equal(workflowMutationTemplates.length, 1, 'the DELETE is confirmed in server fixture state despite the failed refresh');
  assert.equal(workflowMutationTemplates[0]?.id, workflowMutationSurvivorTemplate.id, 'only the requested fixture row is deleted');
  assert.equal(workflowMutationDeleteRequests, 1, 'the confirmed DELETE was issued exactly once');
  assert.equal(await page.getByRole('button', { name: /^新建模板/ }).isDisabled(), true, 'a confirmed DELETE with an unavailable list blocks creating from stale state');
  assert.equal(await page.getByRole('button', { name: /^编辑审批流 保留审批流模板/ }).isDisabled(), true, 'a confirmed DELETE with an unavailable list blocks editing another row');
  assert.equal(await page.getByRole('button', { name: /^删除审批流 保留审批流模板/ }).isDisabled(), true, 'a confirmed DELETE with an unavailable list blocks deleting another row');
  assert.equal(workflowMutationCreateRequests, 0, 'the delete warning does not issue a POST');
  assert.equal(workflowMutationUpdateRequests, 0, 'the delete warning does not issue a PUT');

  const workflowListReadsBeforeDeleteRecovery = workflowMutationListRequests;
  const deleteRecoveryRequest = page.waitForRequest((request) => request.url().endsWith('/api/workflow-templates') && request.method() === 'GET');
  const deleteRecoveryResponse = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates') && response.request().method() === 'GET' && response.status() === 200);
  await page.getByRole('button', { name: '重新加载审批流模板列表', exact: true }).evaluate((element) => {
    if (!(element instanceof HTMLButtonElement)) throw new Error('workflow list reload button was not found');
    element.click();
    element.click();
  });
  await deleteRecoveryRequest;
  await page.waitForTimeout(40);
  assert.equal(workflowMutationListRequests, workflowListReadsBeforeDeleteRecovery + 1, 'rapid delete-recovery clicks issue only one list GET');
  assert.equal(workflowMutationDeleteRequests, 1, 'delete recovery never repeats the confirmed DELETE');
  assert.equal(workflowMutationCreateRequests, 0, 'delete recovery remains read-only and does not create a template');
  assert.equal(workflowMutationUpdateRequests, 0, 'delete recovery remains read-only and does not update a template');
  await deleteRecoveryResponse;
  await page.getByRole('alert').waitFor({ state: 'hidden' });
  assert.equal(await page.getByText('隔离审批流模板', { exact: true }).count(), 0, 'successful delete recovery removes the stale template row');
  assert.equal(await page.getByText('保留审批流模板', { exact: true }).count(), 1, 'successful delete recovery restores the authoritative retained row');
  assert.equal(await page.getByText('暂无审批流模板', { exact: true }).count(), 0, 'successful delete recovery does not present a non-empty list as empty');
  assert.equal(await page.getByRole('button', { name: '新建模板', exact: true }).isEnabled(), true, 'successful delete recovery re-enables create actions');
  assert.equal(await page.getByRole('button', { name: '编辑审批流 保留审批流模板', exact: true }).isEnabled(), true, 'successful delete recovery re-enables editing retained rows');
  assert.equal(await page.getByRole('button', { name: '删除审批流 保留审批流模板', exact: true }).isEnabled(), true, 'successful delete recovery re-enables deletion of retained rows');
  assert.equal(workflowMutationDeleteRequests, 1, 'the final recovery state still records exactly one DELETE');

  await page.goto(`${base}/__qa?page=workflow-mutations&deleteCommitLost=1&deleteVerifyReadFailOnce=1&includeSurvivor=1`);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.getByRole('button', { name: '删除审批流 隔离审批流模板', exact: true }).click();
  await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor();
  const lostWorkflowDelete = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates/961')
    && response.request().method() === 'DELETE' && response.status() === 503);
  const unavailableWorkflowDeleteVerification = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates/961')
    && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await Promise.all([lostWorkflowDelete, unavailableWorkflowDeleteVerification]);
  await page.getByRole('alert').getByText('暂时无法核实上次删除结果；恢复记录已保留，所有模板写入暂停。请重试只读核实，不要重复删除。', { exact: true }).waitFor();
  assert.equal(workflowMutationDeleteRequests, 1, 'a lost DELETE response is never retried while its result is unknown');
  assert.equal(workflowMutationTemplates.some((item) => item.id === 961), false, 'the fixture commits deletion before losing the response');
  assert.deepEqual(await page.evaluate(() => {
    const raw = window.sessionStorage.getItem('xmt:workflow-template-delete-pending:v1:actor:96');
    return raw ? JSON.parse(raw) as Record<string, unknown> : null;
  }), { version: 1, actorId: 96, templateId: 961, name: '隔离审批流模板' }, 'the actor-scoped recovery marker records only the target needed for a read-only status check');

  const recoveredWorkflowDelete = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates/961')
    && response.request().method() === 'GET' && response.status() === 404);
  const recoveredWorkflowDeleteList = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates')
    && response.request().method() === 'GET' && response.status() === 200);
  await page.reload();
  await Promise.all([recoveredWorkflowDelete, recoveredWorkflowDeleteList]);
  await page.getByText('审批流模板“隔离审批流模板”已不存在；没有重复提交删除。', { exact: true }).waitFor();
  assert.equal(workflowMutationDetailReadRequests.get(961), 2, 'reload recovery performs a second direct GET after the first read was unavailable');
  assert.equal(workflowMutationDeleteRequests, 1, 'reload recovery verifies deletion without sending another DELETE');
  assert.equal(await page.evaluate(() => window.sessionStorage.getItem('xmt:workflow-template-delete-pending:v1:actor:96')), null, 'verified deletion clears the recovery marker');
  assert.equal(await page.getByText('隔离审批流模板', { exact: true }).count(), 0, 'read-back confirms the deleted template is absent after reload');
  assert.equal(await page.getByText('保留审批流模板', { exact: true }).count(), 1, 'read-back preserves unrelated templates');
  assert.equal(await page.getByRole('button', { name: '新建模板', exact: true }).isEnabled(), true, 'verified deletion restores template actions');

  await page.goto(`${base}/__qa?page=workflow-mutations&deleteFailOnce=1`);
  await page.getByRole('heading', { name: '审批流设计' }).waitFor();
  await page.getByRole('button', { name: '删除审批流 隔离审批流模板', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('审批流模板“隔离审批流模板”仍在服务器上，本次删除未确认；如仍需删除，请重新确认操作。', { exact: true }).waitFor();
  assert.equal(workflowMutationDeleteRequests, 1, 'a failed DELETE with the template still present is not automatically repeated');
  assert.equal(workflowMutationTemplates.some((item) => item.id === 961), true, 'read-back confirms the unsuccessful deletion left the template intact');
  assert.equal(await page.evaluate(() => window.sessionStorage.getItem('xmt:workflow-template-delete-pending:v1:actor:96')), null, 'a read-back showing the template still present clears the resolved recovery marker');
  await page.getByRole('button', { name: '删除审批流 隔离审批流模板', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('审批流模板已删除', { exact: true }).waitFor();
  assert.equal(workflowMutationDeleteRequests, 2, 'a second DELETE occurs only after the user reopens and confirms the action');

  for (const failureMode of ['status', 'network', 'invalid'] as const) {
    await page.goto(`${base}/__qa?page=workflow-mutations&detailFailureMode=${failureMode}&detailDelayMs=180&detailDelayRequest=2&detailNodeFixture=1`);
    await page.getByRole('heading', { name: '审批流设计' }).waitFor();
    await page.waitForTimeout(50);
    assert.equal(workflowMutationDetailFailureMode, failureMode, `${failureMode} detail failure is enabled in the isolated fixture`);
    const detailRoutePattern = `${base}/api/workflow-templates/961`;
    let networkFailureInjected = false;
    if (failureMode === 'network') {
      await page.route(detailRoutePattern, async (route) => {
        if (!networkFailureInjected) {
          networkFailureInjected = true;
          workflowMutationDetailFailureMode = '';
          workflowMutationDetailReadRequests.set(961, (workflowMutationDetailReadRequests.get(961) || 0) + 1);
          await route.abort('failed');
          return;
        }
        await route.continue();
      });
    }
    const listReadsBeforeDetailFailure = workflowMutationListRequests;
    const initialDetailRequest = page.waitForRequest((request) => request.url().endsWith('/api/workflow-templates/961') && request.method() === 'GET', { timeout: 5000 });
    await page.getByRole('button', { name: '编辑审批流 隔离审批流模板', exact: true }).click();
    const detailFailureRequest = await initialDetailRequest;
    const detailFailureResponse = await detailFailureRequest.response();
    if (failureMode === 'network') assert.equal(detailFailureResponse, null, 'the network failure fixture closes the detail response');
    else assert.equal(detailFailureResponse?.status(), failureMode === 'status' ? 503 : 200, `${failureMode} fixture returns its configured failure response`);
    await page.waitForTimeout(100);
    const detailFailureAlertText = await page.locator('[role="alert"]').allTextContents();
    assert(detailFailureAlertText.some((text) => text.includes('详情读取失败，编辑器尚未打开')), `${failureMode} detail failure should show its retry notice; received alerts: ${JSON.stringify(detailFailureAlertText)}`);
    await page.getByRole('alert').getByText('审批流模板“隔离审批流模板”详情读取失败，编辑器尚未打开，当前内容未修改。可重新读取模板详情；此操作只发送读取请求，不会保存或重复提交。', { exact: true }).waitFor({ timeout: 5000 });
    assert.equal(await page.getByRole('heading', { name: '编辑审批流', exact: true }).count(), 0, `${failureMode} detail failure does not open an editor`);
    assert.equal(workflowMutationDetailReadRequests.get(961), 1, `${failureMode} detail failure issues one initial GET`);
    assert.equal(workflowMutationListRequests, listReadsBeforeDetailFailure, `${failureMode} detail failure does not affect the template list`);
    assert.equal(workflowMutationCreateRequests, 0, `${failureMode} detail failure does not create a template`);
    assert.equal(workflowMutationUpdateRequests, 0, `${failureMode} detail failure does not update a template`);
    assert.equal(workflowMutationDeleteRequests, 0, `${failureMode} detail failure does not delete a template`);

    const detailRetryRequest = page.waitForRequest((request) => request.url().endsWith('/api/workflow-templates/961') && request.method() === 'GET');
    const detailRetryResponse = page.waitForResponse((response) => response.url().endsWith('/api/workflow-templates/961') && response.request().method() === 'GET' && response.status() === 200);
    await page.getByRole('button', { name: '重新读取审批流模板“隔离审批流模板”详情', exact: true }).evaluate((element) => {
      if (!(element instanceof HTMLButtonElement)) throw new Error('workflow detail retry button was not found');
      element.click();
      element.click();
    });
    await detailRetryRequest;
    await page.waitForTimeout(40);
    assert.equal(workflowMutationDetailReadRequests.get(961), 2, `${failureMode} duplicate retry clicks share one delayed detail GET`);
    assert.equal(workflowMutationListRequests, listReadsBeforeDetailFailure, `${failureMode} detail retry does not re-read the list`);
    assert.equal(workflowMutationCreateRequests, 0, `${failureMode} detail retry does not create a template`);
    assert.equal(workflowMutationUpdateRequests, 0, `${failureMode} detail retry does not update a template`);
    assert.equal(workflowMutationDeleteRequests, 0, `${failureMode} detail retry does not delete a template`);
    await detailRetryResponse;
    await page.getByRole('heading', { name: '编辑审批流', exact: true }).waitFor();
    await page.getByRole('alert').waitFor({ state: 'hidden' });
    assert.equal(await page.getByLabel('模板名称', { exact: true }).inputValue(), '隔离审批流模板', `${failureMode} retry opens the correct template detail`);
    assert.equal(await page.getByLabel('描述', { exact: true }).inputValue(), '仅用于模板写入反馈回归', `${failureMode} retry restores the correct template description`);
    assert.equal(await page.getByLabel('节点名称', { exact: true }).inputValue(), '详情验收节点', `${failureMode} retry loads the correct node content`);
    assert.equal(await page.getByLabel('审批人值', { exact: true }).inputValue(), 'director', `${failureMode} retry loads the correct node approver`);
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('heading', { name: '编辑审批流', exact: true }).waitFor({ state: 'hidden' });
    if (failureMode === 'network') await page.unroute(detailRoutePattern);
  }

  for (const { message, sourceUrl } of observedUnavailableConsoleErrors) {
    let source: URL | null = null;
    try { source = new URL(sourceUrl); } catch { /* unexpected console locations are reported below */ }
    const matchingResponse = source && unavailableResponses.find((response) => (
      !classifiedUnavailableResponses.has(response)
      && response.status === 503
      && new URL(response.url).origin === source.origin
      && response.pathname === source.pathname
    ));
    if (!matchingResponse) {
      errors.push(`${message} [${sourceUrl || 'unknown source URL'}]`);
      continue;
    }
    classifiedUnavailableResponses.add(matchingResponse);
    expectedHttpErrors.push({ ...matchingResponse, message });
  }
  assert.equal(expectedRecoveryErrors.length, expectedRecoveryResponses.length, 'only console errors matching explicit create-request status responses are classified as expected');
  assert.equal(expectedRecoveryResponses.length, 4, 'only the covered create-request not-found, two conflict checks, and deleted tombstone responses are recorded');
  assert(expectedRecoveryErrors.every(({ url, status }) => {
    const recoveryUrl = new URL(url);
    return /^\/api\/workflow-templates\/create-requests\/[^/]+$/.test(recoveryUrl.pathname)
      && [404, 409, 410].includes(status);
  }), 'expected recovery errors are limited to the create-request endpoint and covered not-found, conflict, and deleted statuses');
  assert(expectedRecoveryResponses.every(({ method, pathname, status }) => (
    method === 'GET'
    && /^\/api\/workflow-templates\/create-requests\/[^/]+$/.test(pathname)
    && [404, 409, 410].includes(status)
  )), 'every recovery error is a GET to the exact create-request endpoint with an explicitly tested status');
  assert.deepEqual(
    [404, 409, 410].map((status) => expectedRecoveryResponses.filter((response) => response.status === status).length),
    [1, 2, 1],
    'recovery error classification records one not-found, two conflict checks, and one deleted tombstone response',
  );
  assert.equal(expectedRoleDeleteNotFoundResponses.length, 1, 'the only separately allowed role 404 is the explicitly covered role status read after delete');
  assert.equal(expectedRoleDeleteNotFoundErrors.length, expectedRoleDeleteNotFoundResponses.length, 'the role delete 404 console error matches its exact response');
  assert(expectedRoleDeleteNotFoundResponses.every(({ method, pathname, status }) => method === 'GET' && pathname === '/api/roles/3' && status === 404), 'role 404 classification is limited to GET /api/roles/3');
  assert.equal(expectedWorkflowDeleteNotFoundResponses.length, 1, 'the only separately allowed workflow-template 404 is the read-back after an ambiguous delete');
  assert.equal(expectedWorkflowDeleteNotFoundErrors.length, expectedWorkflowDeleteNotFoundResponses.length, 'the workflow-template delete 404 console error matches its exact response');
  assert(expectedWorkflowDeleteNotFoundResponses.every(({ method, pathname, status }) => method === 'GET' && pathname === '/api/workflow-templates/961' && status === 404), 'workflow-template 404 classification is limited to the tested read-back endpoint');
  assert.equal(expectedWorkflowCreateConflictResponses.length, 1, 'the only separately allowed workflow create conflict is the explicit conflict fixture');
  assert.equal(expectedWorkflowCreateConflictErrors.length, expectedWorkflowCreateConflictResponses.length, 'the workflow create conflict console error matches its exact response');
  assert(expectedWorkflowCreateConflictResponses.every(({ method, pathname, status }) => method === 'POST' && pathname === '/api/workflow-templates' && status === 409), 'workflow create conflict classification is limited to POST /api/workflow-templates');
  const expectedUnavailableTupleCounts = [
    { method: 'GET', pathname: '/api/roles', status: 503, count: 4 },
    { method: 'POST', pathname: '/api/roles', status: 503, count: 3 },
    { method: 'GET', pathname: '/api/permissions', status: 503, count: 1 },
    { method: 'PUT', pathname: '/api/roles/3', status: 503, count: 2 },
    { method: 'GET', pathname: '/api/roles/3', status: 503, count: 2 },
    { method: 'DELETE', pathname: '/api/roles/3', status: 503, count: 2 },
    { method: 'DELETE', pathname: '/api/workflow-templates/961', status: 503, count: 3 },
    { method: 'GET', pathname: '/api/templates', status: 503, count: 3 },
    { method: 'GET', pathname: '/api/workflow-templates', status: 503, count: 4 },
    { method: 'POST', pathname: '/api/workflow-templates', status: 503, count: 1 },
    { method: 'GET', pathname: '/api/workflow-templates/create-requests/:id', status: 503, count: 2 },
    { method: 'PUT', pathname: '/api/workflow-templates/961', status: 503, count: 2 },
    { method: 'GET', pathname: '/api/workflow-templates/961', status: 503, count: 2 },
    { method: 'GET', pathname: '/api/workflow-templates/:id/update-requests/:id', status: 503, count: 1 },
  ];
  const observedUnavailableTupleCounts = [...new Set(unavailableResponses.map(({ method, pathname, status }) => JSON.stringify({ method, pathname, status })))]
    .map((tuple) => {
      const parsed = JSON.parse(tuple) as Omit<ObservedHttpResponse, 'url'>;
      const pathname = /^\/api\/workflow-templates\/create-requests\/[^/]+$/.test(parsed.pathname)
        ? '/api/workflow-templates/create-requests/:id'
        : /^\/api\/workflow-templates\/\d+\/update-requests\/[^/]+$/.test(parsed.pathname)
          ? '/api/workflow-templates/:id/update-requests/:id'
        : parsed.pathname;
      return { ...parsed, pathname, count: unavailableResponses.filter((response) => response.method === parsed.method && response.pathname === parsed.pathname && response.status === parsed.status).length };
    })
    .sort((a, b) => `${a.method} ${a.pathname} ${a.status}`.localeCompare(`${b.method} ${b.pathname} ${b.status}`));
  assert.deepEqual(
    observedUnavailableTupleCounts,
    expectedUnavailableTupleCounts.sort((a, b) => `${a.method} ${a.pathname} ${a.status}`.localeCompare(`${b.method} ${b.pathname} ${b.status}`)),
    '503 classification is limited to the explicitly covered method, endpoint, status, and response counts',
  );
  assert.equal(expectedHttpErrors.length, unavailableResponses.length, 'each expected 503 console error matches exactly one observed 503 response');
  assert.deepEqual(errors, [], 'workflow designer renders without unexpected browser errors');
  assert.equal(expectedPermissionFailureLogs.length, 4, 'permission read failures emit one sanitized diagnostic per failed read');
  assert.equal(expectedWorkflowFailureLogs.length, 4, 'workflow list failures emit one sanitized diagnostic per failed read');
  assert.equal(expectedWorkflowDetailFailureLogs.length, 3, 'each workflow template detail failure emits one sanitized diagnostic');
  await page.close();
  console.log('Workflow designer/permission browser test passed: localized risk labels, light/dark default and role badges >=4.5:1, hovered delete icons >=3:1, named role actions fit 320/390px, edit/close flow and no browser errors.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
