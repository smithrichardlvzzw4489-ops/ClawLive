'use client';

import { MyProfileManage } from '@/components/MyProfileManage';

/** 登录用户个人中心：管理作品与图文，与对外创作者主页 `/host/[id]` 独立 */
export default function MyProfilePage() {
  return <MyProfileManage />;
}
