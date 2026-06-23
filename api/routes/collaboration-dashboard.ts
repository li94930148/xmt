import express from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { getTimelineEvents } from '../collaboration/timeline/collaborationTimeline';
import {
  generateDiffSequence,
  replayDocument,
  restoreToEvent,
} from '../collaboration/replay/documentReplay';
import {
  getDocStats,
  getUserContributionMap,
} from '../collaboration/dashboard/collaborationAnalytics';

const router = express.Router();

router.get('/timeline/:docId', authenticate, requirePermission('analytics:view'), (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  res.json({
    docId,
    events: getTimelineEvents(docId),
    snapshots: getTimelineEvents(docId)
      .filter((event) => event.type === 'snapshot')
      .map((event) => ({
        id: event.snapshotId || event.id,
        docId,
        version: Number(event.diff?.version || 0),
        createdAt: event.timestamp,
        bytes: Number(event.diff?.bytes || 0),
      })),
  });
});

router.get('/replay/:docId', authenticate, requirePermission('analytics:view'), (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  const from = req.query.from ? Number(req.query.from) : undefined;
  const to = req.query.to ? Number(req.query.to) : undefined;
  const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : null;

  res.json({
    docId,
    replay: eventId ? restoreToEvent(docId, eventId) : replayDocument(docId, { from, to }),
    diffSequence: generateDiffSequence(docId),
  });
});

router.get('/stats/:docId', authenticate, requirePermission('analytics:view'), (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  res.json({
    stats: getDocStats(docId),
    contributions: getUserContributionMap(docId),
  });
});

export default router;
