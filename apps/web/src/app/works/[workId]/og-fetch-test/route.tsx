/**
 * 诊断 2：测试 Edge 中 fetch API 是否成功
 * 若返回 200 且有 fetchOk，则 fetch 正常；否则问题在 fetch
 */
export const runtime = 'edge';

export async function GET(
  _request: Request,
  { params }: { params: { workId: string } }
) {
  const workId = params.workId;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const url = `${apiUrl}/api/works/${workId}`;

  let status = 'unknown';
  let ok = false;
  let error = '';

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    status = String(res.status);
    ok = res.ok;
    if (!res.ok) {
      error = await res.text();
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return new Response(
    JSON.stringify({
      workId,
      apiUrl: apiUrl.replace(/:[^:@]+@/, ':****@'),
      fetchStatus: status,
      fetchOk: ok,
      error: error.slice(0, 200),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
