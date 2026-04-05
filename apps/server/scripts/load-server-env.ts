import { config } from 'dotenv';
import { resolve } from 'path';

/** 仓库根 apps/server/scripts → ../../../.env */
const repoRootEnv = resolve(__dirname, '../../../.env');
const serverEnv = resolve(__dirname, '../.env');

// 先根目录，再 apps/server（后者覆盖同名键，便于本机覆盖）
config({ path: repoRootEnv });
config({ path: serverEnv, override: true });
