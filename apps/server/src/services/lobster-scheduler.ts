/**
 * 虾米 — 定时任务调度器
 * 使用 node-cron 执行用户设定的定时任务
 */
import cron, { ScheduledTask } from 'node-cron';
import { loadSchedules, updateScheduleLastRun, LobsterSchedule } from './lobster-schedules';

type TaskRunner = (schedule: LobsterSchedule) => Promise<void>;

const _jobs = new Map<string, ScheduledTask>();
let _runner: TaskRunner | null = null;

export function setTaskRunner(runner: TaskRunner) {
  _runner = runner;
}

export function startScheduler() {
  const schedules = loadSchedules();
  for (const s of schedules) {
    if (s.enabled) registerJob(s);
  }
  console.log(`[Scheduler] Started with ${schedules.filter(s => s.enabled).length} active tasks`);
}

export function registerJob(schedule: LobsterSchedule) {
  if (_jobs.has(schedule.id)) {
    _jobs.get(schedule.id)!.stop();
  }
  if (!cron.validate(schedule.cronExpr)) {
    console.warn(`[Scheduler] Invalid cron expression: ${schedule.cronExpr}`);
    return;
  }
  const task = cron.schedule(schedule.cronExpr, async () => {
    console.log(`[Scheduler] Running task ${schedule.id}: ${schedule.description}`);
    try {
      if (_runner) await _runner(schedule);
      await updateScheduleLastRun(schedule.id);
    } catch (err) {
      console.error(`[Scheduler] Task ${schedule.id} failed:`, err);
    }
  }, { timezone: 'Asia/Shanghai' });
  _jobs.set(schedule.id, task);
}

export function unregisterJob(id: string) {
  const job = _jobs.get(id);
  if (job) { job.stop(); _jobs.delete(id); }
}

export function getJobCount(): number {
  return _jobs.size;
}
