-- A2A 仅站内 Darwin 代聊，移除外部通道列
ALTER TABLE "job_a2a_seeker_profiles" DROP COLUMN IF EXISTS "jobChatChannel";
ALTER TABLE "job_a2a_employer_profiles" DROP COLUMN IF EXISTS "jobChatChannel";
