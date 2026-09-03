/**
 * region.json → regions 表行的纯转换函数(前端导入前解析 / 后端 import 复用 / 单测覆盖)。
 *
 * region.json 结构(envelope 的 data 数组):
 *   { orgCode, parentOrgCode, orgName, areaCode, addressStandardCode, childList }
 *
 * 该文件是"组织架构树"与"行政区划树"的混合体:
 *   - 区划节点:addressStandardCode 非空(如 310112114021 聚缘居民委员会)
 *   - 机构节点:addressStandardCode 为空(法院/机关科室/公司…)或"重复父编码"的节点
 *     (同一分支下大量机构节点会继承父区划编码,如浦江镇下所有科室都是 310112114)
 *
 * 导入规则(确定性,避免人肉筛选):
 *   1. 只保留 addressStandardCode 非空、且编码 ≠ 最近"已保留祖先"编码的节点
 *      (继承编码 = 机构回声,如 310112114 在机关科室上重复出现,跳过)
 *   2. 名称需含区划特征(街道/镇/乡/社区/村委会/居委会…),过滤纯机构节点
 *      (如编码 310112 落在"法院"上,名称过滤后整支不保留)
 *   3. 编码全局去重:首个出现的保留,后续重复跳过(文件里 310112501 等会在多支重复)
 *   4. 层级/完整路径只统计"已保留"节点:level 从 1 递增,
 *      fullName = 保留节点名称路径用 "/" 连接(与 regions 表现有约定一致)
 *
 * 该规则与现有 regions 表(549 行:街道/镇/居委会)同源同构,导入后小区等
 * 模块按 addressStandardCode(= code)关联区划的链路不受影响。
 */

import { parseAliasEntries } from "@/lib/alias-entries";

/** region.json data 里的单个节点(与后端 import input 共用的类型) */
export type RegionJsonOrgNode = {
  orgCode: string;
  parentOrgCode: string | null;
  orgName: string;
  areaCode: string | null;
  /** 行政区划标准编码;空串/缺省 = 非区划(机构)节点 */
  addressStandardCode: string | null;
  /** 别名 / 别称(导入可选;字符串 / 数组 / JSON 字符串均可,路由层归一) */
  alias?: unknown;
  childList?: RegionJsonOrgNode[];
};

/**
 * regions.type 字段的合法取值集合(单一事实来源)。
 *
 * 前端下拉(region-form-mappers)、导入/回填(region-import.inferRegionType)、
 * 后端校验(lib/validators/region)都从这里取,避免散落写字符串。
 */
export const REGION_TYPES = [
  "省",
  "市",
  "区",
  "街道",
  "乡镇",
  "小区",
  "居委会",
  "村委会",
  "开发区",
] as const;

export type RegionType = (typeof REGION_TYPES)[number];

/**
 * 按节点 name 推断 type(9 个固定枚举之一)。
 *
 * 规则(顺序敏感,先匹配先生效):
 *   居委会 / 居民委员会 / 居(村)委会 / 居委 → 居委会
 *   村委会 / 村民委员会 / 村委 → 村委会
 *   街道 → 街道
 *   镇 / 乡 → 乡镇
 *   小区 → 小区
 *   开发区 / 工业区 → 开发区
 *   省 / 市 / 区 / 县 / 旗 → 按后缀直接归类(顶层行政单位)
 *   其他 → null(交给人工编辑补)
 *
 * 注意:这是基于"中文行政区划名称"的启发式推断,不替代人工;
 * 前端表单仍允许自由输入,后端无 enum 约束(见 lib/validators/region)。
 */
export function inferRegionType(name: string): RegionType | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  // 居(村)委会 / 居委会 / 居民委员会 归"居委会"
  if (
    trimmed.includes("居委会") ||
    trimmed.includes("居民委员会") ||
    trimmed.includes("居(村)委会") ||
    trimmed.includes("居委")
  ) {
    return "居委会";
  }
  if (
    trimmed.includes("村委会") ||
    trimmed.includes("村民委员会") ||
    trimmed.includes("村委")
  ) {
    return "村委会";
  }
  if (trimmed.includes("街道")) return "街道";
  if (trimmed.includes("镇") || trimmed.includes("乡")) return "乡镇";
  if (trimmed.includes("小区")) return "小区";
  if (trimmed.includes("开发区") || trimmed.includes("工业区")) return "开发区";
  // 顶层行政单位必须以名称结尾(避免把"华北区"误归"区"),
  // 用"等字结尾"判定,与 region.json 顶级命名一致。
  if (/(省|市|区|县|旗)$/.test(trimmed)) {
    if (trimmed.endsWith("省")) return "省";
    if (trimmed.endsWith("市")) return "市";
    return "区"; // 区/县/旗 一律归"区"
  }
  return null;
}

/** 转换结果中的一条区划(对应 regions 行) */
export type RegionImportItem = {
  /** addressStandardCode(与 communities 的「区划ID」约定一致) */
  code: string;
  name: string;
  /** 最近一个"已保留"祖先的 code;无祖先 = null(顶级) */
  parentCode: string | null;
  /** 1 起,只数保留节点 */
  level: number;
  /** 保留节点名称路径,如 闵行区/浦江镇/居(村)委会/聚缘居民委员会 */
  fullName: string;
  /** 同级中的序号(0 起) */
  sortOrder: number;
  /** 按名称推断的 type;推断不出 = null(由人工/编辑器补) */
  type: RegionType | null;
  /** 别名 / 别称(已归一为多值字符串数组;空 = 无) */
  alias: string[];
};

/** 导入统计:每类被跳过的节点数 + 警告 */
export type RegionImportSummary = {
  items: RegionImportItem[];
  skipped: {
    uncoded: number;
    echo: number;
    duplicate: number;
    nameFiltered: number;
  };
  warnings: string[];
};

/** 区划特征名称:纯机构节点(法院/党政办/公司…)即使带编码也不导入 */
const DIVISION_NAME_PATTERN =
  /(街道|镇|乡|工业区|社区|里弄|管委会|居民委员会|村民委员会|居(村)?委会|村委会|居委|村委)/;

/**
 * 明确排除的机构名称:即便带编码、名称含区划特征也不导入。
 * 区开发区管委会 / 莘庄工业区房管办事处 是区级机构,下面没有居村委,
 * 混进行政区划树只会制造噪音(对应线上删根需求)。
 */
const EXCLUDED_NAME_PATTERN = /(管委会|办事处)/;

/**
 * 明确封禁的编码:文件里这两个编码挂在机构节点上(区开发区管委会=310112501、
 * 莘庄工业区房管办事处=310112),整个编码及其全部出现都不导入。
 *
 * ⚠️ 必须用"编码封禁"而不是只排除名称:若只按名称排除,
 * 同编码的后置机构节点(如 社区服务中心)会顶替占位重新变成根,
 * 树里依然冒出没有居村委的机构节点。
 */
const EXCLUDED_CODES = new Set(["310112501", "310112"]);

/**
 * 把 region.json envelope 的 data 数组转换成 regions 行(纯函数,无 IO)。
 * 规则详见文件头注释。
 */
export function flattenRegionJson(
  data: RegionJsonOrgNode[],
): RegionImportSummary {
  const items: RegionImportItem[] = [];
  const skipped = { uncoded: 0, echo: 0, duplicate: 0, nameFiltered: 0 };
  const warnings: string[] = [];
  const seenCodes = new Set<string>();

  // 栈里的编码/名称都只属于"已保留"节点 → 保证 parentCode 一定可解析
  const walk = (
    nodes: RegionJsonOrgNode[],
    codeStack: string[],
    nameStack: string[],
  ) => {
    let keptSiblings = 0;
    for (const node of nodes) {
      const code = node.addressStandardCode?.trim() ?? "";
      const ancestorCode = codeStack[codeStack.length - 1] ?? null;
      if (!code) {
        skipped.uncoded++;
      } else if (code === ancestorCode) {
        // 机构回声:与最近保留祖先编码相同(浦江镇 → 机关科室/社事办…)
        skipped.echo++;
      } else if (EXCLUDED_CODES.has(code)) {
        // 编码封禁必须优先于去重:封禁编码的节点不占 seen,
        // 否则后续同编码节点会顶替占位重新变根
        skipped.nameFiltered++;
      } else if (seenCodes.has(code)) {
        skipped.duplicate++;
      } else if (!DIVISION_NAME_PATTERN.test(node.orgName)) {
        skipped.nameFiltered++;
      } else if (EXCLUDED_NAME_PATTERN.test(node.orgName)) {
        // 明确排除的机构(区开发区管委会 / 莘庄工业区房管办事处 等,无居村委)
        skipped.nameFiltered++;
      } else {
        seenCodes.add(code);
        const trimmedName = node.orgName.trim();
        items.push({
          code,
          name: trimmedName,
          parentCode: ancestorCode,
          level: codeStack.length + 1,
          fullName: [...nameStack, trimmedName].join("/"),
          // 占位,最后统一按 parentCode 分组回填
          sortOrder: keptSiblings,
          type: inferRegionType(trimmedName),
          // 别名归一:任意可解析形态(字符串/数组/JSON 字符串)→ 多值数组
          alias: parseAliasEntries(node.alias),
        });
        keptSiblings++;
        codeStack.push(code);
        nameStack.push(trimmedName);
        walk(node.childList ?? [], codeStack, nameStack);
        codeStack.pop();
        nameStack.pop();
        continue;
      }
      // 未保留的节点:不推栈(其子节点挂到最近的保留祖先下),继续遍历
      walk(node.childList ?? [], codeStack, nameStack);
    }
  };

  for (const root of data) {
    walk([root], [], []);
  }

  if (skipped.duplicate > 0) {
    warnings.push(`文件内 ${skipped.duplicate} 个重复编码已跳过(保留首个)`);
  }
  if (skipped.echo > 0) {
    warnings.push(`${skipped.echo} 个机构节点因编码继承父级被跳过`);
  }
  if (skipped.nameFiltered > 0) {
    warnings.push(`${skipped.nameFiltered} 个带编码但非区划名称的节点被跳过`);
  }

  return { items, skipped, warnings };
}

/** 导入时自动补全的顶层行政区划根:上海市(310) → 闵行区(310112)。
 * 这样树形可显示 上海市 → 闵行区 → 街镇 → 居村委。
 * 约定:导入的 region.json 全为闵行区下辖,所有「无父」的顶层区划节点挂到
 * 闵行区 310112 下,并补全 上海市/闵行区 路径前缀。 */
const REGION_ROOT_SHANGHAI: RegionImportItem = {
  code: "310",
  name: "上海市",
  parentCode: null,
  level: 2,
  fullName: "上海市",
  sortOrder: 0,
  type: "市",
  alias: [],
};

const REGION_ROOT_MINHANG: RegionImportItem = {
  code: "310112",
  name: "闵行区",
  parentCode: "310",
  level: 3,
  fullName: "上海市/闵行区",
  sortOrder: 0,
  type: "区",
  alias: [],
};

/** 行政区划层级:省1 / 市2 / 区3 / 街镇(街道+乡镇)4 / 居村委(居委会+村委会)5。
 * 小区/开发区 非标准行政层级,沿用街镇/区 口径(见 inferRegionType 注释)。 */
const REGION_LEVEL_BY_TYPE: Record<RegionType, number> = {
  省: 1,
  市: 2,
  区: 3,
  街道: 4,
  乡镇: 4,
  小区: 4,
  居委会: 5,
  村委会: 5,
  开发区: 3,
};

/**
 * 在 flattenRegionJson 结果上补齐行政区划根 + 按 type 重算 level:
 *   1. level 改按 type 推断(省1市2区3街镇4居村委5);type 为空保留原深度层级
 *   2. 无父(parentCode=null)的顶层节点挂到闵行区 310112 下,
 *      fullName 补 `上海市/闵行区/` 前缀
 *   3. 前置 上海市 / 闵行区 两个根(数据集已含同 code 则不重复添加)
 * 纯函数,无 IO;导入(router)与前端预览(region-json-import)共用,保证一致。
 */
export function injectRegionAdminRoots(
  items: RegionImportItem[],
): RegionImportItem[] {
  const leveled = items.map((it) => ({
    ...it,
    level: it.type ? REGION_LEVEL_BY_TYPE[it.type] : it.level,
  }));
  // 全部顶层节点挂到闵行区 310112 下(无父的变 310112 子),并为所有节点补全
  // 上海市/闵行区 路径前缀,使树形显示完整 上海市 → 闵行区 → 街镇 → 居村委
  const reparented = leveled.map((it) => ({
    ...it,
    parentCode: it.parentCode ?? REGION_ROOT_MINHANG.code,
    fullName: `${REGION_ROOT_MINHANG.fullName}/${it.fullName}`,
  }));
  const hasShanghai = reparented.some(
    (it) => it.code === REGION_ROOT_SHANGHAI.code,
  );
  const hasMinhang = reparented.some((it) => it.code === REGION_ROOT_MINHANG.code);
  const roots: RegionImportItem[] = [
    ...(hasShanghai ? [] : [REGION_ROOT_SHANGHAI]),
    ...(hasMinhang ? [] : [REGION_ROOT_MINHANG]),
  ];
  return [...roots, ...reparented];
}