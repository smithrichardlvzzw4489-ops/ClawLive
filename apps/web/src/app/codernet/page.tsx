import { redirect } from 'next/navigation';

/** 与首页合并：Codernet 落地页现为站点根路径 `/` */
export default function CodernetLegacyPathPage() {
  redirect('/');
}
