"""
品牌更名：虾壳 → 虾米 ，虾仔 → 虾米
"""
import os
import re

TARGET_DIR = '.'

FILES = [
    'apps/web/src/components/LobsterWidget.tsx',
    'apps/web/src/components/MainLayout.tsx',
    'apps/server/src/api/routes/lobster.ts',
    'apps/server/src/services/user-behavior.ts',
    'apps/web/src/app/my-lobster/page.tsx',
    'apps/server/src/services/ppt-generator.ts',
    'apps/server/src/services/lobster-user-files.ts',
    'apps/server/src/services/code-executor.ts',
    'data/official-skills.json',
    'apps/server/src/services/skill-credits.ts',
    'apps/server/prisma/schema.prisma',
    'apps/server/src/services/lobster-user-skills.ts',
    'apps/server/src/services/browser-service.ts',
    'apps/server/src/services/lobster-notes.ts',
    'apps/web/src/lib/i18n/translations.ts',
    'DEPLOY_CONFIG_GUIDE.md',
    'apps/server/src/services/platform-models.ts',
    'apps/server/src/services/mcp-client.ts',
    'apps/server/src/services/lobster-scheduler.ts',
    'apps/server/src/services/lobster-schedules.ts',
    'apps/server/src/services/lobster-persistence.ts',
    '.env.example',
    'packages/shared-types/src/index.ts',
    'apps/web/src/lib/brand.ts',
]

total_changes = 0
for rel_path in FILES:
    path = os.path.join(TARGET_DIR, rel_path.replace('/', os.sep))
    if not os.path.exists(path):
        print(f'[SKIP] {rel_path} not found')
        continue
    with open(path, encoding='utf-8') as f:
        original = f.read()
    updated = original.replace('虾壳', '虾米').replace('虾仔', '虾米')
    if updated != original:
        count = original.count('虾壳') + original.count('虾仔')
        with open(path, 'w', encoding='utf-8') as f:
            f.write(updated)
        print(f'[OK] {rel_path}  ({count} replacements)')
        total_changes += count
    else:
        print(f'[--] {rel_path}  (no changes)')

print(f'\nDone. Total replacements: {total_changes}')
