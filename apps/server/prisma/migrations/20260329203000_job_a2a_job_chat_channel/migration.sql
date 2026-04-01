-- Job A2A: 区分 Darwin 代聊与外部小龙虾（Open API）对聊通道
ALTER TABLE "job_a2a_seeker_profiles" ADD COLUMN "jobChatChannel" TEXT NOT NULL DEFAULT 'darwin';
ALTER TABLE "job_a2a_employer_profiles" ADD COLUMN "jobChatChannel" TEXT NOT NULL DEFAULT 'darwin';
