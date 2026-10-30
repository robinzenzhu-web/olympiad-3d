# 出题指南：怎么写一道新题（不用懂代码）

一道题 = 一个 `.json` 文件，放在 `content/problems/` 文件夹里。保存后刷新网页，它就会出现在题目列表里。

> JSON 是一种“带格式的文字”。你只需要照着样例改文字、改数字。最容易错的地方：**逗号**、**引号**、**括号**。写错了页面不会白屏，会直接告诉你“哪个文件 / 第几步 / 哪个字段 / 错在哪”（见文末“常见错误”）。

## 目录

1. [最小可复制模板](#最小可复制模板)
2. [整体结构](#整体结构)
3. [场景里的东西（两种方块 + 文字标注）](#场景里的东西)
4. [每一步怎么写](#每一步怎么写)
5. [动作 action 一览](#动作-action-一览)
6. [filter：挑出你想要的那些小方块](#filter挑出你想要的那些小方块)
7. [**板凳模型（盈亏问题）：Bench 与 Arrow**](#板凳模型盈亏问题bench-与-arrow)（含最小 Bench 模板、全部动作示例）
8. [题目分组：series / order / section](#题目分组series--order--section)
9. [选择题 quiz](#选择题-quiz)
10. [探索题 explore（滑块）](#探索题-explore滑块)
11. [讲解文字、公式、颜色、相机](#讲解文字公式颜色相机)
12. [常见错误](#常见错误)

---

## 最小可复制模板

复制下面整段，另存为 `content/problems/my-first.json`（文件名随意，建议和 `id` 一样），然后改文字即可。这是一道 2 步的小题：先看 4×4×4 的大正方体，再把它切开。

```json
{
  "id": "my-first",
  "title": "我的第一道题",
  "grade": [4, 5],
  "tags": ["涂色问题"],
  "problem": "把一个棱长是 4 厘米的正方体表面涂红，再切成棱长 1 厘米的小正方体，三面涂色的有几块？",
  "answer": "8 块",
  "scene": {
    "objects": [
      { "id": "cube", "type": "CubeGrid", "size": [4, 4, 4], "paint": "surface" }
    ],
    "camera": { "position": [7, 5, 8] }
  },
  "steps": [
    {
      "title": "先看看这个大正方体",
      "narration": "它是 **4×4×4** 的大正方体，外面涂成了红色。",
      "autoRotate": true
    },
    {
      "title": "找出三面涂色的",
      "narration": "三面涂色的都在**角**上，一共 **8 块**。",
      "formula": "8",
      "actions": [
        { "do": "explode", "target": "cube", "gap": 0.5 },
        { "do": "highlight", "target": "cube", "filter": { "paintedFaces": 3 }, "color": "yellow" },
        { "do": "number", "target": "cube", "filter": { "paintedFaces": 3 } }
      ]
    }
  ]
}
```

**两个重要的规矩：**

- 状态是**累积**的：前面步骤做过的事（高亮、拆开……）会一直保留，直到你用 `clear` / `reset` 清掉。
- 每一步的最终画面只由“第 1 步到这一步所有动作”决定，所以用户随便点哪一步（跳着看、倒着看）画面都是对的。

---

## 整体结构

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 题目编号，只能用英文字母、数字、`-`、`_`，不能重复（会出现在网址里：`#/p/你的id`） |
| `title` | ✅ | 题目标题（列表页和顶部显示） |
| `problem` | ✅ | 题干原文 |
| `grade` | | 适用年级，如 `[4, 5]` |
| `tags` | | 题型标签，如 `["涂色问题", "计数"]` |
| `answer` | | 最终答案，会显示在**最后一步**的卡片底部 |
| `series` | | 系列名，如 `"三秋 S06 · 盈亏进阶"`。首页按它分组；不写则归入“其他”（见[题目分组](#题目分组series--order--section)） |
| `order` | | 数字，在系列里的顺序（小的在前），如 `1`、`2` |
| `section` | | 小节标签，如 `"思维锦囊1"`、`"小试牛刀2"`，显示在卡片上和讲解页标题前 |
| `scene` | ✅ | 3D 场景：`objects`（里面有什么）和可选的 `camera`（开始时相机在哪） |
| `steps` | ✅ | 讲解步骤列表，至少 1 步 |

> 字段名写错（比如把 `narration` 写成 `narraton`）会被直接指出来：“不认识的字段：narraton”。

---

## 场景里的东西

`scene.objects` 是一个列表，每个东西都要有唯一的 `id`（后面的动作靠 `id` 找到它，这个 id 叫 `target`）和 `type`。

### 1. CubeGrid —— 方方正正的大方块（涂色题用）

```json
{ "id": "cube", "type": "CubeGrid", "size": [3, 3, 3], "paint": "surface" }
```

| 字段 | 说明 |
|---|---|
| `size` | `[长, 高, 宽]`，每个数是 1～20 的整数（也就是 x、y、z 方向各有几块） |
| `paint` | `"surface"`：外表面涂红色（切开后每个小方块只有原来在外面的那几个面是红的）；`"none"`：不涂色（**不写就是 `none`**） |
| `visible` | 一开始是否显示，`true` / `false`，默认显示 |
| `position` | 整体位置 `[x, y, z]`，默认 `[0, 0, 0]`（一般不用管） |

### 2. CubeStack —— 积木堆（数积木、三视图用）

```json
{ "id": "blocks", "type": "CubeStack", "heights": [[1, 2, 0], [1, 3, 1], [0, 2, 0]] }
```

`heights` 是**从上往下俯视**看到的“高度图”：每个数字是这个位置叠了几块。

- 一行一行写，**每一行的个数要一样多**；0 表示这个位置没有积木。
- **第一行在最后面，最后一行在最前面（离你最近）**；每行里从左到右就是从左到右。
- 上面的例子长这样（从上往下看）：

```
后   1 2 0
     1 3 1      总数 = 1+2+0+1+3+1+0+2+0 = 10 块
前   0 2 0
```

积木不涂色，全部是米白色，靠描边、`highlight`、`fade`、`number` 来讲解。

### 3. Label —— 悬在空中的文字标注

```json
{ "id": "tip", "type": "Label", "text": "从正面看", "position": [0, -2.4, 2.5], "visible": false }
```

`position` 必填。用 `show` / `hide` 显示隐藏，用 `setText` 改文字，用 `move` 移动。

> 坐标约定：`x` 向右、`y` 向上、`z` 朝向你（屏幕外）。一个小方块的边长是 1，大方块的中心在 `[0, 0, 0]`。

### 4. Bench、5. Arrow —— 盈亏问题用的“板凳模型”

老师板书里的 `① 3 3 … 3 多16颗` 这样的一行就是一个 **Bench**；标注“差 16+10”的细箭头是 **Arrow**。它们有自己的一套动作，写法见下面的[板凳模型](#板凳模型盈亏问题bench-与-arrow)一章。

---

## 每一步怎么写

```json
{
  "title": "把大正方体切开",
  "narration": "沿着线切成 **27** 块。",
  "formula": "3 \\times 3 \\times 3 = 27",
  "camera": { "position": [7, 5, 9] },
  "autoRotate": false,
  "actions": [ { "do": "explode", "target": "cube", "gap": 0.5 } ]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `title` | ✅ | 这一步的标题 |
| `type` | | `"normal"`（默认，可不写）/ `"quiz"` 选择题 / `"explore"` 探索题 |
| `narration` | | 讲解文字（写法见下文） |
| `formula` | | 公式（KaTeX 写法，见下文） |
| `image` | | 配图，放进 `public/` 文件夹，这里写相对路径，如 `"img/fig1.png"` |
| `camera` | | 这一步相机的位置，会平滑飞过去。**不写就保持上一次的位置** |
| `autoRotate` | | `true` = 这一步里相机缓慢自转（用户一拖动就暂停） |
| `actions` | | 这一步要做的动作列表，按顺序执行 |

---

## 动作 action 一览

每个动作都是 `{ "do": "动作名", "target": "对象id", ... }`。

| 动作 | 用于 | 额外参数 | 效果 |
|---|---|---|---|
| `show` / `hide` | 任何对象 | 无 | 显示 / 隐藏整个对象 |
| `explode` | CubeGrid、CubeStack | `gap`（间距，默认 `0.4`，`0` = 合拢） | 小方块之间拉开距离 |
| `highlight` | CubeGrid、CubeStack | `filter`（可选）、`color`（可选，默认黄） | 把选中的小方块整块染成指定颜色 |
| `fade` | CubeGrid、CubeStack | `opacity`（0～1，必填）、`filter`（可选） | 让选中的小方块变透明；`0` = 完全隐藏 |
| `number` | CubeGrid、CubeStack | `filter`（可选） | 给选中的小方块依次标上 1、2、3……（按从下到上、从后到前、从左到右的顺序），一个个弹出来 |
| `clear` | CubeGrid、CubeStack、Bench、Arrow | 无 | 方块：清掉所有 `highlight` / `fade` / `number`（**不影响** `explode` 和大小）；Bench：清掉所有 `mark`（不动大括号和竖线）；Arrow：没有可清的，写了也不出错 |
| `reset` | 任何对象 | 无 | 把这个对象恢复成最初的样子（位置、间距、显隐、文字、所有效果；Bench 的内容、标记、大括号、行尾多少都还原） |
| `setText` | Label、Arrow | `text` | 修改标注文字 |
| `move` | 任何对象 | `position`：`[x, y, z]` | 把整个对象移到新位置（Arrow：移的是起点，终点跟着平移） |

**只有 Bench 能用的动作**：`fill`、`setSlots`、`mark`、`unmark`、`remainder`、`transfer`、`brace`、`divider`、`clearNotes`，见[板凳模型](#板凳模型盈亏问题bench-与-arrow)。`highlight` / `fade` / `number` / `explode` 只能用于 CubeGrid / CubeStack，对 Bench 写了会报错并提示改用 `mark`。

**叠加规则（很有用）：**

- 同一个小方块被多个动作选中时，**后面的动作覆盖前面的**。所以“先把全部变淡，再把某一类变回不透明”就能做出“只突出这一块”：

```json
{ "do": "fade", "target": "cube", "opacity": 0.08 },
{ "do": "fade", "target": "cube", "filter": { "paintedFaces": 0 }, "opacity": 1 },
{ "do": "highlight", "target": "cube", "filter": { "paintedFaces": 0 } }
```

- `number` 每次只给“这次选中的”小方块编号；想重新从 1 数起，先 `clear`。
- 一般每一步先写一个 `clear`，再写这一步要突出的内容，画面最干净。
- 动作写在“哪个对象”上，就看 `target`；`target` 必须是 `scene.objects` 里已有的 `id`，而且动作要适合这种对象（比如不能对 Label 做 `highlight`）。

---

## filter：挑出你想要的那些小方块

`highlight` / `fade` / `number` 都可以加一个 `filter`。**不写 `filter` = 全部小方块。**

```json
"filter": { "paintedFaces": 3 }
"filter": { "paintedFaces": [1, 2] }
"filter": { "layer": 0 }
"filter": { "region": "edge", "x": 0 }
```

规则：

- 一个 filter 里写了几项，要**同时满足**（并且）。
- 某一项的值如果写成列表 `[1, 2]`，表示“**是其中任意一个**”（或者）。

每个小方块都有这些“属性”，可以拿来筛选：

| 属性 | 含义 | 适用 |
|---|---|---|
| `x`、`y`、`z` | 位置编号，从 0 开始（`y` 向上）。CubeStack 里 `x` = 第几列，`z` = 第几行 | 两种 |
| `layer` | 第几层，从 0（最下面）开始，等于 `y` | 两种 |
| `paintedFaces` | 涂了颜色的面数。CubeGrid：涂色的面数（`paint` 为 `none` 时全是 0）；CubeStack：露在外面的面数（**贴着地面的底面不算**） | 两种 |
| `exposedFaces` | 露在外面的面数（CubeGrid 看位置、与是否涂色无关）。CubeStack 里与 `paintedFaces` 相同 | 两种 |
| `region` | 位置类型：`"corner"` 角（3 面）、`"edge"` 棱（2 面）、`"face"` 面中央（1 面）、`"inner"` 内部（0 面）。按**露在外面的面数**判断，不管有没有涂色 | **只有 CubeGrid** |

举例：

| 想选 | 写法 |
|---|---|
| 三面涂色的 | `{ "paintedFaces": 3 }` |
| 一面或两面涂色的 | `{ "paintedFaces": [1, 2] }` |
| 最下面一层 | `{ "layer": 0 }` |
| 第 1 层和第 2 层 | `{ "layer": [1, 2] }` |
| 最左边那一列的“棱” | `{ "region": "edge", "x": 0 }` |
| 正中心那一块（3×3×3） | `{ "paintedFaces": 0 }` 或 `{ "region": "inner" }` |

---

## 板凳模型（盈亏问题）：Bench 与 Arrow

### 一眼看懂

盈亏问题的老师板书是这样的：

```
①  3  3  …  3     多16颗
②  5  5  …  5     少10颗
```

每一行就是一个 **Bench**（板凳模型）：行首是标签 `①`；中间是若干“份”（slot，一个小朋友 / 一张桌子 / 一个瓶子），每份下面有个“板凳”、上面装着东西，每份上方的数字 `3`、`5` 就是板书里那些数；行尾是“多 16 颗”“少 10 颗”。份数可以很大（比如 100），用 `show` 只画头尾几份，中间自动画“…”。

这套东西由 **2 种对象 + 9 个专用动作** 组成：

| 对象 | 作用 |
|---|---|
| `Bench` | 一行“份” |
| `Arrow` | 细箭头 + 文字（“差 16+10”“每份差 2”） |

| 动作 | 一句话 |
|---|---|
| `fill` | 改变某几份里装的东西 |
| `setSlots` | 改变份数（并可同时改显示区间） |
| `mark` / `unmark` | 给某几份加 / 去掉标记：高亮、画红叉、变虚影、变淡 |
| `remainder` | 设置 / 清除行尾的“多”“少” |
| `transfer` | 把东西从一些份“飞”到另一些份（“10 人船各挺 1 人给 8 人船”） |
| `brace` | 在一段份的下方 / 上方画大括号 + 文字 |
| `divider` | 在第 k 份之后画竖直虚线（“准时到校”线） |
| `clearNotes` | 清掉这一行的大括号和竖线 |

> 通用动作 `show` / `hide` / `move` / `reset` / `clear` 对 Bench、Arrow 也能用（见[动作 action 一览](#动作-action-一览)）。`highlight` / `fade` / `number` / `explode` **不能**用于 Bench（用 `mark` 代替）。

### 最小 Bench 模板

复制下面整段，另存为 `content/problems/my-bench.json`。这是一道 3 步的小题：先摆 ① 行，再摆 ② 行，最后用大括号标出人数。

```json
{
  "id": "my-bench",
  "title": "我的第一道板凳题",
  "series": "我的系列",
  "order": 1,
  "section": "小试牛刀1",
  "grade": [3],
  "tags": ["盈亏问题"],
  "problem": "把一些苹果分给小朋友。①每人分 2 个，多 3 个；②每人分 3 个，少 2 个。一共有几个小朋友？",
  "answer": "5 个小朋友。",
  "scene": {
    "objects": [
      {
        "id": "r1", "type": "Bench", "position": [0, 0, 0], "label": "①",
        "slots": 5, "container": "person", "caption": "人",
        "fill": [{ "kind": "token", "shape": "ball", "count": 2 }],
        "remainder": { "type": "extra", "text": "多3个", "items": [{ "kind": "token", "shape": "ball", "count": 3 }] }
      },
      {
        "id": "r2", "type": "Bench", "position": [0, -1.9, 0], "label": "②",
        "slots": 5, "container": "person", "caption": "人", "visible": false,
        "fill": [{ "kind": "token", "shape": "ball", "count": 3 }],
        "remainder": { "type": "short", "text": "少2个", "items": [{ "kind": "token", "shape": "ball", "count": 2 }] }
      }
    ],
    "camera": { "position": [0.3, 2.4, 12], "target": [0.3, 0, 0] }
  },
  "steps": [
    {
      "title": "① 每人分 2 个，多 3 个",
      "narration": "第一种分法：每人 2 个，分完还多出 **3 个**。"
    },
    {
      "title": "② 每人分 3 个，少 2 个",
      "narration": "第二种分法：每人 3 个，还差 **2 个**（虚线画出来的是缺的）。",
      "actions": [
        { "do": "move", "target": "r1", "position": [0, 1.9, 0] },
        { "do": "show", "target": "r2" }
      ]
    },
    {
      "title": "人数是 5 人",
      "narration": "(3+2)÷(3−2)=5，一共 **5 个**小朋友。",
      "formula": "(3+2)\\div(3-2)=5",
      "actions": [{ "do": "brace", "target": "r2", "slots": [1, 5], "text": "5 人" }]
    }
  ]
}
```

三个要点：

1. 一行 = 一个 `Bench` 对象。`slots` 是份数，`fill` 是**每一份默认装什么**，`remainder` 是行尾的“多 / 少”。
2. 第 2 行一开始 `"visible": false`，到该出现的步骤再 `show`（和方块一样）。
3. 第 1 行一开始放在画面正中（`y` 是 0），第 2 行出场的那一步用 `move` 把它挪到上面（`y` = 1.9），第 2 行放在 `y` = −1.9。这样第一屏是居中的单行，两行都出现后也是上下对称，镜头不用动；两行的 `position` 只差 `y`，份就会上下对齐。

### Bench 的字段

```json
{
  "id": "r1", "type": "Bench",
  "position": [0, 1.9, 0],
  "label": "①",
  "slots": 13,
  "show": [[1, 3], [12, 13]],
  "compactShow": [[1, 1], [13, 13]],
  "container": "person",
  "caption": "人",
  "fill": [{ "kind": "token", "shape": "ball", "count": 3 }],
  "countLabel": true,
  "remainder": { "type": "extra", "text": "多16颗", "items": [{ "kind": "token", "shape": "ball", "count": 16 }] },
  "visible": true
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id`、`type` | ✅ | `type` 写 `"Bench"` |
| `slots` | ✅ | 份数，1～1000 的整数。可以很大（100 份也行），但“同时显示”的不能超过 24 份，所以份数多时必须写 `show` |
| `position` | | 这一行的位置 `[x, y, z]`，默认 `[0, 0, 0]`。**指的是“份”这一段的中心**；行首标签在它的左边、行尾多少在右边（这样几行的份才能上下对齐，不会因为某行多了“多16颗”而整体左移） |
| `label` | | 行首标签，如 `"①"`。不写就没有 |
| `show` | | 只显示这些区间，如 `[[1, 3], [12, 13]]`（下标从 1 起、包含两端）。不连续的地方自动画“…”。**不写 = 全部显示**。详见下文 |
| `compactShow` | | **手机竖屏（画布宽度 < 600px）时用它代替 `show`**：显示更少的份，文字才能大一点。格式和 `show` 一样；桌面永远只用 `show`；不写 = 手机上也用 `show`。详见下文“窄屏 compactShow” |
| `container` | | 每份下面的“容器”，默认 `"seat"`：`"seat"` 板凳、`"plate"` 盘子、`"person"` 简洁小人（东西放在他身前，适合“分给小朋友”）、`"box"` 小箱子（里面的球会抬到箱壁上沿，免得被前壁挡住）、`"none"` 什么都不画（`cross` 的红叉相应缩小，不会伸进上方的数字标签） |
| `caption` | | 每份下方的小字，如 `"人"`、`"瓶"`、`"桌"`、`"分钟"` |
| `fill` | | **每一份默认装的东西**（Segment 列表，从下往上堆），见下一节。不写 = 空的份 |
| `countLabel` | | 默认 `true`：每份上方显示数字（对应板书里的 `3 3 … 3`）。写 `false` 则不显示。**方块（block）上已经写了字（“玻”“酸”“5角”）时请写 `false`**，否则上方会自动再显示一遍同样的字 |
| `remainder` | | 行尾的“多 / 少”，见下文。不写或 `null` = 没有 |
| `visible` | | 一开始是否显示，默认显示 |

### 份里装的东西：Segment（段）

一份里的东西 = 若干“段”从下往上叠。段有两种：

**① token —— 一堆同样的小物件**（球、小人……，整齐堆放）：

```json
{ "kind": "token", "shape": "ball", "count": 3, "color": "orange", "name": "桃" }
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `shape` | ✅ | `"ball"` 球（野果、苹果）、`"disc"` 圆片（硬币）、`"cube"` 小方块、`"person"` 小人、`"cup"` 杯子、`"flower"` 花 |
| `count` | ✅ | 个数，一份里同一段最多 **12** 个（这一行装不下更多；数很大时改用 block）。每层最多 3 个，往上叠 |
| `color` | | 颜色名或 `#rrggbb`。不写就用这种形状的默认色（同一份里第二个同形状的段会自动换色） |
| `name` | | 物件的名字，如 `"桃"`。只用来拼数字标签（“5桃3瓜”），不显示在物件上 |

**② block —— 一个带文字的方块**（钱数、米数、未知量，如“28元”“玻”“+10”）：

```json
{ "kind": "block", "text": "28元", "height": 1, "color": "#cfe3ff" }
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `text` | ✅ | 方块上的字，要短（≤5 个字） |
| `height` | | 高度倍数，0.3～4，默认 1。用来表示“更多”：比如 `"+10"` 写 `0.6` 比较矮 |
| `color` | | 颜色 |

每份最多共 **24** 个东西（token + block 加起来）。

### 每份上方的数字（countLabel）怎么来的

自动规则（改了份里的东西，数字会跟着变）：

| 这份里有 | 显示 |
|---|---|
| 只有一个 token 段，如 3 个球 | `3` |
| 只有一个 block `"28元"` | `28元` |
| 多个段：5 个“桃” + 3 个“瓜” | `5桃3瓜`（每段“个数+name”拼起来） |
| 多个段：block `"玻"` + block `"+10"` | `玻+10`（block 的 text 拼起来） |
| 多个没写 name 的 token 段：3 个 + 2 个 | `3+2`（两个数字相连时中间自动补 `+`） |
| 空份 | （不显示） |

不想用自动的，就在 `fill` 动作里写 `"countText": "5"` 覆盖（例如一份里摆了 3 个 + 2 个两种颜色的球，但想显示 `5`）。数字太长时字号会自动变小。

**别让上方的字和方块上的字重复。** 方块上写“玻”，自动标签也是“玻”，画面上就出现两个“玻”。办法：整行 `"countLabel": false`；或者只在需要的步骤里用 `countText` 换成**另一个有信息的字**，如 `"countText": "保"`（方块叠着“玻”和“+10”，上方写“保”，表达“保温杯 = 玻 + 10”）；想只清掉某一步的标签，写 `"countText": ""`（空串 = 不显示）。注意 `reset` 会把标签恢复成定义里的样子，需要的话 `reset` 之后再写一次 `countText`。

### 行尾“多 / 少”：remainder

```json
{ "type": "extra", "text": "多16颗", "items": [{ "kind": "token", "shape": "ball", "count": 16 }] }
{ "type": "short", "text": "少5×2=10颗", "items": [{ "kind": "token", "shape": "ball", "count": 10 }] }
```

- `type`：`"extra"`（多）在行尾用**实体**堆出 `items`，文字**绿色**；`"short"`（少）用**虚影**（半透明 + 红色虚线描边）显示 `items`，文字**红色**。
- `text`：显示在堆的上方。必填。
- `items`：可选（Segment 列表，写法和 `fill` 一样）；不写就只显示文字。**这里的 token 可以到 40 个**（排成紧凑的小方阵，16 个 = 4×4）。
- `was`：可选，**老师划掉的旧文字**。写了以后，新文字正上方会出现旧文字：**灰色 + 红色删除线**（淡入出现），表现“把‘多6人’划掉，改成‘少 8×3−6=18 人’”。
  ```json
  { "do": "remainder", "target": "r2", "value": { "type": "short", "text": "少8×3−6=18人", "was": "多6人", "items": [{ "kind": "block", "text": "18人" }] } }
  ```
  `was` 属于这一次 `remainder`：之后的步骤**不会自动消失**（`remainder` 没再写时一直留着）；想撤掉，就再发一次不带 `was` 的 `remainder`（同样的 `type` / `text` / `items`，球沿用，不会闪）。旧文字在新文字正上方，和同一位置的 Arrow 文字可能互相压住，所以 Arrow 出现的那一步前后最好把它撤掉。旧文字不要太长（和新文字一样会把行尾往右让）。
- 也可以不在定义里写，而在某一步用 `remainder` 动作“变”出来。

### 显示区间 show 与“…”

`slots` 有 13 份，但只想画头 3 份和尾 2 份：`"show": [[1, 3], [12, 13]]`，画面是：

```
①  3  3  3  ···  3  3    多16颗        （共 6 个位置：第1、2、3 份、省略号、第12、13 份）
```

- 区间写法：`[起点, 终点]`，**从 1 起、包含两端**，起点不能大于终点，终点不能超过 `slots`。
- 区间不连续的地方自动显示“…”（占一个份的位置）；区间重叠 / 相连会自动合并；第一个区间不从 1 开始，或最后一个不到 `slots`，头尾不加“…”。
- 被省略的份“还在”：`fill` / `mark` / `transfer` 照样可以操作它们，只是看不见。
- 同时显示的份最多 **24** 个（超过会报错并提示你加 `show`）。
- `setSlots` / `show` 改变后，整行会平滑地伸缩。

### 窄屏 compactShow（手机竖屏专用的显示区间）

手机竖屏上画面只有 390px 宽，一行显示 9～12 个位置时文字会被缩得很小。给 `Bench` 加 `compactShow`（格式和 `show` 完全一样），**画布宽度 < 600px 时程序用它代替 `show`**，显示更少的份，文字就能大一点（目标是 ≥ 0.7 倍）；桌面不受影响。

```json
{ "id": "r1", "type": "Bench", "slots": 21, "show": [[1, 2], [16, 21]], "compactShow": [[1, 1], [21, 21]] }
```

- **优先级**：窄屏时 `compactShow`（写了）> `show`；桌面永远是 `show`。没写 `compactShow` = 手机上也用 `show`（和以前一样）。`compactShow` 写 `[[1, 总份数]]`（覆盖全部）= 手机上全部显示。
- **`setSlots` 也接受 `compactShow`**：`setSlots` 总是**整体改写**显示区间——不写 `compactShow` 就是“手机上也用这次的 `show`”，**不会沿用旧的 `compactShow`**（份数变了，旧区间可能对不上）。所以用过 `compactShow` 的 Bench，每次 `setSlots` 都要连 `compactShow` 一起写。
- **两行要上下对齐时**：对齐靠的是“两行显示的位置数之差”（见上一节：位置少的那行 `position.x` 往右挪 差×1.3÷2）。`position` 手机和桌面是同一个，所以 **`compactShow` 里两行的位置数之差要和 `show` 里的一样**，而且前面相同的份要对得上。例子（东东上学）：`show` 是 `[[1,2],[16,21]]`（9 个位置）和 `[[1,2],[16,24]]`（12 个位置，差 3），`compactShow` 就写 `[[1,1],[20,21]]`（4 个）和 `[[1,1],[20,24]]`（7 个，仍差 3），“准时到校”线（第 21 份）两行仍然上下对齐，第 20、21 份（“提前 6 分钟”那一段）手机上也看得见。
- **`brace` / `mark` / `divider`**：它们按份号写，被省略号藏起来的份照样存在（`fill` / `transfer` 仍可操作），只是画不出来。为了不让标注在某种屏幕上凭空消失，这三个动作都会检查**桌面（`show`）和窄屏（`compactShow`）下各至少有一份能看到**，不满足就报错：
  - `brace`：`slots` 这几份里至少有一份可见；区间跨过“…”时按可见部分的首尾画。
  - `mark`：`slots` 这几份里至少有一份可见（想让手机上也看到的标记——红叉、高亮——要留一份在 `compactShow` 里）。
  - `divider`：第 `after` 份和第 `after+1` 份至少有一份可见（两边都藏起来时竖线会画在“…”正中间，所以直接报错）。
  - `setSlots` 改 `show` / `compactShow` 时，已经画上去、份号还在范围内的大括号 / 竖线也要继续满足上面的规则，否则报错——先 `clearNotes`，或者调整显示区间。
- **竖线文字和上方大括号文字水平重叠时**，竖线会自动抬高到大括号文字之上（窄屏份挤在一起时最容易遇到）。
- **Arrow 怎么办**：箭头是独立的对象，位置是写死的，份的位置因为 `compactShow` 变了，箭头就会指错地方。给箭头写 `compactOffset`（见 Arrow 一节）：窄屏时整个箭头平移这个量。
- 同时显示的份仍然最多 24 个（`compactShow` 同样检查）；越界会报 `compactShow[i]`。
- 怎么判断“该不该加”：在手机尺寸（390×844）下看，文字缩放系数低于 0.7、字糊成一团的题才需要；份少的题不用加。

### 摆放：位置、间距、相机

- 份沿 **+x** 方向等距排开，相邻两份相距 **1.3**（“…”也占 1.3）。以显示出来的 N 个位置为例，份区域总宽≈ 1.3×N。
- **两行上下摆**（① 在上、② 在下）：`container` 是 `"person"` 时一行约 2.6 高，`position` 的 `y` 用 **1.9 和 −1.9**（中间留出放 Arrow 的位置）；其它容器较矮，用 **1.5 和 −1.5** 即可。三行就把间距调成 3.2 左右。
- **相机**：每行最多 6 个位置（含“…”）+ 行首标签 + 行尾多少时，用 `"camera": { "position": [0.3, 2.4, 12], "target": [0.3, 0, 0] }`。**起始相机按“第一屏的画面”来定**（所以第一屏的那一行要能完整放进去）；之后行变长、出现行尾多少、出现第二行时相机会**自动拉远**，不用每步都改 `camera`。因为目标点固定在 `y=0`，两行最好上下对称（`y` 取 ±1.9），第一屏的单行先放在 `y=0`，第二行出场时再 `move` 上去（见最小模板）。
- 图里的文字（数字、多少、大括号文字……）都会显示在对应物体上方 / 下方，记得给它们留位置：大括号 `below` 在份的下面，占约 0.8 高；大括号 `above` 在数字的上面。

### Bench 的动作

份的下标一律**从 1 起、闭区间**。越界、起点大于终点、`transfer` 两边份数对不上、token 不够拿等，都会在页面上报“文件 / 第几步 / 字段 / 原因”。

| 动作 | 参数 | 效果 |
|---|---|---|
| `fill` | `slots`（可选：`"all"` 或 `[起, 终]`，不写 = 全部）、`segments`（Segment 列表，写 `[]` = 清空）、`countText`（可选） | 把这几份里的东西改成 `segments`。多出来的物件缩放淡入、少掉的淡出；形状相同的物件会“原地”改颜色，不会全部重来。`countText` 覆盖这几份的数字。**`slots` 不写或 `"all"` 时，还会把“默认装什么”改成它**（`setSlots` 新增的份就装这个） |
| `setSlots` | `slots`（新的份数）、`show`（可选）、`compactShow`（可选） | 改变份数：新增的份按“默认装什么”淡入，减少的从末尾淡出。指向被删掉的份的大括号 / 竖线一并去掉。**`show` 不写 = 全部显示**（不会沿用上一次的 `show`，所以份数多时要再写一次）；**`compactShow` 不写 = 手机上也用这次的 `show`**（同样不沿用旧的，见“窄屏 compactShow”） |
| `mark` | `slots`（`[起, 终]`）、`style`、`color`（可选）、`tint`（可选，仅 `highlight`） | 给这几份加标记。`style`：`"highlight"` 容器和物件变高亮色（默认黄）、`"cross"` 画红色 ×（坏桌子、划掉）、`"ghost"` 物件变虚影（“空瓶”“少的”）、`"dim"` 整份变淡。不同 style 可以叠加在同一份上。**`tint`**（只配 `highlight`）：`"all"`（默认）容器和里面的东西都染成高亮色；`"container"` **只给容器（盘 / 箱 / 座 / 小人）上色，里面的东西保持原色**——讲解要强调“这几盘里只有瓜”“这几份里只有红球”时用它，否则瓜和红球也被染黄，看不出是什么。`container` 是 `"none"` 的 Bench 没有容器可染，写 `tint: "container"` 会报错 |
| `unmark` | `slots`（可选） | 去掉这几份的所有标记；不写 `slots` = 全部。（通用的 `clear` 也能清全部 mark） |
| `remainder` | `value`（可含 `was`） | 设置行尾“多 / 少”（写法见上）；`"value": null` = 清除。已有 remainder 时会沿用其中的球（多 16 颗变少 10 颗是原地变虚影）。`value.was` = 划掉的旧文字，见“行尾多 / 少：remainder” |
| `transfer` | `from`、`to`（两个区间，**长度要一样、不能重叠**）、`count`、`segment`（可选，默认 `0`） | 从 `from` 的每一份拿 `count` 个 token（第 `segment` 段最上面的），按顺序一一对应放到 `to` 的份里。物件**会飞过去**。`segment` 是段的下标（从 0 起）；目标份里有同类的段就并进去，否则新开一段。只能搬 token，不能搬 block |
| `brace` | `slots`（`[起, 终]`）、`text`、`side`（可选，`"above"` / `"below"`，默认 `"below"`） | 在这段份的下方 / 上方画大括号和文字（如 `"24个"`）。区间跨过“…”时，按**可见部分**的首尾画；区间里一份都看不见就会报错 |
| `divider` | `after`（整数，1～份数）、`text`（可选） | 在第 `after` 份之后画竖直虚线，`text` 写在线上方（“准时到校”线）。同一个 `after` 再写一次 = 替换 |
| `clearNotes` | 无 | 清除这一行的所有 `brace` 和 `divider`（不动 `mark`）。**竖线也会被清掉**：两行对着看的题（如“准时到校”线），清完要在这一行重新写一次 `divider`，否则两行只剩一条线 |

每个动作都要有 `"target"`（一个 Bench 的 `id`），例如 `{ "do": "mark", "target": "r1", "slots": [1, 2], "style": "dim" }`。

**常用配方**

```jsonc
// 每人差 5-3=2 颗：把每份的 5 个球变成“3 个原色 + 2 个蓝色”，数字仍显示 5（球是原地变色的）
{ "do": "fill", "target": "r2", "slots": [1, 11], "countText": "5",
  "segments": [{ "kind": "token", "shape": "ball", "count": 3 }, { "kind": "token", "shape": "ball", "count": 2, "color": "blue" }] }

// 最后两个小朋友分不到：把他们清空，再高亮
{ "do": "fill", "target": "r2", "slots": [12, 13], "segments": [] },
{ "do": "mark", "target": "r2", "slots": [12, 13], "style": "highlight", "color": "yellow" }

// 只给盘 / 箱子上色，里面的瓜 / 红球保持原色（“这几盘里只有瓜”）
{ "do": "mark", "target": "p2", "slots": [13, 16], "style": "highlight", "color": "yellow", "tint": "container" }

// 老师把“多12瓜”划掉，改成“少7×4=28桃”
{ "do": "remainder", "target": "p2", "value": { "type": "short", "text": "少7×4=28桃", "was": "多12瓜", "items": [{ "kind": "block", "text": "28桃" }] } }

// 3 张桌子坏了：画红叉
{ "do": "mark", "target": "r", "slots": [18, 20], "style": "cross" }

// “空瓶 / 少的”：这 3 份里的东西变虚影（红色虚线描边）
{ "do": "mark", "target": "r", "slots": [18, 20], "style": "ghost" }

// “4 包牛板筋 + 2 袋酱牛肉” 变成一块“28 元”（表面 → 本质）
{ "do": "fill", "target": "r1", "segments": [{ "kind": "block", "text": "28元" }] }

// 划船：10 人船（第 1～4 份）各挺 1 人到 8 人船（第 5～8 份）—— token 飞过去，全变 9 人
{ "do": "transfer", "target": "boats", "from": [1, 4], "to": [5, 8], "count": 1 }

// 行程题“准时到校”线：第 21 分钟之后画竖线
{ "do": "divider", "target": "run", "after": 21, "text": "准时到校" }

// “共 13 人”：大括号从第 1 份到第 13 份（中间被省略也没关系）
{ "do": "brace", "target": "r2", "slots": [1, 13], "text": "13 人" }
```

### Arrow：细箭头 + 文字

```json
{ "id": "a1", "type": "Arrow", "from": [-3.25, 1.2, 0.6], "to": [-3.25, -0.1, 0.6], "text": "每人差 5−3=2", "color": "red", "visible": false }
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `from`、`to` | ✅ | 起点、终点（箭头指向 `to`），不能是同一个点 |
| `text` | | 箭头旁边的文字（默认：竖着的箭头文字在侧面，横着的在上方）。文字框的边缘贴着箭身，文字再长也不会压在箭身上 |
| `textAt` | | 文字沿箭身的位置：`"start"`（靠起点）/ `"mid"`（中间，默认）/ `"end"`（靠箭头）。同一处有大括号、行尾数字时，用它把文字挪开 |
| `textSide` | | 文字在箭身哪一侧：`"auto"`（默认：竖箭放侧面——箭在画面右半边放左侧、否则放右侧；横箭放上方）/ `"left"` / `"right"` / `"above"` / `"below"` |
| `color` | | 颜色，默认红色（像老师的红笔标注） |
| `compactOffset` | | `[dx, dy, dz]`：**手机竖屏（Bench 用 `compactShow` 的那种窄屏）时，整个箭头（起点和终点）平移这个量**；桌面不动，不写 = 不动。Bench 用了 `compactShow` 后份的位置变了，箭头要跟着挪：例如桌面上箭头在第 1 份左边 0.65 处，桌面有 8 个位置、窄屏有 3 个位置，份区域两端各向内缩 (8−3)/2×1.3 = 3.25，所以左边的箭头写 `[3.25, 0, 0]`、右边的写 `[-3.25, 0, 0]`。窄屏时 `textSide: "auto"` 按挪动后的位置重新判断左右；想让桌面和手机文字在同一侧，就显式写 `textSide`。两条箭头的文字在手机上不要互相压住（文字宽度约 15px×字数×0.7） |
| `visible` | | 一开始是否显示，默认显示。常写 `false`，到该出现的步骤再 `show` |

含 Bench / Arrow 的场景由程序**自动取景**：相机距离和目标点按当前可见内容（份、行尾多少、大括号、箭头文字）算，保证不裁切，手机竖屏也一样；`camera.position` 只决定“从哪个方向看”（俯仰角会被限制在 3° 以内，让上下两行的份对得齐），所以不用再手算距离。含方块的场景不受影响。

手机竖屏上，如果一行里的份太多、每份上方的字（数字标签、方块上的字）比相邻两份的间距还宽，程序会把 3D 文字再缩小一些（最小到原大小的一半）免得互相压住；所以写题时**一行显示的位置尽量少于 12 个**（用 `show` 省略中间），每份上方的字也尽量短。仍然太挤（手机上缩放系数低于 0.7）的题，用 `compactShow` 给手机单独写一个更短的显示区间（见“窄屏 compactShow”）。两行要上下对齐时，让两行**显示出来的位置数相同**，或者把位置数少的那一行的 `position.x` 往右挪（差几个位置就挪 差×1.3÷2）。“准时到校”竖线紧挨行尾时，它的文字会自动抬高一截，不会压住行尾的“多 / 少”。

Arrow 可用的动作：`show` / `hide` / `move`（移起点，终点跟着平移）/ `reset` / `setText`（改文字）/ `clear`（空操作）。
竖着的箭头要避开份里的数字和大括号：在两行之间，起点稍微低于上一行的“人”字，终点稍微高于下一行的数字。

### 全部动作示例

下面这道“题”把所有 Bench / Arrow 动作各用了一遍，可以当速查表对照（也会被自动测试校验，保证写法没过期）：

```json
{
  "id": "bench-all-actions",
  "title": "Bench 全部动作示例",
  "problem": "演示每个动作怎么写。",
  "scene": {
    "objects": [
      { "id": "r", "type": "Bench", "position": [0, 0, 0], "label": "①", "slots": 13, "show": [[1, 3], [12, 13]], "compactShow": [[1, 1], [13, 13]], "container": "person", "caption": "人", "fill": [{ "kind": "token", "shape": "ball", "count": 3 }] },
      { "id": "boat", "type": "Bench", "position": [0, -2.2, 0], "label": "船", "slots": 4, "container": "seat", "fill": [{ "kind": "token", "shape": "person", "count": 3 }], "visible": false },
      { "id": "a", "type": "Arrow", "from": [-3.25, 1.2, 0.6], "to": [-3.25, -0.1, 0.6], "text": "每人差 2", "color": "red", "compactOffset": [1.3, 0, 0], "visible": false }
    ],
    "camera": { "position": [0.3, 2.4, 12], "target": [0.3, 0, 0] }
  },
  "steps": [
    {
      "title": "fill：改变一份或几份的内容",
      "actions": [
        { "do": "fill", "target": "r", "slots": "all", "segments": [{ "kind": "token", "shape": "ball", "count": 5 }] },
        { "do": "fill", "target": "r", "slots": [12, 13], "segments": [] },
        { "do": "fill", "target": "r", "slots": [1, 3], "segments": [{ "kind": "token", "shape": "ball", "count": 3 }, { "kind": "token", "shape": "ball", "count": 2, "color": "blue" }], "countText": "5" }
      ]
    },
    {
      "title": "setSlots：改变份数（并改显示区间）",
      "actions": [{ "do": "setSlots", "target": "r", "slots": 20, "show": [[1, 3], [19, 20]], "compactShow": [[1, 3], [20, 20]] }]
    },
    {
      "title": "mark：四种标记",
      "actions": [
        { "do": "mark", "target": "r", "slots": [19, 20], "style": "highlight", "color": "yellow" },
        { "do": "mark", "target": "r", "slots": [1, 1], "style": "cross" },
        { "do": "mark", "target": "r", "slots": [2, 2], "style": "ghost" },
        { "do": "mark", "target": "r", "slots": [3, 3], "style": "dim" },
        { "do": "mark", "target": "r", "slots": [20, 20], "style": "highlight", "tint": "container" }
      ]
    },
    {
      "title": "unmark：去掉标记",
      "actions": [{ "do": "unmark", "target": "r", "slots": [1, 1] }, { "do": "unmark", "target": "r" }]
    },
    {
      "title": "remainder：多",
      "actions": [{ "do": "remainder", "target": "r", "value": { "type": "extra", "text": "多16颗", "items": [{ "kind": "token", "shape": "ball", "count": 16 }] } }]
    },
    {
      "title": "remainder：少（虚影）",
      "actions": [{ "do": "remainder", "target": "r", "value": { "type": "short", "text": "少10颗", "items": [{ "kind": "token", "shape": "ball", "count": 10 }] } }]
    },
    {
      "title": "remainder：划掉旧文字再改写（was）",
      "actions": [{ "do": "remainder", "target": "r", "value": { "type": "short", "text": "少8×3−6=18人", "was": "多6人" } }]
    },
    {
      "title": "remainder：清除",
      "actions": [{ "do": "remainder", "target": "r", "value": null }]
    },
    {
      "title": "transfer：每条船挺 1 人到右边的船",
      "actions": [
        { "do": "show", "target": "boat" },
        { "do": "transfer", "target": "boat", "from": [1, 2], "to": [3, 4], "count": 1 }
      ]
    },
    {
      "title": "brace / divider",
      "actions": [
        { "do": "brace", "target": "r", "slots": [1, 20], "text": "20 人" },
        { "do": "brace", "target": "r", "slots": [1, 3], "text": "上面", "side": "above" },
        { "do": "divider", "target": "boat", "after": 2, "text": "准时线" }
      ]
    },
    {
      "title": "clearNotes",
      "actions": [{ "do": "clearNotes", "target": "r" }, { "do": "clearNotes", "target": "boat" }]
    },
    {
      "title": "通用动作：hide / show / move / reset / clear",
      "actions": [
        { "do": "hide", "target": "boat" },
        { "do": "show", "target": "boat" },
        { "do": "move", "target": "boat", "position": [0, -2.5, 0] },
        { "do": "reset", "target": "boat" },
        { "do": "clear", "target": "r" }
      ]
    },
    {
      "title": "Arrow：show / move / setText / hide",
      "actions": [
        { "do": "show", "target": "a" },
        { "do": "move", "target": "a", "position": [-3, 1.2, 0.6] },
        { "do": "setText", "target": "a", "text": "每份差 2" },
        { "do": "hide", "target": "a" }
      ]
    }
  ]
}
```

### 数量限制（超过会报错）

| 限制 | 值 | 怎么办 |
|---|---|---|
| `slots` | ≤ 1000 | |
| 同时显示的份 | ≤ 24 | 加 `show` 省略中间 |
| 一份里同一个 token 段的 `count` | ≤ 12 | 数很大时用 block（写一个带数字的方块） |
| 一份里的东西总数（token + block） | ≤ 24 | |
| remainder 的 `items` 总数 | ≤ 40 | |

### 写一道盈亏题的套路（请照着 yk-01 改）

**范本：`content/problems/yk-01-yeguo.json`**。复制它、改 `id`（= 文件名）、标题、题干、数字和文字。典型步骤：

1. 读题（只显示第一行的“人”）
2. ① 摆出来：`fill` 每份数量 + `remainder`（`extra`）
3. ② 摆出来：`show` 第二行 + `fill`；“分不到”的份 `fill` `[]` + `mark` `highlight`
4. quiz：多了还是少了
5. 转化：`remainder`（`short`，虚影）
6. 每份差：`fill`（“3 个 + 多的 2 个”用两种颜色）+ Arrow
7. 总差：Arrow
8. 算“份数”（总差 ÷ 每份差）：`brace`
9. 算“总量”：`brace`
10. 小结

讲解要忠于老师板书的思路和记号（`3 3 … 3  多16颗`、`总差 = 多 + 少`、`每份差 = 大的每份 − 小的每份`），面向三年级：句子短、口语化、一步只讲一件事。

---

## 题目分组：series / order / section

三个可选字段写在题目最外层（和 `title` 同一层）：

```json
"series": "三秋 S06 · 盈亏进阶",
"order": 1,
"section": "承前启后"
```

- `series`：系列名。**同一系列的题要写得一字不差**。首页按系列分组显示（系列按名称排序）；没写 `series` 的题都归入“其他”组，排在最后。
- `order`：数字，组内从小到大排。没写 `order` 的排在组末尾（再按标题排）。建议一直写。
- `section`：小节名，首页卡片上的黄色小标签，也显示在讲解页标题前。
- 讲解页顶部的“‹ 上一题 / 下一题 ›”只在**同一系列内**跳（没写 `series` 的题互相为一组），第一题没有上一题、最后一题没有下一题。

---

## 选择题 quiz

```json
{
  "title": "猜一猜",
  "type": "quiz",
  "question": "三面涂色的小正方体在哪个位置？",
  "options": ["8 个顶点（角上）", "12 条棱的中间", "6 个面的中央", "最中心"],
  "answer": 0,
  "explanation": "角上的小正方体同时碰到 3 个面，所以有 3 个面是红色的。",
  "narration": "先别急着数，猜一猜。"
}
```

- `options`：至少 2 个选项；`answer`：正确选项的编号，**从 0 开始**（第一个选项是 0，第二个是 1……），不能超过选项个数。
- `explanation`：答完后显示的解析（可选）。
- 学生选完会立刻看到对 / 错和解析，可以改选；**不作答也能直接点“下一步”**。
- quiz 步骤同样可以带 `actions`、`camera`。

---

## 探索题 explore（滑块）

让学生拖动滑块，改变一个参数，3D 画面和公式一起实时变化。

```json
{
  "title": "动手试一试",
  "type": "explore",
  "narration": "拖动滑块改变边长 n，看看各类小方块的数量怎么变。",
  "control": {
    "param": "n",
    "min": 2,
    "max": 6,
    "step": 1,
    "default": 3,
    "bind": [
      { "target": "cube", "prop": "size", "value": ["n", "n", "n"] }
    ]
  },
  "formulaTemplate": "12 \\times (n-2) = {{12*(n-2)}}"
}
```

- `param`：参数名（字母开头，如 `n`）。`min` / `max` / `step`（每次变多少，默认 1）/ `default`（一开始的值，必须在 min～max 之间，并且落在刻度上）。
- `bind`：把参数“绑”到哪个对象的什么上。目前只支持 `"prop": "size"`，对象必须是 **CubeGrid**；`value` 是三个表达式，分别算出 x、y、z 方向的块数，如 `["n", "n", "n"]` 表示正方体，`["n", "n", "2"]` 表示高度固定为 2 的长方体。
- 算出来的边长必须是 **1～20 的整数**，并且在整个滑块范围内都成立（比如 `n-2` 在 `n=2` 时是 0，就不行）。
- 之前步骤里设置的 `highlight` 等效果会**自动套用到新的小方块上**（按 filter 规则重新选择），所以想在探索时保持“角黄、棱蓝……”的颜色，**别在这一步 `clear`** 就行。
- `formulaTemplate`：公式模板，其中 `{{表达式}}` 会换成当前参数下的计算结果。例如 n=4 时，`{{12*(n-2)}}` 显示为 `24`。

### 表达式怎么写

只支持：**数字**、**参数名**、`+` `-` `*` `/` `^`（乘方）、**括号**、前面的**负号**。

| 写法 | 含义 |
|---|---|
| `12*(n-2)` | 12 × (n−2) |
| `(n-2)^3` | (n−2) 的三次方 |
| `n^3` | n 的三次方 |
| `-n+10` | 10 − n |

- 乘号必须写 `*`（不能写 `2n`，要写 `2*n`）。
- 不支持函数（如 `sqrt(n)`）、不支持别的符号；写了会报错并指出位置。
- 为了安全，表达式是由程序自己解析的，不会被当作代码执行。

---

## 讲解文字、公式、颜色、相机

### narration（讲解文字）

- `**加粗**`：用两个星号包起来，会显示成红色加粗，适合强调关键数字。
- 想换行就写 `\n`（JSON 里的换行）；想分段，写两个 `\n\n`。
- 一行以 `- ` 开头会变成列表（连续几行就是一个列表）。

```json
"narration": "第一段。\n\n第二段，其中 **8 个**很重要。\n- 要点一\n- 要点二"
```

> 讲给 4～5 年级的小朋友：句子短一点、口语一点，一步只讲一件事。

### formula（公式）

用 [KaTeX](https://katex.org/docs/supported.html) 写法。**JSON 里反斜杠要写两个**：`\\`。

| 想显示 | 要写 |
|---|---|
| 3 × 3 × 3 = 27 | `"3 \\times 3 \\times 3 = 27"` |
| 分数 1/2 | `"\\frac{1}{2}"` |
| 平方 | `"(n-2)^2"` |
| 中文说明 | `"\\text{三面涂色} = 8"` |
| 多行对齐 | `"\\begin{aligned} a &= 1 \\\\ b &= 2 \\end{aligned}"` |

### color（高亮颜色）

两种写法都行：

- 颜色名：`yellow`（黄，默认）、`red`、`blue`、`green`、`purple`、`orange`、`pink`、`teal`、`gray`、`black`、`white`
- 十六进制：`"#f5b301"` 或 `"#fb0"`

### camera（相机）

```json
"camera": { "position": [x, y, z], "target": [x, y, z], "projection": "orthographic" }
```

- `position`：相机在哪；`target`：相机看向哪里（不写就是 `[0, 0, 0]`，也就是物体中心）。
- `projection`（可选）：投影方式。
  - `"perspective"`（**默认**，不写就是它）：透视，近大远小，适合斜着看、整体观察。
  - `"orthographic"`：正交，没有近大远小——同样大小的方块不论远近画出来一样大，平行的线保持平行。**画三视图（正视 / 左视 / 俯视）和其他“平面观察”时必须用它**，否则前排的方块会显得比后排大、底边对不齐，孩子会被误导。
  - 和 `position` / `target` 一样，`projection` 属于“相机设定”的一部分：本步**不写 `camera`** 就沿用上一次的设定（包括投影）；本步**写了 `camera` 但没写 `projection`** 则回到透视。所以三视图之后要回到斜视角时，那一步写 `camera` 即可，不必再写 `"projection": "perspective"`。
  - 透视 ↔ 正交切换时画面会直接跳变（不做插值）；同一种投影内换视角仍然平滑飞过去。正交下滚轮/双指缩放、拖动旋转、“重置视角”照常可用。
- 想看**三视图**，让相机正对着物体（距离 10 左右）：

| 视角 | position |
|---|---|
| 正面（从前面看） | `[0, 0, 11]` |
| 左面（从左边看） | `[-11, 0, 0]` |
| 上面（从正上方往下看） | `[0, 11, 0.01]`（最后的 0.01 是为了避免正上方时方向不确定，别删） |

  三视图步骤请写成：`"camera": { "position": [0, 0, 11], "projection": "orthographic" }`。
  俯视时画面**下方是物体的正前方**（`CubeStack` 的 `heights` 里靠后的行），上方是后方。

- 一般的斜 45° 视角：`[6, 4.5, 7]`。
- 物体被拆开（`explode`）或探索题放大后，相机会**自动**拉远/拉近，一般不用为此改 `camera`。
- 学生随时可以用鼠标/手指拖动旋转、滚轮/双指缩放；右上角有“重置视角”按钮回到这一步设定的位置。

---

## 常见错误

页面（列表页顶部的红色框）会写明：**文件名 / 第几步 / 字段 / 原因**。其他没出错的题目不受影响。

| 提示 | 原因 / 怎么改 |
|---|---|
| `(JSON 语法)` … Expected double-quoted property name … | JSON 格式坏了：最常见是**最后一项后面多了逗号**、少了引号、少了 `}` `]`。可以把文件内容粘到 jsonlint.com 检查 |
| 不认识的字段：`narraton`（是不是拼错了？） | 字段名拼错了，对照上面的表格改 |
| `actions[0].target` 找不到对象 "cub" | `target` 要和 `scene.objects` 里某个 `id` **一字不差**；报错里会列出现有的 id |
| 动作 "highlight" 只能用于 CubeGrid / CubeStack | 你对 Label 用了方块的动作，或对方块用了 `setText` |
| `actions[0].do` 不是合法的取值 | 动作名写错了（`explod`？），可选值会列出来 |
| `answer=5 超出范围` | quiz 的 `answer` 要小于选项个数，且从 0 开始数 |
| 只有 "type": "quiz" 的步骤才能写 question | 写了选择题的字段却忘了写 `"type": "quiz"`（探索题同理） |
| `region` 只能用于 CubeGrid | 对 CubeStack 用了 `region`，改用 `layer` / `paintedFaces` |
| 颜色 "xxx" 不认识 | 用上面列出的颜色名，或 `#rrggbb` |
| 当 n=2 时 … 边长必须是 1~20 的整数 | explore 的 `bind` 表达式在滑块某个值下算出来是 0、小数或太大了；调整 `min` 或表达式 |
| 表达式 "…" 有问题 | 表达式里只能有数字、参数名、`+ - * / ^`、括号；乘号不能省略 |
| 题目 id "xxx" 与 yyy.json 重复 | 两个文件的 `id` 一样了，改一个 |
| heights 每一行的长度必须一样 | CubeStack 的 `heights` 要写成规整的长方形，缺的位置补 0 |
| `id` 只能用字母、数字、- 和 _ | `id` 里别用中文或空格 |
| `slots=[3, 5] 超出范围：对象 "r1" 现在只有 4 份` | Bench 的份下标从 1 起、不能超过当前份数（注意 `setSlots` 可能在之前改过份数） |
| `区间要写成两个整数 [起点, 终点]` | `slots` / `from` / `to` / `show` 里的区间必须是 `[1, 3]` 这样两个数，不能只写一个 |
| `起点不能比终点大` / `份的下标从 1 起` | 区间写反了，或者用了 0 |
| `份数对不上：from=[1, 2] 有 2 份，to=[3, 3] 有 1 份` | `transfer` 两边的区间长度要一样（一份对一份），而且不能重叠 |
| `第 1 份的第 0 段只有 3 个，不够拿 4 个` | `transfer` 的 `count` 太大；或者 `segment`（段下标，从 0 起）写错了 |
| `一共有 100 份，全部显示太多了（最多同时显示 24 份）` | 加 `show`，如 `"show": [[1, 3], [99, 100]]`；`setSlots` 也要写 `show` |
| `count=13 太多：每份里同一种东西最多 12 个` | 数很大时改用 `block`：`{ "kind": "block", "text": "13" }` |
| `动作 "highlight" 只能用于 CubeGrid / CubeStack，但 "r1" 是 Bench` | Bench 要标记某几份请用 `mark`；反过来 `fill` / `transfer` 等只能用于 Bench |
| `brace … 这几份现在都被省略号藏起来了` | `brace` 的区间里至少要有一份是显示出来的（看 `show`） |
| `after=14 超出范围` | `divider` 的 `after` 要在 1～份数 |
| `mark` 报 `…都被省略号藏起来了` | `mark` 的 `slots` 里至少有一份在桌面（`show`）和窄屏（`compactShow`）下都显示着 |
| `divider` 报 `after=… …都被省略号藏起来了` | 第 `after` 份和第 `after+1` 份至少要有一份在桌面和窄屏下都显示着 |
| `setSlots` 报 `已有的大括号 / 竖线…` | 新的 `show` / `compactShow` 把已经画上去的大括号 / 竖线藏住了：先 `clearNotes`，或调整显示区间 |
| `颜色不认识` | Segment / mark / Arrow 的 `color` 用颜色名或 `#rrggbb` |

**调试小技巧：** 先复制一份能用的样例（`cube-paint-3.json`、`count-blocks.json`，盈亏题用 `yk-01-yeguo.json`），一点点改，每改一处保存刷新看一眼，出错了就知道是哪里。
