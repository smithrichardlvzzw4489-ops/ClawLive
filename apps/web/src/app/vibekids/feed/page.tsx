import { redirect } from "next/navigation";
import { VK_BASE } from "@/lib/vibekids/constants";

export default function FeedRedirectPage() {
  redirect(`${VK_BASE}/explore`);
}
