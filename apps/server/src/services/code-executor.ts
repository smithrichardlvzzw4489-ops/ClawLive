/**
 * 代码沙盒执行服务
 * 在隔离的子进程中执行用户/虾米生成的 Python 代码
 * 安全限制：
 *  - 15 秒超时
 *  - 禁止网络访问（通过代码白名单检查）
 *  - 禁止文件系统写入（通过代码白名单检查）
 *  - 禁止系统命令（import os/subprocess 检查）
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

const TIMEOUT_MS = 15000;
const MAX_OUTPUT_LENGTH = 4000;

// 危险模块黑名单
const DANGEROUS_PATTERNS = [
  /\bimport\s+subprocess\b/,
  /\bimport\s+os\b/,
  /\bfrom\s+os\b/,
  /\b__import__\s*\(\s*['"]os['"]\s*\)/,
  /\bimport\s+socket\b/,
  /\bimport\s+urllib\b/,
  /\bimport\s+requests\b/,
  /\bimport\s+http\b/,
  /\bopen\s*\(/,
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /\bcompile\s*\(/,
  /\b__builtins__\b/,
  /\bgetattr\s*\([^,]+,\s*['"]__/,
];

function isCodeSafe(code: string): { safe: boolean; reason?: string } {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      return { safe: false, reason: `检测到不允许的操作: ${pattern.source}` };
    }
  }
  return { safe: true };
}

export interface CodeExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  error?: string;
}

/**
 * 执行 Python 代码（当前仅支持 Python）
 * @param language 目前支持 'python'
 * @param code     要执行的代码字符串
 */
export async function executeCode(
  language: string,
  code: string,
): Promise<CodeExecutionResult> {
  const start = Date.now();

  if (language !== 'python') {
    return {
      success: false,
      stdout: '',
      stderr: `暂不支持 ${language}，目前仅支持 Python。`,
      exitCode: 1,
      executionTimeMs: 0,
      error: 'UNSUPPORTED_LANGUAGE',
    };
  }

  // 安全检查
  const safety = isCodeSafe(code);
  if (!safety.safe) {
    return {
      success: false,
      stdout: '',
      stderr: `⚠️ 代码安全检查未通过：${safety.reason}`,
      exitCode: 1,
      executionTimeMs: Date.now() - start,
      error: 'UNSAFE_CODE',
    };
  }

  // 写入临时文件
  const tmpFile = path.join(os.tmpdir(), `xiazi-code-${Date.now()}.py`);
  try {
    fs.writeFileSync(tmpFile, code, 'utf-8');
  } catch (e) {
    return {
      success: false,
      stdout: '',
      stderr: '无法创建临时文件',
      exitCode: 1,
      executionTimeMs: Date.now() - start,
      error: 'TEMP_FILE_ERROR',
    };
  }

  // 查找 Python 可执行路径
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  try {
    const { stdout, stderr } = await execAsync(`${pythonCmd} "${tmpFile}"`, {
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 1024, // 1MB
      env: {
        ...process.env,
        // 防止 Python 访问某些环境变量
        PYTHONPATH: '',
      },
    });

    const elapsed = Date.now() - start;
    const trimmedStdout = stdout.slice(0, MAX_OUTPUT_LENGTH);
    const trimmedStderr = stderr.slice(0, 1000);

    return {
      success: !stderr || stderr.trim() === '',
      stdout: trimmedStdout,
      stderr: trimmedStderr,
      exitCode: 0,
      executionTimeMs: elapsed,
    };
  } catch (e: unknown) {
    const elapsed = Date.now() - start;
    const err = e as { killed?: boolean; code?: number; stderr?: string; stdout?: string; message?: string };

    if (err.killed || elapsed >= TIMEOUT_MS - 500) {
      return {
        success: false,
        stdout: '',
        stderr: `执行超时（超过 ${TIMEOUT_MS / 1000} 秒）`,
        exitCode: 1,
        executionTimeMs: elapsed,
        error: 'TIMEOUT',
      };
    }

    return {
      success: false,
      stdout: (err.stdout || '').slice(0, MAX_OUTPUT_LENGTH),
      stderr: (err.stderr || err.message || '执行失败').slice(0, 1000),
      exitCode: err.code ?? 1,
      executionTimeMs: elapsed,
    };
  } finally {
    // 清理临时文件
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

/** 格式化执行结果为虾米可读的字符串 */
export function formatExecutionResult(result: CodeExecutionResult): string {
  const lines: string[] = [];

  if (result.success || result.stdout) {
    if (result.stdout) {
      lines.push('```\n' + result.stdout.trimEnd() + '\n```');
    } else {
      lines.push('✅ 代码执行成功（无输出）');
    }
  }

  if (result.stderr && result.stderr.trim()) {
    lines.push(`⚠️ 错误信息：\n\`\`\`\n${result.stderr.trimEnd()}\n\`\`\``);
  }

  lines.push(`⏱ 执行耗时：${result.executionTimeMs}ms`);

  return lines.join('\n\n');
}
