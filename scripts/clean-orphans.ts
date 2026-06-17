import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'xmt.db');

async function cleanOrphanedRecords() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
  });
  
  const data = new Uint8Array(fs.readFileSync(dbPath));
  const db = new SQL.Database(data);
  
  console.log('清理前shooting表内容:');
  let result = db.exec(`SELECT * FROM shooting`);
  if (result.length > 0 && result[0].values.length > 0) {
    for (const row of result[0].values) {
      console.log(`ID: ${row[0]}, topic_id: ${row[1]}, status: ${row[5]}`);
    }
  }
  
  db.run(`DELETE FROM shooting WHERE topic_id NOT IN (SELECT id FROM topics)`);
  console.log('\n已删除孤立的shooting记录');
  
  console.log('\n清理后shooting表内容:');
  result = db.exec(`SELECT * FROM shooting`);
  if (result.length > 0 && result[0].values.length > 0) {
    for (const row of result[0].values) {
      console.log(`ID: ${row[0]}, topic_id: ${row[1]}, status: ${row[5]}`);
    }
  } else {
    console.log('表为空');
  }
  
  const dataToSave = db.export();
  fs.writeFileSync(dbPath, Buffer.from(dataToSave));
  
  db.close();
  console.log('\n清理完成！');
}

cleanOrphanedRecords().catch(console.error);
