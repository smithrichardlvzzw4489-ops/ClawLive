/**
 * 从上传文件提取纯文本（TXT/Markdown/PDF/DOCX/图片 OCR），供 Codernet 等 multipart 接口复用。
 */

import type { Express } from 'express';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import sharp from 'sharp';
import { getPublishingLlmClient, trackedChatCompletion } from './llm';

const IMAGE_MAX_BYTES = 6 * 1024 * 1024;
const VISION_MAX_SIDE = 1600;

function isPlainTextMime(m: string): boolean {
  const x = m.toLowerCase();
  return x.startsWith('text/') || x === 'application/json' || x.includes('markdown');
}

async function extractFromImage(buffer: Buffer, mime: string): Promise<string> {
  let buf = buffer;
  let outMime = mime;
  if (buffer.length > IMAGE_MAX_BYTES) {
    buf = await sharp(buffer).resize(VISION_MAX_SIDE, VISION_MAX_SIDE, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
    outMime = 'image/jpeg';
  }
  const b64 = buf.toString('base64');
  const dataUrl = `data:${outMime};base64,${b64}`;
  const { client, model } = getPublishingLlmClient();
  const prompt =
    '图中是一份职位描述（JD）或个人简历/材料。请只输出从图中识别出的正文文字，保持段落与条目的可读性；不要评价、不要加引号或前言。若无法识别请输出「（无法从图片提取文字）」。';

  const resp = await trackedChatCompletion(
    {
      model,
      max_tokens: 8000,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    },
    'attachment_image_ocr',
    { kind: 'image_ocr' },
    client,
  );

  return (resp.choices[0]?.message?.content || '').trim();
}

export async function extractTextFromUpload(file: Express.Multer.File): Promise<string> {
  const mime = (file.mimetype || '').toLowerCase();
  const name = (file.originalname || 'file').toLowerCase();

  if (isPlainTextMime(mime) || name.endsWith('.md') || name.endsWith('.txt')) {
    return file.buffer.toString('utf8');
  }

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    try {
      const data = await pdfParse(file.buffer);
      return (data.text || '').trim();
    } catch (e) {
      console.warn('[attachment-ingest] pdf-parse failed', name, e);
      return '';
    }
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    try {
      const { value } = await mammoth.extractRawText({ buffer: file.buffer });
      return (value || '').trim();
    } catch (e) {
      console.warn('[attachment-ingest] mammoth failed', name, e);
      return '';
    }
  }

  if (mime.startsWith('image/')) {
    try {
      return await extractFromImage(file.buffer, mime);
    } catch (e) {
      console.warn('[attachment-ingest] vision ocr failed', name, e);
      return '（图片识别失败：请粘贴文字，或确认当前部署的 LLM 支持多模态）';
    }
  }

  return '';
}

export async function concatExtractedFiles(
  files: Express.Multer.File[] | undefined,
  sectionLabel: string,
): Promise<string> {
  if (!files?.length) return '';
  const parts: string[] = [];
  for (const f of files) {
    const t = (await extractTextFromUpload(f)).trim();
    if (t) parts.push(`--- ${sectionLabel}: ${f.originalname} ---\n${t}`);
  }
  return parts.join('\n\n');
}
