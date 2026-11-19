# SteamPyTools

SteamPy（steampy.com）CDKey 市场增强油猴脚本。给游戏卡片加上 Steam 好评等级、已拥有/愿望单标记、价格与好评筛选，并补充卖家页实用信息。

## 安装

1. 先给浏览器安装脚本管理器：[Tampermonkey（油猴）](https://www.tampermonkey.net/) 或脚本猫。
2. 打开 GreasyFork 脚本页：<https://greasyfork.org/zh-CN/scripts/606219-steampytools>
3. 点击「安装此脚本」，确认安装。
4. 打开 SteamPy 国区 CDKey 市场页面即可生效：
   - 新版：`https://steampy.com/pro/cdKey/cdKeyCn`
   - 旧版：`https://steampy.com/cdKey/cdKey`

也可以手动安装：把本仓库的 `SteamPyTools.js` 全文复制，在脚本管理器里新建脚本粘贴保存。脚本为单文件，所有依赖已内联，不需要额外安装库。

## 功能

- **价格筛选**：预设 0-20 元，或自定义最低价 / 最高价，条件本地保存。
- **好评筛选**：全部 / 特好以上 / 好评如潮。
- **卡片角标**：显示 Steam 好评等级（好评如潮 → 特别差评）与评价数量。
- **已拥有 / 愿望单标记**：已拥有游戏显示橙色框，愿望单游戏显示蓝色框，两者都有显示紫色虚线框。
- **隐藏已拥有**：顶部按钮栏的「隐藏已拥有」开关，可一键隐藏自己已买过的游戏，状态持久保存。
- **中键直达**：在游戏卡片上按鼠标中键，直接打开对应 Steam 商店页。
- **同步 Steam 数据**：菜单命令「同步Steam数据」，同步已拥有游戏、愿望单与订阅，用于上面的标记和隐藏功能。
- **刷新 Steam 评价缓存**：菜单命令「刷新Steam评价缓存」，清掉本地 24 小时评价缓存并立即重新获取。
- **卖家页增强**：弹窗显示历史最低价、在售排名与最低价提示，并在售列表增加按「数量」排序。
- **多地区适配**：支持 CN / RU / US / TL / ARS 等地区的 keyHot / getOne 接口。

## 评分数据说明

优先使用 SteamPy 列表接口自带的 `rating` 字段；当站点没有返回评分时，会匿名读取 Steam 商店页的评价摘要（好评率与评价数），并在本地缓存 24 小时。Steam 的 appreviews JSON 接口在当前网络环境下会跳转到商店首页，因此不作为数据源。

## 权限与隐私

脚本仅匹配 `steampy.com`。同步 Steam 数据需要你先登录 Steam 网页，并允许脚本管理器读取 `store.steampowered.com` / `steamcommunity.com` 的 Cookie；如果读不到 Cookie，同步会失败或返回空数据。评价数据匿名抓取，所有缓存和筛选条件只保存在脚本管理器本地存储中，不上传到任何服务器。

## 开发

- 单文件 `SteamPyTools.js`，依赖已内联，修改后整份替换即可。
- 每次修改 `@version` 递增 0.1。
- 最小检查：`node --check SteamPyTools.js`。

## 链接

- GreasyFork：<https://greasyfork.org/zh-CN/scripts/606219-steampytools>
- GitHub：<https://github.com/TieZhuKot/SteamPyTools>
