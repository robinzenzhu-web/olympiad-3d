# 视觉 QA 进度

桌面 1280×800 逐步截图 + 手机 390×844 每题抽查 2 步。检查：画面完整不裁切、两行对齐、文字标签不互相压 / 不压物体、画面与讲解一致。

> 第 1 批（yk-01 ~ yk-06）已完成并验收（此文件在第 2 批中断后才建立，所以没有第 1 批的逐题记录）。

| 题号 | 发现的问题 | 修复 | 状态 |
|---|---|---|---|
| yk-07-niunai | 无（12 步全部：两行对齐、箭头 / 大括号 / 虚影 / 蓝色 +6 与讲解一致，文字无重叠；手机 s5、s12 正常） | — | ✅ |
| yk-08-pingpan | 无新问题（11 步：黄色 4 盘、蓝色 2 个桃、28 桃虚影、两条箭头 / 大括号都与讲解一致；手机 s8、s10 正常；中断前对 yk-08 的改动经截图确认完整） | — | ✅ |
| yk-09-hongbai | 箱子里的球落在箱底，被箱子前壁挡住大半，红球只露一个红点（“1 红 1 白”“只有红球”看不清） | src：`bench.ts` 新增 `TOKEN_BASE`，`box` 容器里的 token 抬高 0.14；补测试；yk-02（也用 box）复查正常 | ✅ |
| yk-10-shangxue | ① 步 8 “总差”箭头正好压在第 17 份的“分钟”字上；② 红叉斜臂伸进上方数字标签；③ 步 10、11 `clearNotes` 把 ② 行的“准时到校”线一起清掉，两行只剩一条线 | ① yk-10 的 a1 / a2 起点抬到 y=0.9，a2 挪到第 16、17 份之间（x=-1.625）；② `Bench3D.tsx`：`container: none` 的红叉缩小（0.75）并落在方块上（题 yk-10、yk-11 受影响）；③ 步 10 在 `clearNotes` 之后给 r2 重新写 `divider` | ✅ |
| yk-11-yingbi | 红叉斜臂伸进数字标签，被标签底色盖住一半，只露几个红点；步 8 / 9 的“总差”箭头位置没问题 | 同上（`Bench3D.tsx` none 容器红叉）；A/B 两行划掉 24 个之后对齐，已确认 | ✅ |
| yk-12-xiaojie | 无（7 步：黄色 2 人 + 虚影、坏桌子红叉、船 10→9 人、复习步都与讲解一致；手机 s3、s5 正常） | — | ✅ |

## 展示截图

- `docs/screenshots/yk-10-shangxue-step6-cross-lines.png`：东东上学步 6，两行都有“准时到校”线，红色方块 + 红 ×
- `docs/screenshots/yk-06-beizi-F2-step10-duo46.png`：杯子题方法二（F2）“多 46 元”那一步

## 已知限制

- 手机竖屏（390×844）文字缩放：yk-10 / yk-11 已到 0.7（compactShow，见“修复轮 3”）；yk-08 / yk-09 步 6 起行尾文字很宽，只到 0.57~0.6（原 0.5）；yk-04 步 4 仍是 0.53。
- ~~`highlight` 会把份里的物品也染黄~~：已加 `mark.tint:"container"`（修复轮 3），yk-08 / yk-09 步 5 已使用。

### 修复轮 3

- [x] 项 1（玻/酸重复）：yk-06 / yk-07 的 ① 行 `countLabel:false`（方块上已写“玻/酸”）；② 行上方标签改成“保 / 纯”（第 2、9 步 `fill … countText`），第 10 步（②行变全是“玻/酸”）`countText:""` 清掉标签；第 2 步讲解补一句“上方的保/纯”。待截图确认。
- [x] 项 2（tint）、项 3（was）的内容部分：yk-08 步 5 / yk-09 步 5 的 `mark` 加 `"tint":"container"`；yk-05 步 5（“多6人”→“少8×3−6=18人”）、yk-08 步 6（“多12瓜”→“少7×4=28桃”）、yk-09 步 6（“多50红”→“少50×3=150白”）的 remainder 加 `was`。引擎 / schema / 渲染已改（tint、was、compactShow、Arrow.compactOffset），tsc + 现有 225 个测试通过；测试 / 文档 / 截图待做。
- [x] 项 4（compactShow）yk-10：r1 `compactShow [[1,1],[21,21]]`、r2 `[[1,1],[21,24]]`（两行“准时到校”线仍对齐），箭头 a1/a2 加 `compactOffset`（a2 另写 `textSide:"right"`，桌面不变）；手机 390×388 画布缩放 0.5/0.61 → 全部 11 步 0.7。同时 `layoutBench` 增加“竖线文字与上方大括号文字水平重叠时竖线再加高一截”（桌面所有题只有 yk-10 有竖线+上方大括号，桌面坐标不变）。yk-08 / yk-09 / yk-11 的 compactShow 待做。
- [x] 项 4 续：yk-08 / yk-09 加 compactShow（p1/p2、b1/b2 各只显示“第 1 份 … 最后一份”）+ 两条箭头 compactOffset；手机文字缩放 0.5 → 0.57~0.6（步 6 起行尾文字很宽，达不到 0.7，已是该布局的极限）；yk-11 只需 `countLabel:false`（方块上已写“5角/2角”，上方重复标签撑宽了文字）即可 0.52 → 0.7，未用 compactShow。yk-04 有同类重复标签（28元/30元）但本轮不动。
- [x] 项 3 细节：划掉的旧文字（`was`）只在改写那一步出现；总差箭头 a2 出现那一步再发一次不带 `was` 的 remainder 撤掉（yk-05 步 7、yk-08 / yk-09 步 8），否则 a2 的文字会盖住旧文字。yk-05 桌面步 4~7 已截图确认。
- [x] 项 4 续：yk-11 `countLabel:false` + compactShow（A [[1,1],[21,21]]、B [[1,1],[21,22],[44,45]]，两行 E 差仍为 4，对齐不变）+ 箭头 compactOffset → 手机全部 12 步文字 0.7（原 0.52）；手机截图确认箭头文字不互压。
- [x] 测试（bench.test.ts 新增 tint / was / compactShow / compactOffset / 竖线与括号 / 真实题目共 ~30 条）、AUTHORING.md 待写（见下）
- [x] AUTHORING.md：Bench 字段表 / countLabel 重复提示 / remainder.was / 窄屏 compactShow 一节 / setSlots、mark.tint、Arrow.compactOffset，并写进“全部动作示例”（会被测试校验）。npm test 257 通过、npm run build 0 错误。
- [x] 收尾：全部 4 项完成；npm test 257 通过、npm run build 0 错误；桌面 / 手机截图 0 控制台错误；展示截图 `yk-08-pingpan-step5-desktop-tint-container.png`、`yk-10-shangxue-step6-mobile-390x844.png` 已存入 docs/screenshots，`yk-06-beizi-F2-step10-duo46.png` 按新画面重拍；dev server 已关，临时目录已删。
