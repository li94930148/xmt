const fs = require('fs');
const files = ['Home.tsx', 'Kanban.tsx', 'Production.tsx', 'ProductionDetail.tsx', 'Publishing.tsx', 'Shooting.tsx', 'ShootingDetail.tsx', 'TopicDetail.tsx'];

for (const f of files) {
  const p = 'E:/houtai/xmt/src/pages/' + f;
  const c = fs.readFileSync(p, 'utf8');
  const lines = c.split('\n');
  const issues = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Count single quotes (rough check)
    const sq = (line.match(/'/g) || []).length;
    if (sq % 2 !== 0) {
      issues.push('L' + (i+1) + ': odd quotes -> ' + line.trim().substring(0, 80));
    }
  }
  if (issues.length > 0) {
    console.log(f + ':');
    issues.slice(0, 10).forEach(i => console.log('  ' + i));
  }
}
