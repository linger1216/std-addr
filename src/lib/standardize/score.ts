/**
 * 标准地址库 · 完整度评分(0-10,纯函数,可测)。
 *
 * 从旧架构 standardizeService.#calcScore 迁移,评分体系:
 *  - 行政:居委3 / 街道镇2 / 区县1
 *  - 有路弄:路+2 弄+2 号+2 楼栋+1
 *  - 无路无村(小区/POI/子区域):+4 楼栋+1
 *  - 农村:村+3 宅/队/组任一+2
 *  - 室号+1、方向+1,上限 10
 */
import { firstNonEmpty, type StdFields } from "./build";

/** 计算地址标准化完整度评分(0-10) */
export function calcScore(fields: StdFields): number {
  let total = 0;

  // 1. 行政划分评分(居委=3,街镇=2,区县=1)
  if (fields.neighborhood) {
    total += 3;
  } else if (firstNonEmpty(fields.street, fields.town)) {
    total += 2;
  } else if (fields.district) {
    total += 1;
  }

  // 2. 地址类型分支
  const hasRoad = Boolean(
    firstNonEmpty(fields.road, fields.lane, fields.number),
  );
  const hasRural = !!fields.village;

  if (hasRoad) {
    if (fields.road) total += 2; // 路名
    if (fields.lane) total += 2; // 弄号
    if (fields.number) total += 2; // 路号
    if (fields.building) total += 1; // 楼栋
  } else if (!hasRoad && !hasRural && (fields.community || fields.poi || fields.subarea)) {
    if (fields.community || fields.poi || fields.subarea) total += 4;
    if (fields.building) total += 1;
  } else if (hasRural) {
    total += fields.village ? 3 : 0;
    if (fields.zhai || fields.team || fields.group) total += 2;
  }

  // 室号 +1(通用)
  if (fields.room) total += 1;
  // 方向 +1
  if (fields.direction) total += 1;

  return Math.min(total, 10);
}

/** 评分明细(用于前端展示"得分的构成") */
export function formatScoreDetail(score: number, fields: StdFields): string[] {
  const lines: string[] = [];

  if (fields.neighborhood) {
    lines.push(`居委：${fields.neighborhood} (+3)`);
  } else if (firstNonEmpty(fields.street, fields.town)) {
    lines.push(`街镇：${firstNonEmpty(fields.street, fields.town)} (+2)`);
  } else if (fields.district) {
    lines.push(`区：${fields.district} (+1)`);
  } else {
    lines.push("行政划分：无");
  }

  const hasRoad = Boolean(
    firstNonEmpty(fields.road, fields.lane, fields.number),
  );
  const hasRural = !!fields.village;

  if (hasRoad) {
    if (fields.road) lines.push(`路：${fields.road} (+2)`);
    if (fields.lane) lines.push(`弄：${fields.lane} (+2)`);
    if (fields.number) lines.push(`路号：${fields.number} (+2)`);
    if (fields.sub_lane) lines.push(`支弄：${fields.sub_lane}`);
    if (fields.alley) lines.push(`巷：${fields.alley}`);
    if (fields.building) lines.push(`楼栋：${fields.building} (+1)`);
  } else if (!hasRural) {
    if (fields.community) lines.push(`小区：${fields.community} (+4)`);
    if (fields.poi) lines.push(`POI：${fields.poi} (+4)`);
    if (fields.subarea) lines.push(`子区域：${fields.subarea} (+4)`);
    if (fields.building) lines.push(`楼栋：${fields.building} (+1)`);
  } else if (hasRural) {
    if (fields.village) lines.push(`村：${fields.village} (+3)`);
    if (fields.zhai) lines.push(`宅：${fields.zhai}`);
    if (fields.team) lines.push(`队：${fields.team}`);
    if (fields.group) lines.push(`组：${fields.group}`);
    if (fields.zhai || fields.team || fields.group) {
      lines[lines.length - 1] = `${lines[lines.length - 1]} (+2)`;
    }
  }

  if (fields.room) lines.push(`室号：${fields.room} (+1)`);
  if (fields.direction) lines.push(`方向：${fields.direction} (+1)`);
  lines.push(`\n得分：${score} / 10`);
  return lines;
}