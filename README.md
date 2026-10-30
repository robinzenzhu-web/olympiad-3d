# 小学奥数 3D 分步讲解（P1）

把一道奥数题拆成若干步骤：每一步 = **3D 画面的变化 + 图文讲解卡片**。纯前端静态站点，题目是 `content/problems/` 里的 JSON 文件，无后端、无 AI 生成。

- 技术栈：Vite + React 19 + TypeScript(strict) + three / @react-three/fiber / drei + zustand + zod + KaTeX + vitest
- 核心思路：`computeStates(problem)` 把每一步折叠成一个**状态快照**，3D 舞台只负责把当前快照平滑过渡出来，所以跳步、后退都是确定的。
- 技术规格见 [docs/DESIGN.md](docs/DESIGN.md)；**出题人请看 [docs/AUTHORING.md](docs/AUTHORING.md)**。

## 运行（Windows）

需要 Node.js 18+（已在 Node 22 下验证）。

```bat
cd D:\AI\olympiad-3d
npm install
npm run dev      :: 开发服务器，浏览器打开 http://localhost:5173/
npm run build    :: 类型检查 + 生产构建，产物在 dist/（可直接放到任意静态服务器）
npm test         :: 运行 vitest
```

> 如果你的环境设置了 `NODE_ENV=production`，`npm install` 会跳过 devDependencies，请用 `npm install --include=dev`，并在运行 `npm run dev` / `npm test` 前取消该变量。

路由是 hash 路由：`#/` 题目列表，`#/p/题目id` 讲解页，因此静态托管不需要任何服务端重写规则。

## 目录

```
content/problems/*.json   题目（出题人只改这里）
public/                   配图等静态资源（步骤的 image 字段相对此目录）
src/schema/               zod schema + 类型（DSL 定义）
src/engine/               纯函数：cells 属性预计算 / filter / expr 安全表达式 / state 状态快照 / validate 语义校验 / bench 板凳模型（盈亏问题：状态、动作、布局）
src/stage/                3D 渲染（每个 cell 一个 mesh，逐面着色，useFrame 阻尼插值，CameraControls；Bench3D / Arrow3D 画板凳模型）
src/player/               播放器 UI：步骤卡片、控制条、quiz、explore、KaTeX 公式
src/pages/                列表页、讲解页、错误展示
src/content.ts            加载 + 校验题目，出错显示 文件名/第几步/字段/原因
src/catalog.ts            题目分组（series / order / section）与同系列上一题、下一题
tests/                    vitest：engine 全部 + 所有题目文件的校验
docs/                     DESIGN.md（规格）、AUTHORING.md（出题指南）
```

## 新增一道题

1. 复制 `content/problems/cube-paint-3.json` 改名（盈亏题复制 `yk-01-yeguo.json`）；
2. 按 [AUTHORING.md](docs/AUTHORING.md) 修改；
3. 保存后刷新页面。写错时列表页顶部会显示具体错误位置，其他题目不受影响；
4. `npm test` 会自动校验 `content/problems/` 下的每一个文件。
