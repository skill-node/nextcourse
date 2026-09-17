# 课程组合契约 v1

本文件固化 Phase 1a 的机器契约。JSON Schema 是文件形状的公开说明，
`contracts.js` 负责需要跨字段判断的业务规则。两者都以 `schemaVersion: 1` 为边界。

## 身份与版本

- 课程使用登记后的 `courseId`，格式为小写字母、数字、点、下划线和短横线。目录改名不改变 `courseId`。
- 实体 ID 固定为 `<owner-id>:<kind>:<local-id>`。首版 kind 为 `unit / sequence / page / case / asset`。
- 配方条目 `id` 是一次使用的 occurrence ID，只需在同一配方内唯一。同一实体可有多个 occurrence，解析器不得静默去重。
- 公开实体的 `version` 是精确 SemVer。版本表示发布过的接口修订；构建可复现性最终由 lock 中的内容哈希和快照保证。
- 目录名、章节号、`slide-25` 和构建后的页码都不是持久身份。

## 五类文件

| 文件 | 权威范围 |
|---|---|
| `course.exports.json` | 本课允许其他课程引用的接口；`source` 是本课源，`target` 是显式再导出，两者只能选一个 |
| `course.compose.json` | 本课配方、实例、顺序、局部变体与显式选页；这是内容选择的唯一权威 |
| `course.lock.json` | 一个配方解析后的精确版本、完整接口链、哈希与不可变快照位置 |
| 单元描述文件 | 单元成果、前置、时长、页面、案例与资产闭包；由 export 的 `source` 指向 |
| 案例描述文件 | 案例输入、任务、预期产出、答案／量规、材料 audience 与可复现生成记录 |

JSON Schema 位于 `composition/schemas/`。首版组合清单只允许显式选择；时长超编由诊断报告，
不会触发自动删页。`contentMode` 与 `updatePolicy` 是两条独立轴：

- `reference`：使用已锁源；`variant`：使用本地完整替代源并保存旧基线哈希；`local`：本课原创且没有活动同步边。
- `manual`：发现候选后由人接受；`frozen`：解除冻结前不提出自动升级动作。两者的普通构建都只读现有 lock。

## 选页与插入

`pages.include / pages.omit` 只接受稳定 page ID。`operations` 按声明顺序执行，支持
`insert_before / insert_after / replace`；锚点同样是 page ID。操作位于 occurrence 内，
因此同一源单元出现两次时仍有确定上下文。目标消失、同一 occurrence 内锚点不唯一或多次互相覆盖时必须报错，
不能退回按文件名或当前页码猜测。
操作的新页面可以是本地完整页面，也可以是公开 page export；外部页面会以派生 occurrence 写入 lock 和快照。
组的 `moduleNumber` 可显式指定正整数，包装组可设为 `null`；省略时按组序从 1 编号。

## 锁与快照

锁中的每个外部 occurrence 都保留：最终实体、精确版本、内容哈希、快照路径、
快照内的 `sourcePath`、`exportPath`（中间公开接口链）和 `dependencyPath`（实际展开链）。快照路径必须位于工作区内，
建议落在 `courses/.nextcourse/objects/sha256/<hash>/`。lock 中的 `snapshotPath` 相对 `courses/` 根解析，
因此写作 `.nextcourse/objects/sha256/<hash>`，不依赖消费课程的目录深度。Git revision 只是可选来源信息；
没有快照时不得承诺离线恢复。

锁不记录“最新”。组合清单变化、接受上游更新与首次锁定都要先产生计划；应用计划时必须重新核对输入哈希。

Phase 1b 的领域 API 由 `catalog.js`、`resolver.js` 和 `lock.js` 提供。catalog 只登记显式公开接口；
resolver 按 `实体 ID + 精确版本` 展开再导出链，实体递归环会阻断，课程之间引用不同实体不会误报。
菱形路径保留每个 occurrence 并给 warning，多版本终点给 error。lock 分成纯计划与应用两步：
应用前重验 compose、所有导出清单、外部源、本地单元页面、变体、操作页及其链接资产哈希，
再把内容寻址对象与 lock 原子落盘。

对象的 `contentHash` 覆盖单元描述、页面和已登记资产／案例字节；它与基线工具用于判断合理页面复用的
`contentFingerprint` 用途不同，不能互换。对象写入临时目录并完成完整性校验后才会公开。

## 案例与交付

公开 case export 指向 `case.schema.json` 描述文件。每个案例必须声明输入、任务、预期产出、
答案材料、量规材料，以及每份材料的 `student / facilitator / both` audience。答案只能是
`facilitator`；学员材料如通过 HTML/CSS 相对链接触达讲师材料会报 `DELIVERY_AUDIENCE_LEAK`。
相对依赖递归进入内容快照，外部 URL 只保留链接，不冒充离线资源。

案例可以登记生成脚本、参数、随机种子和每个生成物的 SHA-256。解析器只锁定并核验脚本与产物，
从不执行脚本；产物字节与登记哈希不符会阻断锁定。本地单元引用公开案例时，案例使用派生 occurrence
单独进入 lock。`deliveryFiles` 标记案例闭包，课件视图不会把答案混入 `assets/`。

`delivery.js` 的 `planDeliveryPackage` 是只读交付计划；`packageComposedCourse` 仅为
`slides+lab` 首次补齐 `package-src/<recipe>/student` 和 `facilitator` Markdown 草稿，已存在源永不覆盖。
两类材料物理分开写入 `.build/<recipe>/package/<audience>/`，生成物漂移时拒绝覆盖。`full` 配方必须
先具备完整的八份 package source，不能拿轻量草稿冒充完整企业交付包。组合课 export 默认 student，
只有显式 `--audience facilitator` 才携带答案、生成脚本和讲师材料。

## 诊断契约

诊断统一返回 `{ code, severity, message, path, details? }`。`code` 和 `path` 给 CLI、UI 与测试消费，
`message` 只供人阅读，不能被客户端解析。稳定代码定义在 `diagnostics.js`，包括：

- 文档层：schema、ID、版本、路径、重复 occurrence、变体基线与 lock 字段错误。
- 解析层：公开接口不存在、实体循环、菱形重复、多版本冲突、快照或资产缺失。
- 计划层：源漂移、计划过期、生成物漂移。
- 教学层：前置缺失、成果证据缺口、时长超编。超编默认是 warning，不能自动裁页。

同一个 code 不会换义；新增字段保持向后兼容，破坏性变化必须提高 `schemaVersion`。

## 源与产物

独立课没有组合文件时仍按原路径工作。组合课的创作源保留在课程根，解析视图写入
`.build/<recipe>/`；现有根目录 `slides/`、交付 Markdown 和真实 WorkBuddy 文件在迁移验收前都不移动。
`baseline.js` 只读源文件并生成确定性清单，用来冻结源哈希、页序、备注和资产引用；它排除 deck、PDF、截图和离线包等生成物。
逐文件 `hash` 用于检测字节漂移；页面 `contentFingerprint` 另行忽略来源注释、自动动画 class、模块编号实例化
和讲师备注，只用于识别屏幕教学内容是否仍被完整复用。备注由独立的 `notesHash` 追踪，
允许课程实例按班级调整。`contentFingerprint` 不能替代 lock 的内容哈希或恢复快照。

`materialize.js` 只从当前 lock 的快照和显式本地源生成 `.build/<recipe>/`。它按稳定 page ID
执行 include / omit / insert / replace，支持单页完整变体，按显式模块号实例化分隔页，并输出
`build.manifest.json` 的 occurrence → 页面 → 来源映射。快照资产写入带来源命名空间的路径并改写页面链接，
本地链接资产保持本课路径；案例 HTML、JSON 等可打开材料进入独立交付闭包，不混入 deck assets。
已有生成文件与 manifest 哈希不一致时拒绝覆盖；输入未变时复用组合视图，保留下游 deck 与 package。
`nextcourse compose --dry-run` 只产生候选；首次 lock 也必须通过 `sync --apply <plan-id>` 接受，不能把
未审阅的“最新”直接固化。正式 compose 只从已接受 lock 重建视图，不读取“最新”来升级依赖。

## 校验与维护 API

`maintenance.js` 提供给 CLI 和后续 studio 共用的纯领域结果：`validateRecipe / validateWorkspace`
校验 compose、lock、快照、教学证据、时长和生成物漂移；`traceSource` 按实例 ID、实体 ID 或当前页码
返回来源链；`impactSource` 扫描全部已锁配方并区分直接／传递影响和冻结状态。这些函数不写文件，
CLI 的 `--json` 直接序列化同一结果；旧 `check <name>` 写对齐矩阵的兼容行为保持独立。

`planCourseUpdate` 比较当前 lock 与工作区候选，返回候选精确版本、文件差异、变体三方基线、冲突、
输入哈希和确定性 plan ID。`applyCourseUpdate` 只接受同一 plan ID，应用前再次核对 compose、lock、
公开清单、外部源与本地输入；任一变化都报 `PLAN_STALE`。同版本内容漂移、变体上游变化和解析冲突
不会覆盖旧 lock；`frozen` occurrence 保留旧引用。普通 build / render 始终只消费当前 lock。
