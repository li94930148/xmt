import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'xmt.db');

async function checkShootingTable() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
  });
  
  const data = new Uint8Array(fs.readFileSync(dbPath));
  const db = new SQL.Database(data);
  
  const result = db.exec(`SELECT * FROM shooting`);
  console.log('shooting表内容:');
  if (result.length > 0 && result[0].values.length > 0) {
    console.log('找到记录:');
    for (const row of result[0].values) {
      console.log(`ID: ${row[0]}, topic_id: ${row[1]}, plan_date: ${row[2]}, location: ${row[3]}, equipment: ${row[4]}, status: ${row[5]}`);
    }
  } else {
    console.log('表为空');
  }
  
  db.close();
}

checkShootingTable().catch(console.error);
