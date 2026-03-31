/**
 * Darwin 沙箱预览：/sandbox-preview/:token/* → express.static(workspace)
 */
import express, { type Express } from 'express';
import { getPreviewEntry } from '../../services/darwin-sandbox-service';

export function mountSandboxPreview(app: Express): void {
  app.get('/sandbox-preview/:token', (req, res) => {
    res.redirect(302, `/sandbox-preview/${encodeURIComponent(req.params.token)}/`);
  });
  app.use(
    '/sandbox-preview/:token',
    (req, res, next) => {
      // 用户 Demo 常含内联脚本；放宽 CSP，避免 Helmet 默认策略导致页面空白
      res.setHeader(
        'Content-Security-Policy',
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; style-src * 'unsafe-inline'; img-src * data: blob:",
      );
      next();
    },
    (req, res, next) => {
      const token = req.params.token;
      const entry = getPreviewEntry(token);
      if (!entry) {
        res
          .status(404)
          .type('text/plain; charset=utf-8')
          .send('预览已过期或链接无效。请让 Darwin 重新执行 sandbox_start_preview。');
        return;
      }
      express.static(entry.workspace, { index: ['index.html'], fallthrough: true })(req, res, next);
    },
    (req, res) => {
      if (!res.headersSent) {
        res.status(404).type('text/plain; charset=utf-8').send('未找到该文件。');
      }
    },
  );
}
