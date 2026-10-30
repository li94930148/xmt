import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import UpdateNotification from '@/components/UpdateNotification';
import '../../src/index.css';

export function UpdateNotificationHarness() {
  const [visible, setVisible] = useState(true);
  const [result, setResult] = useState('');

  return (
    <main className="min-h-screen bg-studio-app-bg p-4">
      {visible ? (
        <UpdateNotification
          onClose={() => {
            setVisible(false);
            setResult('版本提示已关闭');
          }}
          onGoToChangelog={() => setResult('已打开更新说明')}
        />
      ) : (
        <p role="status">{result}</p>
      )}
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('更新提示隔离验收缺少挂载节点');
createRoot(root).render(<UpdateNotificationHarness />);
