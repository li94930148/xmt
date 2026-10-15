import express from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import type { TopicController } from './topics.controller';

export function createLegacyTopicsRouter(controller: TopicController) {
  const router = express.Router();
  router.get('/', authenticate, controller.legacyList);
  router.get('/:id', authenticate, controller.legacyGet);
  router.get('/:id/versions', authenticate, controller.legacyOutlineVersions);
  router.post('/', authenticate, requirePermission('topic:create'), controller.legacyCreate);
  router.put('/:id', authenticate, requirePermission('topic:update'), controller.legacyUpdate);
  router.delete('/:id', authenticate, requirePermission('topic:delete'), controller.legacyDelete);
  router.post('/:id/audit', authenticate, requirePermission('topic:audit'), controller.legacyAudit);
  router.post('/:id/status', authenticate, requirePermission('topic:update'), controller.legacyTransition);
  router.post('/:id/repair-stage-record', authenticate, requirePermission('topic:update'), controller.legacyRepairCurrentStageRecord);
  return router;
}
export function createV1TopicsRouter(controller: TopicController) {
  const router = express.Router();
  router.get('/', authenticate, controller.v1List);
  router.get('/:id', authenticate, controller.v1Get);
  router.get('/:id/versions', authenticate, controller.v1OutlineVersions);
  router.post('/', authenticate, requirePermission('topic:create'), controller.v1Create);
  router.put('/:id', authenticate, requirePermission('topic:update'), controller.v1Update);
  router.delete('/:id', authenticate, requirePermission('topic:delete'), controller.v1Delete);
  router.post('/:id/audit', authenticate, requirePermission('topic:audit'), controller.v1Audit);
  router.post('/:id/status', authenticate, requirePermission('topic:update'), controller.v1Transition);
  router.post('/:id/repair-stage-record', authenticate, requirePermission('topic:update'), controller.v1RepairCurrentStageRecord);
  return router;
}
