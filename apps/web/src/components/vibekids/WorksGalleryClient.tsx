import type { SavedWorkSummary } from "@/lib/vibekids/works-storage";
import { WorkGridClient } from "@/components/vibekids/WorkGridClient";

type Props = {
  works: SavedWorkSummary[];
};

/** 作品展示区：小红书式瀑布流 + 无限滚动 */
export function WorksGalleryClient({ works }: Props) {
  return <WorkGridClient works={works} defaultSort="new" immersive />;
}
