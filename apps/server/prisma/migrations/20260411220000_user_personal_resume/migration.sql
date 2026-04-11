-- 用户自行维护的「个人简历」正文，与 LLM 生成的 codernetAnalysis 画像独立
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "personalResume" TEXT;
