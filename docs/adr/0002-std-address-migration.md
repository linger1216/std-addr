# ADR-0002: 地址标准化服务移植（`stdaddr-service` → 主应用）

- **状态**：✅ 已实施
- **日期**：2025-09
- **影响范围**：`src/lib/standardize/**`（新建）、`src/server/services/standardizeService.ts`（新建）、`src/server/api/routers/std-address.ts`、`prisma/schema.prisma`（`StdAddress` 模型）

---

## 1. 背景与动机

旧架构 `stdaddr-service/`（Express + Sequelize + Redis，独立部署）中 872 行的
`standardizeService.js` 承担地址标准化 10 步流水线。主应用（Next.js + tRPC + Prisma）
需要同等能力,需把该服务**完整移植**并接入 `std-address` 模块(见 `src/components/modules/std-address/`)。

移植完成后 `stdaddr-service/` 整体删除,因此:
- 核心流水线必须 1:1 对齐(行为、评分口径、拼接规则);
- 配套调试/分析能力(测试用例、评分建议)按"是否有主应用消费者"决定取舍;
- 缺失数据库表的功能需明确降级,不能静默消失。

## 2. 移植对照表

### 2.1 已移植(1:1)

| 功能 | 旧实现 | 新实现 |
| --- | --- | --- |
| 预处理 9 条正则策略(括号/不可见字符/井号/室号楼栋单元路号脏字符) | `preprocessRaw` + `PREPROCESS_STRATEGIES` | `src/lib/standardize/preprocess.ts` |
| ML 解析(`/api/format`) | `mlService.parseAddress`(axios,30s) | `standardizeService.mlParse`(fetch,30s,复用 `lib/settings/model-service.ts` 的 URL 优先级) |
| 清洗 ML 逗号污染(行政去逗号/building 首个/village↔zhai 拆分/community↔subarea 拆分) | `#cleanFields` | `cleanFields` |
| `road_number` → `number` 归一 | 主流程内 | 主流程内 + `toStdFields` |
| 中文数字转阿拉伯(队/组,十位展开) | `#normalizeNum` | `normalizeChineseNum`(修正缺陷,见 §3) |
| 上下文推断(锚点 street/town/district/city/province 向上反查) | `#inferAdmin` | `inferAdmin` |
| DB 匹配覆盖:小区/子区域/POI/村 + 行政路径填充 + 行政上下文精确过滤 | `#matchAnythingEntity` 等 | `matchEntity`/`matchSubarea` |
| 行政去重(直辖市/省市包含/市辖区) | `#deduplicateAdmin` | `deduplicateAdmin` |
| 标准地址拼接(行政去重/路弄号合并/地标兜底/农村/楼栋) | `#buildStdAddress` | `src/lib/standardize/build.ts:buildStdAddress` |
| 完整度评分 0-10(居委3/街镇2/区县1/路弄号/农村/室号/方向) | `#calcScore` | `src/lib/standardize/score.ts:calcScore` |
| 评分明细文案 | `#formatScoreDetail` | `score.ts:formatScoreDetail` |
| 写库字段映射(27 要素) | `PERSIST_FIELDS` + `#save` | `src/lib/standardize/persist.ts:mapFieldsToPersist` + router 落 `std_address` 表 |

### 2.2 降级项(明确记录,不静默丢失)

| 功能 | 旧实现 | 降级理由 | 后续加强路径 |
| --- | --- | --- | --- |
| 路弄号匹配(`RoadLaneNumber`/`RoadLaneNumberRef`:实体的关联路弄号、路+弄→小区/子区域、路+号→POI、`#applyRoadLaneRef`) | 完整 4 路子逻辑 | 主应用 schema 无这两张表 | 建 `road_lane_number`/`road_lane_number_ref` 表后按旧逻辑补齐 |
| 村号段匹配(`VillageNumber` 宅/队/组覆盖) | `#buildRuralWhere` + `VillageNumber` 查询 | 主应用无该表 | 迁移 `village_number` 数据后补齐 |
| 缓存 | Redis(`cacheService`,TTL 可配) | 主应用无 Redis 依赖 | 进程内 LRU(1000 条)已兜底;需要多实例共享时可引入 Redis |
| 调试日志(`includeLogs` 分步明细) | `#log` 全步骤 | 主应用 UI 无调试面板消费者 | 需要时可加 `logs` 字段,纯增量 |
| 评分建议(`scoreSuggestionService` 缺字段/提分建议) | 独立服务 + Vue 客户端页面 | 主应用 `std-address` 页面暂无此 UI | 以 `calcScore` 口径重实现,属独立 feature |
| 测试用例运行器(`testCasesService` + 665 行用例) | HTTP 接口 `/test-cases/*` | 用例依赖旧库真实实体(都市阳光花园 id=113 等)+ ML 服务 | 纯逻辑断言已内化为 vitest(预处理/拼接/评分/流水线),实体级回归需真实数据环境 |

## 3. 行为修正(旧实现对不完整/有缺陷,移植时修正)

1. **ML 逻辑失败降级**:旧实现 ML 返回 `code !== 0` 时 `fields = {}` **继续**流水线;首版移植直接 throw,会中断整个标准化工序。已对齐旧行为:**仅 HTTP/网络失败抛错**,`code !== 0` 降级继续。
2. **中文数字十位展开**:旧 `#normalizeNum` 先替换"十X"再"X十"顺序颠倒,`二十一队` 产出 `211队`(把"十一"误拆为 11 再拼 "2")。`normalizeChineseNum` 先处理带十位前缀的 `X十Y`(二十一 → 21)再处理 `十X`(十二 → 12),输出规范数字,并有单测锁定。
3. **子区域 entity_type**:旧 `#matchSubarea` 查询条件传 `'subarea'`,而表注释/数据的合法值是 `community/poi/village`,旧代码永远查不到。新实现按 `entityType: "community"` 正确匹配。
4. **subarea 单测修复口径**:社区地址的评分在无居委/街镇时按区县 1 分 + 地标 4 分,已在服务层测试中固化。

## 4. 测试策略

| 层级 | 覆盖 | 文件 |
| --- | --- | --- |
| 纯函数 | 预处理 9 策略 + 中文数字(逐字/十位展开) | `src/lib/standardize/preprocess.test.ts`(16 条) |
| 纯函数 | 拼接/评分/评分明细 | `src/lib/standardize/score.test.ts`(14 条) |
| 纯函数 | 27 字段写库映射 | `src/lib/standardize/persist.test.ts`(5 条) |
| 服务层 | 10 步流水线(mock db + mock fetch):全链路/ML 降级/网络错误/缓存命中/community+subarea 行政填充/逗号拆分/中文数字/直辖市去重/空地址 | `src/server/services/standardizeService.test.ts`(10 条) |

## 5. 回滚与影响

- 服务与 UI 均在新命名空间(`stdAddress`),不触碰其它模块;回滚只影响 `std-address` 页面。
- `stdaddr-service/` 删除前保留 `data/test-cases.js` 与旧仓备份,后续实体级回归可据此重建测试环境。