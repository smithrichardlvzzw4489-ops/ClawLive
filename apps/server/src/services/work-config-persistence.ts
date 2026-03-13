import * as fs from 'fs';
import * as path from 'path';

const CONFIG_FILE = path.join(__dirname, '../../.data/work-agent-configs.json');

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, '../../.data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export class WorkConfigPersistence {
  /**
   * Save config to file
   */
  static saveConfig(workId: string, config: any): void {
    try {
      let configs: Record<string, any> = {};
      
      // Read existing configs
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        configs = JSON.parse(data);
      }
      
      // Update config
      configs[workId] = {
        ...config,
        savedAt: new Date().toISOString(),
      };
      
      // Write back
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2));
      console.log(`💾 Saved config for work ${workId}`);
    } catch (error) {
      console.error(`❌ Failed to save config for work ${workId}:`, error);
    }
  }

  /**
   * Load config from file
   */
  static loadConfig(workId: string): any | null {
    try {
      if (!fs.existsSync(CONFIG_FILE)) {
        return null;
      }
      
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const configs = JSON.parse(data);
      
      return configs[workId] || null;
    } catch (error) {
      console.error(`❌ Failed to load config for work ${workId}:`, error);
      return null;
    }
  }

  /**
   * Load all configs
   */
  static loadAllConfigs(): Map<string, any> {
    const configMap = new Map<string, any>();
    
    try {
      if (!fs.existsSync(CONFIG_FILE)) {
        return configMap;
      }
      
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const configs = JSON.parse(data);
      
      for (const [workId, config] of Object.entries(configs)) {
        configMap.set(workId, config);
      }
      
      console.log(`📂 Loaded ${configMap.size} work agent configs from disk`);
    } catch (error) {
      console.error('❌ Failed to load configs:', error);
    }
    
    return configMap;
  }

  /**
   * Delete config
   */
  static deleteConfig(workId: string): void {
    try {
      if (!fs.existsSync(CONFIG_FILE)) {
        return;
      }
      
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const configs = JSON.parse(data);
      
      delete configs[workId];
      
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2));
      console.log(`🗑️ Deleted config for work ${workId}`);
    } catch (error) {
      console.error(`❌ Failed to delete config for work ${workId}:`, error);
    }
  }
}
