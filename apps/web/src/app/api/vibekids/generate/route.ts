export const runtime = "nodejs";

/**
 * 匿名生成/修改已关闭：创作走已登录用户的 Darwin 通道（/api/lobster/vibekids-generate）。
 * 浏览广场与作品无需登录。
 */
export function POST() {
  return Response.json(
    {
      error: "login_required",
      detail:
        "生成与修改作品需先登录。微信小程序请在本小程序「登录」页授权；网页请使用主站账号登录。浏览作品与广场无需登录。",
    },
    { status: 401 },
  );
}
