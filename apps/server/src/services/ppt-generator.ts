/**
 * PPT 生成服务
 * 基于 pptxgenjs 生成 .pptx 文件，保存到 uploads 目录，返回下载路径
 */
import PptxGenJS from 'pptxgenjs';
import * as path from 'path';
import * as fs from 'fs';
import { UPLOADS_DIR } from '../lib/data-path';
import { v4 as uuidv4 } from 'uuid';

export interface SlideInput {
  title: string;
  content?: string;
  notes?: string;
}

const THEME = {
  background: '1A1A2E',   // 深蓝黑
  primary: 'E94560',      // 亮红（虾米色）
  text: 'EAEAEA',         // 浅灰文字
  subtext: 'A0A0B0',      // 次要文字
  accent: '0F3460',       // 深蓝强调
  white: 'FFFFFF',
};

function splitBullets(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.replace(/^[•\-\*]\s*/, '').trim())
    .filter(Boolean);
}

export async function generatePptx(
  slides: SlideInput[],
  presentationTitle = '演示文稿',
  userId?: string,
): Promise<{ filePath: string; downloadUrl: string; slideCount: number }> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = presentationTitle;
  pptx.subject = presentationTitle;
  pptx.author = 'ClawLab Darwin';

  // 定义 master slide 背景
  pptx.defineSlideMaster({
    title: 'MASTER_SLIDE',
    background: { color: THEME.background },
  });

  // ─── 封面页（第一页特殊处理）────────────────────────────────────────
  const firstSlide = slides[0];
  const coverSlide = pptx.addSlide({ masterName: 'MASTER_SLIDE' });

  // 顶部装饰条
  coverSlide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: 0.08,
    fill: { color: THEME.primary },
    line: { type: 'none' },
  });

  // 主标题
  coverSlide.addText(firstSlide.title, {
    x: 0.6, y: 1.2, w: 8.8, h: 1.8,
    fontSize: 40,
    bold: true,
    color: THEME.white,
    fontFace: 'Microsoft YaHei',
    align: 'left',
    wrap: true,
  });

  // 副标题/内容
  if (firstSlide.content) {
    coverSlide.addText(firstSlide.content, {
      x: 0.6, y: 3.1, w: 8.8, h: 1.2,
      fontSize: 20,
      color: THEME.subtext,
      fontFace: 'Microsoft YaHei',
      align: 'left',
      wrap: true,
    });
  }

  // 底部品牌标识
  coverSlide.addText('ClawLab · Darwin 生成', {
    x: 0, y: 6.8, w: '100%', h: 0.4,
    fontSize: 11,
    color: THEME.subtext,
    fontFace: 'Microsoft YaHei',
    align: 'right',
  });

  if (firstSlide.notes) {
    coverSlide.addNotes(firstSlide.notes);
  }

  // ─── 内容页（第2页起）───────────────────────────────────────────────
  for (let i = 1; i < slides.length; i++) {
    const s = slides[i];
    const slide = pptx.addSlide({ masterName: 'MASTER_SLIDE' });

    // 左侧色条
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 0.06, h: '100%',
      fill: { color: THEME.primary },
      line: { type: 'none' },
    });

    // 页面标题
    slide.addText(s.title, {
      x: 0.3, y: 0.18, w: 9.1, h: 0.7,
      fontSize: 26,
      bold: true,
      color: THEME.white,
      fontFace: 'Microsoft YaHei',
    });

    // 分隔线
    slide.addShape(pptx.ShapeType.line, {
      x: 0.3, y: 0.94, w: 9.1, h: 0,
      line: { color: THEME.primary, width: 1.5 },
    });

    // 内容区（支持要点列表或普通文字）
    if (s.content) {
      const bullets = splitBullets(s.content);
      if (bullets.length > 1) {
        // 要点列表
        const bulletRows = bullets.map((b) => ({
          text: b,
          options: { bullet: { type: 'bullet' as const }, fontSize: 18, color: THEME.text },
        }));
        slide.addText(bulletRows, {
          x: 0.5, y: 1.1, w: 8.9, h: 4.8,
          fontFace: 'Microsoft YaHei',
          lineSpacingMultiple: 1.4,
          valign: 'top',
        });
      } else {
        // 普通段落
        slide.addText(s.content, {
          x: 0.5, y: 1.1, w: 8.9, h: 4.8,
          fontSize: 18,
          color: THEME.text,
          fontFace: 'Microsoft YaHei',
          wrap: true,
          valign: 'top',
          lineSpacingMultiple: 1.5,
        });
      }
    }

    // 页码
    slide.addText(String(i + 1), {
      x: 9.0, y: 6.8, w: 0.6, h: 0.3,
      fontSize: 10,
      color: THEME.subtext,
      fontFace: 'Microsoft YaHei',
      align: 'right',
    });

    if (s.notes) {
      slide.addNotes(s.notes);
    }
  }

  // ─── 保存文件（先写到临时 ppt 目录） ─────────────────────────────────
  const pptDir = path.join(UPLOADS_DIR, 'ppt');
  if (!fs.existsSync(pptDir)) {
    fs.mkdirSync(pptDir, { recursive: true });
  }

  const tmpFilename = `ppt-${uuidv4().slice(0, 8)}.pptx`;
  const tmpFilePath = path.join(pptDir, tmpFilename);

  await pptx.writeFile({ fileName: tmpFilePath });

  // 如果提供了 userId，注册到用户文件柜
  let downloadUrl = `/uploads/ppt/${tmpFilename}`;
  if (userId) {
    try {
      const { registerFile } = await import('./lobster-user-files');
      const userFile = registerFile({
        userId,
        existingPath: tmpFilePath,
        displayName: `${presentationTitle}.pptx`,
        type: 'ppt',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        source: 'generated',
        toolName: 'create_ppt',
      });
      downloadUrl = userFile.downloadPath;
    } catch (e) {
      console.error('[PPT] Failed to register to user files:', e);
    }
  }

  return {
    filePath: tmpFilePath,
    downloadUrl,
    slideCount: slides.length,
  };
}
