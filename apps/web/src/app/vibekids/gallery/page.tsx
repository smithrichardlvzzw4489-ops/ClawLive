import { redirect } from "next/navigation";
import { VK_BASE } from "@/lib/vibekids/constants";

export default function GalleryRedirectPage() {
  redirect(`${VK_BASE}/explore?tab=gallery`);
}
