/**
 * 地址模拟 · 真实命名常用字词典(P0-4)
 *
 * 目的:把 randomChinese 的字池从"写死的 76 字"升级为真实小区/村/POI 命名规律。
 *
 * 字池三层结构(优先级从高到低):
 *  1. COMMON_PREFIX  常用修饰前缀(阳/锦/金/翠/碧...),用于前缀 1~2 字
 *  2. COMMON_SUFFIX  常用通名(花园/苑/村/里/小区...),用于尾部
 *  3. COMMON_HAN_FALLBACK 76 个常用汉字兜底(原 HAN_CHARS)
 *
 * 此外,DB 候选值(road/community/village/poi)可作为补充,通过 buildHanCharPool 切片注入。
 * 这样首字命中常见前缀的概率显著提升,对训练命名规律更有帮助。
 */

/**
 * 常用修饰前缀(高频 1~2 字)。
 * 选自中国小区/楼盘/村名常见词,排除生僻字。
 */
export const COMMON_PREFIX: readonly string[] = [
  // 单字地理/方位
  "东", "西", "南", "北", "中", "上", "下", "前", "后", "内", "外",
  // 单字形容词
  "金", "银", "翠", "碧", "青", "白", "红", "紫", "绿", "彩",
  "明", "华", "秀", "雅", "瑞", "祥", "盛", "兴", "隆", "昌",
  "安", "宁", "和", "顺", "富", "贵", "德", "仁", "义", "礼",
  "锦", "金", "美", "新", "古", "圣", "神", "凤", "龙", "鹤",
  "阳", "星", "月", "云", "山", "海", "江", "湖", "泉", "河",
  "泰", "嘉", "百", "千", "万", "一", "三", "九", "五", "六",
  // 常见双字前缀(精选,避免组合爆炸)
  "阳光", "金色", "金色", "翠湖", "碧水", "锦江", "新华", "和平",
  "东方", "西方", "南方", "北方", "中央", "华夏", "金色家园",
];

/**
 * 常用通名(地址要素的尾部,1~3 字)。
 * 选自实际小区/村/道路/POI 的通名。
 */
export const COMMON_SUFFIX: readonly string[] = [
  // 道路
  "路", "大道", "街", "巷", "弄", "里", "大街", "北路", "南路", "东路", "西路", "中路",
  // 小区/楼盘
  "花园", "苑", "小区", "花园", "公寓", "家园", "山庄", "华庭", "公馆", "别墅",
  "花园城", "新苑", "雅苑", "嘉园", "花苑", "花园小区",
  // 村
  "村", "新村", "老村", "东村", "西村", "南村", "北村", "屯", "庄", "堡", "圩",
  // POI
  "广场", "商城", "大厦", "中心", "大楼", "大楼", "商厦", "酒店", "宾馆",
  "医院", "学校", "中学", "小学", "幼儿园", "大学", "学院",
  "公园", "体育馆", "图书馆", "博物馆", "影城",
  "写字楼", "工业园", "科技园", "创意园", "物流园",
];

/**
 * 常用汉字兜底字池(原 HAN_CHARS,76 字)。
 * 当 COMMON_PREFIX/SUFFIX 都不命中时使用。
 */
export const COMMON_HAN_FALLBACK: readonly string[] = [
  "长", "街", "新", "村", "园", "苑", "里", "坊", "巷",
  "甲", "乙", "丙", "丁", "东", "南", "西", "北", "中",
  "白", "青", "红", "金", "秀", "福", "安", "平", "华",
  "兴", "庆", "和", "顺", "昌", "明", "德", "仁", "爱",
  "信", "义", "礼", "智", "诚", "心", "山", "水", "花",
  "木", "竹", "石", "云", "雨", "风", "光", "明", "春",
  "华", "秋", "实", "雅", "静", "乐", "康", "祥", "瑞",
];

/**
 * 从 DB 候选值切出 1~3 字前缀/通名片段。
 * 例如"阳光花园"→["阳", "阳光", "阳光花"];"王泥浜村"→["王", "王泥浜"]
 *
 * 用于把真实名称的"修饰部分"切出来加入字池,提升首字真实度。
 */
function extractNameFragments(realNames: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of realNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    // 1 字前缀(常见地理/方位)
    out.push(trimmed[0]!);
    // 2~4 字组合(选 1~3 字前缀,排除整词重复)
    for (let len = 2; len <= Math.min(4, trimmed.length); len++) {
      out.push(trimmed.slice(0, len));
    }
  }
  // 去重保序
  return Array.from(new Set(out));
}

/**
 * 构建汉字符池:DB 真实名称片段 + 词典 + 兜底。
 *
 * 返回的是去重后的字/词数组(不是纯汉字字符串),保证生成时抽到的都是"语义片段"。
 * 长度优先:DB 切出的多字片段优先被抽中,其次词典。
 */
export function buildHanCharPool(realNames: readonly string[] = []): string[] {
  const fragments = extractNameFragments(realNames);
  // 顺序:DB 片段 → 前缀词典 → 通名词典 → 兜底单字
  // Set 保序去重
  return Array.from(
    new Set([...fragments, ...COMMON_PREFIX, ...COMMON_SUFFIX, ...COMMON_HAN_FALLBACK]),
  );
}

/**
 * 从字符池中随机抽一个片段(可以是 1~4 字)。
 * 池为空时降级到一个常用汉字,保证不返回空串。
 */
export function pickChineseFragment(pool: readonly string[], rng: () => number): string {
  if (pool.length === 0) {
    return COMMON_HAN_FALLBACK[0]!;
  }
  return pool[Math.floor(rng() * pool.length)]!;
}
