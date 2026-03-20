import { Router, Response } from 'express';
import { Server } from 'socket.io';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { mtprotoService } from '../../services/telegram-mtproto';
import { WorkConfigPersistence } from '../../services/work-config-persistence';

// Work Agent configurations (in-memory + persistent)
export const workAgentConfigs = WorkConfigPersistence.loadAllConfigs();

console.log(`[CFG] Initialized work agent configs: ${workAgentConfigs.size} configs loaded`);

// Restore MTProto sessions for active configs
(async () => {
  for (const [workId, config] of workAgentConfigs.entries()) {
    if (config.sessionString && config.agentStatus === 'active') {
      console.log(`[RESTORE] Restoring MTProto session for work ${workId}...`);
      try {
        const result = await mtprotoService.restoreSession(workId, config.sessionString);
        if (result.success) {
          console.log(`[OK] MTProto session restored for work ${workId}`);
        } else {
          console.error(`[ERR] Failed to restore session for work ${workId}:`, result.error);
        }
      } catch (error) {
        console.error(`[ERR] Error restoring session for work ${workId}:`, error);
      }
    }
  }
})();

export function workAgentConfigRoutes(io: Server): Router {
  const router = Router();

  /**
   * GET /api/work-agent-config/:workId
   * 内存无配置时从持久化恢复（服务重启后自动恢复）
   */
  router.get('/:workId', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      
      console.log(`📥 GET work-agent-config for work: ${workId}`);
      
      let config = workAgentConfigs.get(workId);
      if (!config) {
        const persisted = WorkConfigPersistence.loadConfig(workId);
        if (persisted) {
          workAgentConfigs.set(workId, persisted);
          config = persisted;
          console.log(`✅ [WorkAgent] Restored config for work ${workId} from persistence`);
        }
      }
      config = config || {
        agentType: 'mock',
        agentEnabled: false,
        agentChatId: '',
        agentStatus: 'disconnected',
      };
      
      res.json({
        ...config,
        workId,
      });
    } catch (error) {
      console.error('Error fetching work agent config:', error);
      res.status(500).json({ error: 'Failed to fetch config' });
    }
  });

  /**
   * POST /api/work-agent-config/:workId/mtproto-start
   */
  router.post('/:workId/mtproto-start', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      const { phoneNumber } = req.body;

      console.log(`🔐 Starting MTProto login for work ${workId}, phone: ${phoneNumber}`);

      const result = await mtprotoService.startLogin(workId, phoneNumber);

      if (result.success) {
        const config = {
          agentType: 'mtproto',
          agentEnabled: false,
          agentChatId: '',
          agentStatus: 'logging_in',
          phoneNumber,
        };
        
        workAgentConfigs.set(workId, config);
        WorkConfigPersistence.saveConfig(workId, config);

        res.json({
          success: true,
          needsCode: result.needsCode,
          needsPassword: result.needsPassword,
          passwordHint: result.passwordHint,
        });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      console.error('MTProto start error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/work-agent-config/:workId/mtproto-code
   */
  router.post('/:workId/mtproto-code', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      const { code } = req.body;

      console.log(`🔐 Submitting code for work ${workId}`);

      const result = await mtprotoService.submitCode(workId, code);

      if (result.success) {
        if (result.needsPassword) {
          res.json({
            success: true,
            needsPassword: true,
            passwordHint: result.passwordHint,
          });
        } else {
          const config = workAgentConfigs.get(workId) || {};
          config.sessionString = result.sessionString;
          config.agentStatus = 'logged_in';
          workAgentConfigs.set(workId, config);
          WorkConfigPersistence.saveConfig(workId, config);

          res.json({
            success: true,
            sessionString: result.sessionString,
          });
        }
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      console.error('MTProto code error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/work-agent-config/:workId/mtproto-password
   */
  router.post('/:workId/mtproto-password', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      const { password } = req.body;

      console.log(`🔐 Submitting 2FA password for work ${workId}`);

      const result = await mtprotoService.submitPassword(workId, password);

      if (result.success) {
        const config = workAgentConfigs.get(workId) || {};
        config.sessionString = result.sessionString;
        config.agentStatus = 'logged_in';
        workAgentConfigs.set(workId, config);
        WorkConfigPersistence.saveConfig(workId, config);

        res.json({
          success: true,
          sessionString: result.sessionString,
        });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      console.error('MTProto password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/work-agent-config/:workId/mtproto-complete
   */
  router.post('/:workId/mtproto-complete', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      const { agentChatId } = req.body;

      if (!agentChatId) {
        return res.status(400).json({ error: 'Agent Chat ID is required' });
      }

      console.log(`✅ Completing MTProto setup for work ${workId}, Agent: ${agentChatId}`);

      const config = workAgentConfigs.get(workId);
      if (!config || !config.sessionString) {
        return res.status(400).json({ error: 'No active session' });
      }

      config.agentEnabled = true;
      config.agentChatId = agentChatId;
      config.agentStatus = 'active';
      workAgentConfigs.set(workId, config);
      WorkConfigPersistence.saveConfig(workId, config);

      console.log(`✅ Work agent config saved to disk for ${workId}`);

      res.json({
        success: true,
        config: {
          agentType: 'mtproto',
          agentEnabled: true,
          agentChatId,
          agentStatus: 'active',
        },
      });
    } catch (error) {
      console.error('MTProto complete error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * DELETE /api/work-agent-config/:workId/clear
   * 仅断开 MTProto 会话，不删除持久化配置（Agent 链接信息永久保留）
   */
  router.delete('/:workId/clear', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      
      console.log(`🧹 Disconnecting work agent session for ${workId} (config kept permanently)`);
      
      await mtprotoService.logout(workId);
      
      // 仅断开，保留配置以便下次恢复
      const config = workAgentConfigs.get(workId);
      if (config) {
        config.agentStatus = 'disconnected';
        workAgentConfigs.set(workId, config);
        WorkConfigPersistence.saveConfig(workId, config);
      }
      
      console.log(`✅ Work agent session disconnected for ${workId}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing work agent config:', error);
      res.status(500).json({ error: 'Failed to clear config' });
    }
  });

  return router;
}
