# 小学奥数 3D 分步讲解 —— 技术规格 (P1)

## 0. 已确认的产品约束
- 仅 Web（PC + 手机浏览器自适应），纯前端静态站点，无后端。
- 题目由用户本人编写为 JSON 文件（放在 `content/problems/`），**无 AI 生成、无语音**。
- 视觉：**简洁教学风**——浅色背景、少量强调色、细描边，无卡通/装饰。
- 讲解形式：题目拆成若干步骤，每步 = 3D 画面变化 + 图文卡片（标题 / 讲解文字 / 公式 / 可选图片）。

## 1. 技术栈
Vite + React 19 + TypeScript(strict) + three + @react-three/fiber + @react-three/drei + zustand + zod + katex + vitest。
不使用 GSAP：动画由「状态快照 + useFrame 阻尼插值」实现（drei 依赖的 `maath/easing` 可用）。
路由：自写极简 hash 路由（`#/` 列表，`#/p/:id` 讲解页），不引入 react-router。

## 2. 核心架构：状态快照
```
Problem JSON ──zod校验──► Problem
                           │
   engine.computeStates(problem) ──► SceneState[]   (第 i 项 = 第 i 步结束时的完整场景状态)
                           │
   Player: currentStep=i ──► <Stage state={states[i]}/>  渲染层把当前视觉值阻尼插值到目标状态
```
- `SceneState` 由初始场景 + 依次折叠 (reduce) 第 0..i 步的 actions 得到，**纯函数、可单测**。
- 因此任意跳步/后退都是确定的；渲染层只负责"平滑过渡到目标"。
- 每一步开始前会自动清除"临时"效果吗？——不会。状态是累积的；需要清除时显式使用 `clear` / `reset` 动作。

## 3. DSL（题目 JSON）
```ts
Problem {
  id: string                 // 唯一，用于路由
  title: string
  series?: string; order?: number; section?: string   // 题目分组（见 §8.5）
  grade?: number[]           // 适用年级
  tags?: string[]            // 题型标签
  problem: string            // 题干原文
  answer?: string            // 最终答案（列表页/末尾展示）
  scene: {
    objects: SceneObject[]
    camera?: CameraSpec      // 初始相机
  }
  steps: Step[]              // ≥1
}

CameraSpec { position: [x,y,z], target?: [x,y,z] }   // target 默认 [0,0,0]

SceneObject =
  | { id, type: "CubeGrid",  size: [nx,ny,nz], paint?: "surface"|"none", visible?: boolean, position?: [x,y,z] }
  | { id, type: "CubeStack", heights: number[][], visible?, position? }   // 俯视高度图: heights[row][col]，用于数积木/三视图
  | { id, type: "Label",     text: string, position: [x,y,z], visible? } // 3D 空间中的文字标注（DomTag）
  | { id, type: "Bench", ... } | { id, type: "Arrow", from, to, text? }   // 盈亏问题的“板凳模型”，见 §8

Step {
  title: string
  type?: "normal" | "quiz" | "explore"     // 默认 normal
  narration?: string          // 讲解文字，支持 **加粗** 和换行
  formula?: string            // KaTeX 字符串
  image?: string              // 可选配图 URL（相对 public/）
  camera?: CameraSpec         // 本步相机目标
  autoRotate?: boolean        // 本步期间相机缓慢自转（纯视觉，不进状态）
  actions?: Action[]
  // quiz
  question?: string; options?: string[]; answer?: number; explanation?: string
  // explore
  control?: { param: string, min: number, max: number, step?: number, default: number,
              bind: { target: string, prop: "size", value: Expr[] }[] }   // 如 value: ["n","n","n"]
  formulaTemplate?: string    // 如 "8,\\ 12(n-2)={{12*(n-2)}}" ; {{expr}} 用安全表达式求值后替换
}
```

### 3.1 单元格属性（用于 filter）
CubeGrid / CubeStack 的每个小正方体（cell）在引擎中预计算属性：
- `x, y, z`：整数坐标（y 向上，从 0 开始）
- `layer`：= y
- `paintedFaces`：暴露在外表面的面数（CubeGrid: 位于包围盒边界的面数；CubeStack: 相邻位置没有方块的面数，**底面也算外露但不涂色**——见下）
  - CubeGrid `paint:"surface"` 时：paintedFaces = 落在大立方体 6 个外表面上的面数（0~3；1×N 等退化尺寸按实际计算）
  - CubeStack：`exposedFaces` = 6 - 相邻方块数（含底面朝地视为不外露）；同时提供 `paintedFaces` = exposedFaces
- `region`：CubeGrid 专用，"corner" | "edge" | "face" | "inner"（按 paintedFaces 3/2/1/0 映射，仅对 n≥2 有意义）

Filter = 对象，各键为 AND 关系，值可为单值或数组(数组 = OR)：
`{ "paintedFaces": 3 }`、`{ "paintedFaces": [1,2] }`、`{ "layer": 0 }`、`{ "region": "edge", "x": 0 }`。省略 filter = 全部 cell。

### 3.2 动作 (Action)
| do | 参数 | 效果（写入 SceneState） |
|---|---|---|
| `show` / `hide` | target | 对象可见性 |
| `explode` | target, gap(默认0.4) | cell 间距 (0=合拢) |
| `highlight` | target, filter?, color | 匹配 cell 的覆盖色 |
| `fade` | target, filter?, opacity | 匹配 cell 透明度 (0~1，0 = 隐藏) |
| `number` | target, filter? | 给匹配 cell 显示序号 1..k（按 y,z,x 排序），渲染时依次弹出 |
| `clear` | target | 清除该对象所有 highlight/fade/number（不影响 explode/size） |
| `reset` | target | 恢复到初始定义 |
| `setText` | target(Label), text | 修改标注文字 |
| `move` | target, position | 移动整个对象 |
| `fill` `setSlots` `mark` `unmark` `remainder` `transfer` `brace` `divider` `clearNotes` | 见 §8 | Bench 专用 |

未知 target / 不匹配类型 → zod 或引擎抛出带步骤号的清晰错误。

### 3.3 安全表达式
`Expr` 为字符串，只支持：数字、变量（control 的 param）、`+ - * / ^ ( )`、一元负号。自写递归下降解析器，**禁止 eval / new Function**。

## 4. 渲染层
- CubeGrid/CubeStack：每个 cell 一个 mesh（P1 规模 ≤ 6³=216 个，足够），`Edges` 细描边。
  - 默认色：未涂面 `#f4efe6`(米白)，涂色面 `#e5484d`(红)。**每个面单独着色**：只有外表面那几个面是红色，这样切开后能看出"涂了几面"。
  - highlight 覆盖整个 cell 颜色（或加发光描边），fade 控制透明度。
  - explode：cell 位置 = 坐标 *(1+gap)，整体居中。
- 过渡：所有数值（位置、透明度、颜色、gap）用 `maath/easing.damp` 系列在 useFrame 中趋近目标，约 0.4~0.6s 完成。
- 相机：drei `CameraControls`，步骤切换时 `setLookAt(..., true)` 平滑过渡；用户可自由拖动旋转/缩放；提供"重置视角"按钮。
- number：drei `Html` 小圆标，按序号 stagger 出现（每个 80ms）。

## 5. 播放器 UI
```
桌面(≥900px):  [ 3D 舞台 65% | 步骤卡片 35% ]
                [        底部控制条            ]
手机(<900px):   3D 舞台(上, 约 50vh) / 步骤卡片(下, 可滚动) / 控制条(固定底部)
```
- 顶部：返回列表、题目标题、"查看题目"(展开题干)。
- 步骤卡片：`第 i / N 步`、标题、讲解文字、公式(KaTeX)、配图。
  - quiz：选项按钮，选择后显示对/错 + explanation；**未作答也可以点下一步**。
  - explore：参数滑块，拖动实时改变 3D（size 变化时重建 cell）与 formulaTemplate 结果。
- 控制条：上一步、步骤圆点（可点击跳转，当前高亮）、下一步；键盘 ← → 也可翻页。
- 列表页：卡片网格，显示标题、年级、标签、题干前 40 字。
- 风格：背景 `#fafaf7`，文字 `#1f2328`，强调蓝 `#2f6feb`，高亮黄 `#f5b301`，圆角 8px，系统字体。

## 6. 目录
```
olympiad-3d/
  content/problems/*.json      # 用户编写的题目
  public/                      # 配图等静态资源
  src/
    schema/      problem.ts    # zod schema + TS 类型
    engine/      cells.ts(属性预计算) filter.ts expr.ts state.ts(computeStates)
    stage/       Stage.tsx CubeGrid.tsx CubeStack.tsx Label3D.tsx CameraRig.tsx
    player/      Player.tsx StepCard.tsx Controls.tsx Quiz.tsx Explore.tsx Formula.tsx
    pages/       Home.tsx ProblemPage.tsx
    content.ts   # import.meta.glob 加载 + 校验；校验失败在页面上显示具体错误
    router.ts  App.tsx  main.tsx  styles.css
  tests/        # vitest：engine + 全部 content 文件 schema 校验
  docs/  DESIGN.md  AUTHORING.md
```

## 7. P1 验收标准
1. `npm run dev` 可启动；`npm run build` 无 TS 错误；`npm test` 通过。
2. 列表页展示所有题目；进入后可逐步播放、跳步、后退，画面平滑过渡且状态正确。
3. 样例题（均需完整可运行）：
   - `cube-paint-3`：3×3×3 染色计数（8/12/6/1），含 quiz 步、末尾 n×n×n explore 步。
   - `count-blocks`：CubeStack 数积木（按层 number 计数 + 三视图相机视角）。
4. 题目 JSON 写错时，页面显示"第几题/第几步/哪个字段"出错，而不是白屏。

## 8. 板凳模型 Bench（盈亏问题，S06 起）
老师板书 `① 3 3 … 3  多16颗` 的一行 = 一个 `Bench` 对象；`Arrow` 是带文字的细箭头。字段与动作的完整说明见 AUTHORING.md「板凳模型」一章，这里只记设计要点。

### 8.1 DSL
- `Bench { id, type, position?, label?, slots, show?, container?, caption?, fill?, countLabel?, remainder?, visible? }`
  - `slots` 是逻辑份数（≤1000），`show: [[from,to],…]`（1 起、闭区间）决定画哪些份，**不连续处自动画 “…”**（占一个份的位置）；同时显示 ≤24 份。
  - `container`: `seat | plate | person | box | none`；`fill` 是每份默认装的 `Segment[]`（`token`：shape/count/color/name；`block`：text/height/color）。
  - `remainder: { type: extra|short, text, items? }`：行尾多 / 少。extra = 实体、绿字；short = 虚影（半透明 + 红色虚线描边）、红字。
- `Arrow { id, type, from, to, text?, color?, visible? }`
- 新动作（只对 Bench）：`fill` `setSlots` `mark` `unmark` `remainder` `transfer` `brace` `divider` `clearNotes`；通用 `show/hide/move/reset/clear` 也适用于 Bench / Arrow（`clear` 对 Bench = 清 mark；`move` 对 Arrow 平移整根箭头；`setText` 对 Arrow 改文字）。`highlight/fade/number/explode` 对 Bench 报错并提示改用 `mark`。

### 8.2 状态与 token 身份（engine/bench.ts）
- `ObjectState.bench: BenchState`：`slotStates[i] = { segs: [{shape,color,name?,text?,height?,ids[]}], countText, marks }`，另有 `remainder / braces / dividers / defaultFill / nextId`。全部不可变，照旧由 `computeStates` 折叠。
- **token 有稳定 id**（`t0,t1…`，由 `nextId` 单调递增生成；`reset` 也不回退计数，新 id 不会和旧 id 撞车）。`transfer` 只搬 id、不改 id；`fill` 重写一份时按形状**沿用已有 id**（3 个球变“3 蓝 + 2 橙”是原地变色，只有多出 / 少掉的淡入淡出）。
- 校验分两层：`validateProblem` 检查对象定义（show 越界、数量上限等）和动作 / 对象类型是否匹配；与当前状态有关的（份数越界、transfer 份数对不上 / token 不够拿 / 搬到被省略的份……）在 `applyBenchAction` 里抛 `ProblemError`，`computeStates` 补上步骤号，最终都报成「文件 / 第几步 / 字段 / 原因」。

### 8.3 布局（纯函数 `layoutBench`，局部坐标）
- 份沿 +x 等距，间距 1.3；`position` 是**份区域的中心**，`label` 在最左、`remainder` 在最右（不参与居中，这样多行的份能上下对齐）。
- 每份内 token 从下往上每层 ≤3 个堆叠，block 单独一层；`person` 容器的东西放在身前。数字标签统一放在“所有份最高处”之上，对齐成一行；`brace` 在可见部分的首尾之间画；`divider` 在第 k 份右缘（k 被省略则落在 “…” 或最近可见份的边缘）。
- `sceneRadius` 把可见 Bench（含 label / remainder / 大括号）和 Arrow 的包围盒并起来取半对角线，行变长或出现“多 16 颗”时相机自动拉远。

### 8.4 渲染（stage/Bench3D.tsx、Arrow3D.tsx）
- Bench 级别把所有 token 展平，**按 id 作 React key**，位置 / 缩放 / 颜色 / 透明度全部 `damp` 插值：transfer 就是同一个 key 的目标位置换了份，所以看得到“飞过去”。
- 消失的东西（被 fill 删掉、被 show / setSlots 藏起来）由 `useRetained` 保留到缩小到看不见再卸载；新出现的从 0 放大。
- 文字（数字、说明、多 / 少、大括号文字、箭头文字）一律用 `DomTag`（不用 drei `Html`），显隐靠 CSS opacity 渐变。

### 8.5 题目分组
`Problem.series / order / section`（可选）。`catalog.ts`：首页按 series 分组（无 series 归“其他”排最后）、组内按 order（无 order 排后）；讲解页标题前显示 section，并提供同系列内的上一题 / 下一题。
