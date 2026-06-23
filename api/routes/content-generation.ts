import express from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { getEventStream } from '../collaboration/protocol/eventStream';
import {
  generateStructureSuggestion,
  generateSummary,
  generateTitle,
} from '../../src/content/generation/contentGenerationEngine';
import {
  detectWeakSections,
  suggestImprovements,
} from '../../src/content/generation/contentSuggestionEngine';

const router = express.Router();

function timelineSources(docId: string) {
  return {
    yjsEvents: getEventStream(docId),
  };
}

router.get('/summary/:docId', authenticate, requirePermission('analytics:view'), (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  res.json({
    docId,
    summary: generateSummary(docId, timelineSources(docId)),
  });
});

router.get('/title/:docId', authenticate, requirePermission('analytics:view'), (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  res.json({
    docId,
    title: generateTitle(docId, timelineSources(docId)),
  });
});

router.get('/structure/:docId', authenticate, requirePermission('analytics:view'), (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  res.json({
    docId,
    structure: generateStructureSuggestion(docId, timelineSources(docId)),
  });
});

router.get('/suggestions/:docId', authenticate, requirePermission('analytics:view'), (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  const sources = timelineSources(docId);
  res.json({
    docId,
    suggestions: suggestImprovements(docId, sources),
    weakSections: detectWeakSections(docId, sources),
  });
});

export default router;
