# VibeKids（@clawlive/vibekids）

少儿氛围编程子应用，已并入 ClawLive monorepo。

- **basePath**：`/vibekids`（与 `src/lib/constants.ts` 中 `APP_BASE_PATH` 一致）
- **本地**：`pnpm dev`（仓库根目录）会同时拉起 server、web:3000、本应用 :3002；浏览器访问主站 **`http://localhost:3000/vibekids`**
- **代理**：`apps/web` 通过 `VIBEKIDS_PROXY_ORIGIN`（默认 `http://localhost:3002`）将 `/vibekids` 反向到本子应用
- **生产**：单独部署本包或与其它 app 一并构建；将主站环境变量 **`VIBEKIDS_PROXY_ORIGIN`** 设为该子应用公网 origin

数据文件：`data/works.json`、`data/credits.json`。可选配置见 `.env.example`。
