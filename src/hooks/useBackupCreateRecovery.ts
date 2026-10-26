import { useCallback, useEffect, useRef, useState } from 'react';
import { getBackupCreateRequestStatus, createBackup, type BackupCreateRequestStatus } from '../api/backup';
import { useAuthStore } from '../store';

type BackupCreateRecovery = { actorId: number; requestId: string };
type BackupCreatePhase = 'idle' | 'submitting' | 'checking' | 'uncertain' | 'not_found' | 'storage_error';
type ConfirmedBackup = { message: string; name: string };
type StorageRead = { available: true; recovery: BackupCreateRecovery | null } | { available: false };

const STORAGE_PREFIX = 'xmt:backup-create-pending:v1:actor:';
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageKey(actorId: number) {
  return `${STORAGE_PREFIX}${actorId}`;
}

function readRecovery(actorId: number): StorageRead {
  try {
    const raw = window.sessionStorage.getItem(storageKey(actorId));
    if (!raw) return { available: true, recovery: null };
    const value = JSON.parse(raw) as Partial<BackupCreateRecovery> | null;
    if (value?.actorId !== actorId || typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)) {
      return { available: false };
    }
    return { available: true, recovery: { actorId, requestId: value.requestId.toLowerCase() } };
  } catch {
    return { available: false };
  }
}

function persistRecovery(recovery: BackupCreateRecovery): boolean {
  try {
    window.sessionStorage.setItem(storageKey(recovery.actorId), JSON.stringify(recovery));
    const stored = readRecovery(recovery.actorId);
    return stored.available && stored.recovery?.requestId === recovery.requestId;
  } catch {
    return false;
  }
}

function clearRecovery(recovery: BackupCreateRecovery): boolean {
  try {
    const stored = readRecovery(recovery.actorId);
    if (!stored.available) return false;
    if (stored.recovery?.requestId === recovery.requestId) window.sessionStorage.removeItem(storageKey(recovery.actorId));
    return true;
  } catch {
    return false;
  }
}

export function useBackupCreateRecovery(onConfirmed: (backup: ConfirmedBackup, recovered: boolean) => Promise<void> | void) {
  const actorId = useAuthStore((state) => Number(state.user?.id) || 0);
  const [pending, setPending] = useState<BackupCreateRecovery | null>(null);
  const [phase, setPhase] = useState<BackupCreatePhase>('idle');
  const [message, setMessage] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const pendingRef = useRef<BackupCreateRecovery | null>(null);
  const actorIdRef = useRef(actorId);
  const onConfirmedRef = useRef(onConfirmed);
  const generationRef = useRef(0);
  const operationRef = useRef(0);
  const busyRef = useRef(false);

  actorIdRef.current = actorId;
  onConfirmedRef.current = onConfirmed;

  const isCurrent = useCallback((recovery: BackupCreateRecovery, generation: number) => (
    generation === generationRef.current
    && actorIdRef.current === recovery.actorId
    && Number(useAuthStore.getState().user?.id) === recovery.actorId
  ), []);

  const finishConfirmed = useCallback(async (recovery: BackupCreateRecovery, generation: number, backup: ConfirmedBackup, recovered: boolean) => {
    if (!isCurrent(recovery, generation)) return;
    if (clearRecovery(recovery)) {
      pendingRef.current = null;
      setPending(null);
      setPhase('idle');
      setMessage('');
    } else {
      setPhase('storage_error');
      setMessage('备份已确认，但本机恢复标记未能清除。为避免重复创建，页面已锁定；请刷新后只读核实。');
    }
    await onConfirmedRef.current(backup, recovered);
  }, [isCurrent]);

  const verifyMarker = useCallback(async (recovery: BackupCreateRecovery, generation: number) => {
    try {
      const status: BackupCreateRequestStatus = await getBackupCreateRequestStatus(recovery.requestId);
      if (!isCurrent(recovery, generation)) return;
      if (status.state === 'created') {
        await finishConfirmed(recovery, generation, { message: '备份创建成功', name: status.name }, true);
        return;
      }
      if (status.state === 'not_found') {
        setPhase('not_found');
        setMessage('服务器暂未找到上次备份。请明确选择使用同一编号重试；系统不会自动重建备份。');
        return;
      }
      setPhase('uncertain');
      setMessage('上次备份仍在处理中。核实完成前已暂停新的备份操作。');
    } catch {
      if (!isCurrent(recovery, generation)) return;
      setPhase('uncertain');
      setMessage('暂时无法核实上次备份结果。请重新核实；核实完成前不会再次创建。');
    }
  }, [finishConfirmed, isCurrent]);

  const run = useCallback(async (recovery: BackupCreateRecovery, generation: number, retry: boolean) => {
    const operationId = ++operationRef.current;
    busyRef.current = true;
    setIsRunning(true);
    setPhase(retry ? 'submitting' : 'checking');
    setMessage(retry ? '正在使用原请求编号重新创建备份…' : '正在只读核实上次备份结果…');
    try {
      if (!retry) {
        await verifyMarker(recovery, generation);
        return;
      }
      try {
        const result = await createBackup(recovery.requestId);
        await finishConfirmed(recovery, generation, result, false);
      } catch {
        await verifyMarker(recovery, generation);
      }
    } finally {
      if (operationRef.current === operationId) {
        busyRef.current = false;
        setIsRunning(false);
      }
    }
  }, [finishConfirmed, verifyMarker]);

  useEffect(() => {
    const generation = ++generationRef.current;
    operationRef.current += 1;
    busyRef.current = false;
    setIsRunning(false);
    pendingRef.current = null;
    setPending(null);
    setMessage('');
    if (!actorId) {
      setPhase('idle');
      return () => { generationRef.current += 1; };
    }
    const stored = readRecovery(actorId);
    if (!stored.available) {
      setPhase('storage_error');
      setMessage('本机备份恢复标记无法读取。为避免重复创建，当前已暂停备份操作；请恢复当前浏览器会话存储后重新打开页面。');
      return () => { generationRef.current += 1; };
    }
    const recovery = stored.recovery;
    pendingRef.current = recovery;
    setPending(recovery);
    if (!recovery) {
      setPhase('idle');
      return () => { generationRef.current += 1; };
    }
    void run(recovery, generation, false);
    return () => { generationRef.current += 1; };
  }, [actorId, run]);

  const start = useCallback(async () => {
    if (!actorId || busyRef.current || pendingRef.current || phase !== 'idle') return;
    const requestId = window.crypto?.randomUUID?.();
    if (!requestId) {
      setPhase('storage_error');
      setMessage('当前浏览器无法生成安全的备份请求编号，已暂停创建。');
      return;
    }
    const recovery = { actorId, requestId: requestId.toLowerCase() };
    if (!persistRecovery(recovery)) {
      setPhase('storage_error');
      setMessage('本机无法保存备份恢复标记，已暂停创建。请恢复当前浏览器会话存储后重试。');
      return;
    }
    pendingRef.current = recovery;
    setPending(recovery);
    await run(recovery, generationRef.current, true);
  }, [actorId, phase, run]);

  const verify = useCallback(async () => {
    const recovery = pendingRef.current;
    if (!recovery || busyRef.current || (phase !== 'uncertain' && phase !== 'not_found' && phase !== 'storage_error')) return;
    await run(recovery, generationRef.current, false);
  }, [phase, run]);

  const retry = useCallback(async () => {
    const recovery = pendingRef.current;
    if (!recovery || busyRef.current || phase !== 'not_found') return;
    await run(recovery, generationRef.current, true);
  }, [phase, run]);

  return {
    pending,
    phase,
    message,
    busy: isRunning,
    start,
    verify,
    retry,
  };
}
