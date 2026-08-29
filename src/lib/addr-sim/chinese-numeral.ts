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