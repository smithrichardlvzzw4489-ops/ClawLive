import { redirect } from 'next/navigation';

/** Math 已并入 GITLINK 首页 MATH 标签；保留旧路径以免书签失效。 */
export default function MathLegacyRedirectPage() {
  redirect('/?tab=math');
}
