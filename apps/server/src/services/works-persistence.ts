/**
 * 作品持久化：works + workMessages 保存到磁盘
 * 配置 PERSISTENT_DATA_PATH 后，重启/重新部署不会丢失
 */
import * as fs from 'fs';
import { getDataFilePath } from '../lib/data-path';

const WORKS_FILE = getDataFilePath('works.json');
const WORK_MESSAGES_FILE = getDataFilePath('work-messages.json');

type WorkMessage = {
  id: string;
  workId?: string;
  sender: 'user' | 'agent';
  content: string;
  videoUrl?: string;
  timestamp: Date;
};

type Work = {
  id: string;
  authorId: string;
  title: string;
  description?: string;
  resultSummary?: string;
  lobsterName: string;
  status: 'draft' | 'published';
  messages: WorkMessage[];
  tags?: string[];
  coverImage?: string;
  videoUrl?: string;
  viewCount: number;
  likeCount: number;
  createdAt: Date;
  publishedAt?: Date;
  updatedAt: Date;
};

function reviveDates(obj: any): any {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(reviveDates);
  if (typeof obj === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'timestamp' || k === 'createdAt' || k === 'updatedAt' || k === 'publishedAt') {
        out[k] = v ? new Date(v as string) : v;
      } else {
        out[k] = reviveDates(v);
      }
    }
    return out;
  }
  return obj;
}

export class WorksPersistence {
  static saveAll(
    worksMap: Map<string, Work>,
    workMessagesMap: Map<string, WorkMessage[]>
  ): void {
    try {
      const worksObj: Record<string, any> = {};
      worksMap.forEach((w, id) => {
        worksObj[id] = { ...w };
      });
      fs.writeFileSync(WORKS_FILE, JSON.stringify(worksObj, null, 2));

      const msgsObj: Record<string, any> = {};
      workMessagesMap.forEach((msgs, workId) => {
        msgsObj[workId] = msgs;
      });
      fs.writeFileSync(WORK_MESSAGES_FILE, JSON.stringify(msgsObj, null, 2));

      console.log(`💾 Saved ${worksMap.size} works, ${workMessagesMap.size} work message sets`);
    } catch (error) {
      console.error('❌ Failed to save works:', error);
    }
  }

  static loadAll(): {
    works: Map<string, Work>;
    workMessages: Map<string, WorkMessage[]>;
  } {
    const works = new Map<string, Work>();
    const workMessages = new Map<string, WorkMessage[]>();

    try {
      if (fs.existsSync(WORKS_FILE)) {
        const data = fs.readFileSync(WORKS_FILE, 'utf-8');
        const obj = JSON.parse(data);
        for (const [id, w] of Object.entries(obj)) {
          works.set(id, reviveDates(w) as Work);
        }
      }
      if (fs.existsSync(WORK_MESSAGES_FILE)) {
        const data = fs.readFileSync(WORK_MESSAGES_FILE, 'utf-8');
        const obj = JSON.parse(data);
        for (const [workId, msgs] of Object.entries(obj)) {
          workMessages.set(workId, (msgs as any[]).map((m) => reviveDates(m) as WorkMessage));
        }
      }
      if (works.size > 0 || workMessages.size > 0) {
        console.log(`📂 Loaded ${works.size} works, ${workMessages.size} work message sets from disk`);
      }
    } catch (error) {
      console.error('❌ Failed to load works:', error);
    }

    return { works, workMessages };
  }
}
