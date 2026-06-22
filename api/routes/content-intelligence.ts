import express from 'express';
import { authenticate } from '../middleware/auth';
import { getEventStream } from '../collaboration/protocol/eventStream';
import {
  analyzeContentEvolution,
  detectContentStability,
} from '../../src/content/intelligence/contentEvolutionAnalyzer';
import {
  analyzeUserImpact,
  detectStructuralEditors,
} from '../../src/content/intelligence/collaborationImpactAnalyzer';
import { calculateQualityTrend } from '../../src/content/intelligence/contentQualityTrend';

const router = express.Router();

function timelineSources(docId: string) {
  return {
    yjsEvents: getEventStream(docId),
  };
}

router.get('/evolution/:docId', authenticate, (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  const sources = timelineSources(docId);
  res.json({
    docId,
    evolution: analyzeContentEvolution(docId, sources),
    stability: detectContentStability(docId, sources),
  });
});

router.get('/impact/:docId', authenticate, (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  const sources = timelineSources(docId);
  res.json({
    docId,
    users: analyzeUserImpact(docId, sources),
    structuralEditors: detectStructuralEditors(docId, sources),
  });
});

router.get('/quality/:docId', authenticate, (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  res.json({
    docId,
    quality: calculateQualityTrend(docId, timelineSources(docId)),
  });
});

export default router;
