import { redirect } from 'next/navigation';

/** Legacy path `/codernet` redirects to site root (GITLINK home). */
export default function CodernetLegacyPathPage() {
  redirect('/');
}
