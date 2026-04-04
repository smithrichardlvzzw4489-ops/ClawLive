"use client";

import Link from "next/link";
import { VK_BASE } from "@/lib/vibekids/constants";

/** 首页等处：三条激励线统一说明，降低理解成本 */
export function VibekidsIncentiveGuide() {
  return (
    <section className="w-full max-w-2xl rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-4 text-left shadow-sm">
      <p className="text-sm font-semibold text-slate-900">创作者激励 · 三条线</p>
      <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
        <li>
          <span className="font-semibold text-amber-900">经验与等级</span>
          ：生成成功、保存作品、完成「本周挑战」都会涨经验，等级条在创作室顶部可见，适合感受「我在进步」。
        </li>
        <li>
          <span className="font-semibold text-amber-900">创作积分</span>
          ：保存时按<strong>优质分</strong>发放；可兑换经验包或
          <strong>精选曝光券</strong>（下次保存时勾选，作品更容易进首页「精选展示」）。
        </li>
        <li>
          <span className="font-semibold text-violet-900">被看见</span>
          ：在{" "}
          <Link href={`${VK_BASE}/my-works`} className="font-medium text-violet-700 underline">
            我的作品
          </Link>{" "}
          点「发布到广场」后，其他人能在{" "}
          <Link href={`${VK_BASE}/explore`} className="font-medium text-violet-700 underline">
            作品广场 · 发现
          </Link>{" "}
          浏览、点赞；新发布作品在「热门」排序里会有一小段曝光加成，方便新人被刷到。
        </li>
      </ul>
      <details className="mt-3 rounded-xl bg-slate-50/90 px-3 py-2 text-[11px] text-slate-600">
        <summary className="cursor-pointer font-medium text-violet-800">
          给家长 / 老师
        </summary>
        <p className="mt-2 leading-relaxed">
          经验、周挑战进度与创作积分默认存在本机浏览器；换设备会不同步。生成次数若走 AI
          可能与额度有关。作品列表在服务器或 Redis，与浏览器无关。
        </p>
      </details>
    </section>
  );
}
