/**
 * 数字 → 中文大写读音(目标范围 0 ~ 99999,地址场景足够)。
 *
 * 规则要点(与中文读写习惯一致):
 *  - 10 ~ 19 在最前时省略"一":12 → "十二"(而非"一十二")
 *  - 中间空位补"零":101 → "一百零一"、1001 → "一千零一"
 *  - 万以上段位:10001 → "一万零一"
 */

const DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const UNITS = ["", "十", "百", "千"];

/** 字符 → 数值映射;"两"作为"二"的别名(口语常用) */
const DIGIT_MAP: Record<string, number> = {
  零: 0,
  一: 1,
  两: 2,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};
/** 单位字符 → 10 的幂次 */
const UNIT_MAP: Record<string, number> = {
  十: 1,
  百: 2,
  千: 3,
};

/** 段内(0~9999)转中文,十位为最高位时省略"一" */
function sectionToChinese(section: number): string {
  if (section === 0) return "";

  // 按位拆开:parts[0] = 个位,parts[1] = 十位 ...
  const parts: number[] = [];
  let v = section;
  while (v > 0) {
    parts.push(v % 10);
    v = Math.floor(v / 10);
  }

  let out = "";
  let zeroPending = false;
  for (let i = parts.length - 1; i >= 0; i--) {
    const digit = parts[i]!;
    if (digit === 0) {
      // 中间空位补零(只在已经输出过非零位、且后面还有有效位时)
      if (out !== "") zeroPending = true;
      continue;
    }
    if (zeroPending) {
      out += "零";
      zeroPending = false;
    }
    if (digit === 1 && i === 1 && i === parts.length - 1) {
      // 十位为 1 且十位是最高位 → "十"(省略"一")
      out += "十";
    } else {
      out += DIGITS[digit]! + UNITS[i]!;
    }
  }
  return out;
}

/**
 * 数字转中文(0 ~ 99999)。
 * @throws 超出范围 / 非整数时抛错
 */
export function numberToChinese(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99999) {
    throw new Error(`numberToChinese 仅支持 0~99999 的整数,收到 ${n}`);
  }
  if (n === 0) return "零";
  if (n < 10000) return sectionToChinese(n);

  const high = Math.floor(n / 10000);
  const low = n % 10000;
  let out = DIGITS[high]! + "万";
  if (low > 0) {
    // 低位不足四位数时,中间必须补一个"零":10001 → 一万零一
    if (low < 1000) out += "零";
    out += sectionToChinese(low);
  }
  return out;
}

/**
 * 中文 → 数字(0 ~ 9999)。
 *
 * 支持的形式:
 *  - 个位:"一" ~ "九"(0 写作"零";口语"两"作"二"别名)
 *  - 十位:"十"=10、"十二"、"二十"、"二十一"
 *  - 百位/千位:同 `numberToChinese` 段内格式,允许"零"穿插("一百零一"=101)
 *
 * 不识别(返回 null,让调用方原样保留):
 *  - 含非中文数字字符(混入阿拉伯数字、英文、符号)
 *  - 含"万"以上段位(地址场景不需要)
 *  - 空串 / 纯空白
 *
 * 注意:输入"零"返回 0;"空"返回 null。
 */
export function chineseToNumber(text: string): number | null {
  const raw = text.trim();
  if (!raw) return null;
  // 含"万"及以上 / 含阿拉伯数字 / 含非汉字符号 → 一律不识别
  // (允许的字符集:零一二三四五六七八九十百千两)
  if (!/^[零一二三四五六七八九十百千两]+$/.test(raw)) return null;

  let total = 0;
  let section = 0; // 当前段(0~9999)累加值
  let currentDigit = 0;

  for (const ch of raw) {
    if (ch in DIGIT_MAP) {
      currentDigit = DIGIT_MAP[ch]!;
      continue;
    }
    if (ch in UNIT_MAP) {
      const unit = UNIT_MAP[ch]!;
      // "十" / "百" / "千" 单独出现(无系数)默认按 1 计:"十"=10、"一百"=100
      const digit = currentDigit === 0 ? 1 : currentDigit;
      section += digit * 10 ** unit;
      currentDigit = 0;
      continue;
    }
    // 其它字符(理论不会进入,正则已过滤)
    return null;
  }
  total = section + currentDigit;

  // 范围兜底:超出 0~9999 一律视为不识别
  if (!Number.isInteger(total) || total < 0 || total > 9999) return null;
  return total;
}