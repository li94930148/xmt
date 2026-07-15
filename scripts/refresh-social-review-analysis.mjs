import 'dotenv/config';
import { saveCurrentVideoMetricSnapshots } from '../api/services/social-review/videoMetricSnapshotService.ts';
import { refreshAccountVideoInsights } from '../api/services/social-review/videoLifecycleAnalysis.ts';
import { refreshAccountVideoContentFeatures } from '../api/services/social-review/videoContentFeatureService.ts';
import { analyzeContentPerformance } from '../api/services/social-review/contentPerformanceAnalysis.ts';
import { generateAccountSuggestions } from '../api/services/social-review/operationSuggestionService.ts';
import { generateAccountReport } from '../api/services/social-review/reportGenerationService.ts';
import { listVideoPerformance } from '../api/services/social-review/videoAnalysis.ts';

const accountId = 2;
await saveCurrentVideoMetricSnapshots(accountId);
await refreshAccountVideoInsights(accountId);
await refreshAccountVideoContentFeatures(accountId);
await analyzeContentPerformance(accountId, true);
const performance = await listVideoPerformance(accountId);
await generateAccountSuggestions(accountId);
for (const period of ['7d', '30d', '90d']) await generateAccountReport(accountId, { period });
console.log(JSON.stringify({ accountId, videos: performance.length, fullScoreVideos: performance.filter((item) => item.performance.scoreMode === 'full').length }));
