/**
 * 地址模拟器候选池最小种子(P0-5)。
 *
 * 背景:road/community/village/poi 四表默认全空,导致 addr-sim 候选池返回空数组。
 *       merged 模式下即使有 customValue 兜底,randomValue 路径仍空,生成结果偏窄。
 *
 * 本脚本为四表各 upsert ~10 条真实命名风格的数据,保证 addr-sim 候选池
 * "开箱即用",无需用户先手动录入。同时保持幂等:已存在则跳过,不污染现有数据。
 *
 * 用法:pnpm tsx scripts/seed-addr-sim-candidates.ts
 *
 * 命名风格参考 name-corpus.ts 的词典:
 *  - 道路:阳光大道、翠湖路、人民东路、新华路 等
 *  - 小区:阳光花园、金色家园、锦江苑 等
 *  - 村:王泥浜村、华漕村、新华村 等
 *  - POI:中心广场、华山医院、市立图书馆 等
 */

import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

const url = new URL(process.env.DATABASE_URL!);
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 5,
});
const db = new PrismaClient({ adapter });

/** 种子数据:每表 10 条 */
const ROADS = [
  "阳光大道", "翠湖路", "人民东路", "新华路", "中山路",
  "和平大道", "建国路", "解放路", "广元路", "长宁路",
];

const COMMUNITIES = [
  "阳光花园", "金色家园", "锦江苑", "翠湖小区", "新华家园",
  "和平公寓", "嘉园小区", "盛世家园", "明华苑", "东方花苑",
];

const VILLAGES = [
  "王泥浜村", "华漕村", "新华村", "和平村", "建国村",
  "解放村", "长宁村", "中山村", "广元村", "翠湖村",
];

const POIS = [
  "中心广场", "华山医院", "市立图书馆", "市民公园", "阳光大厦",
  "锦江商城", "和平体育馆", "新华书店", "东方影城", "翠湖宾馆",
];

/**
 * 按名称幂等 upsert:已存在则跳过(不更新任何字段,保留用户后续编辑)。
 * 返回成功写入的条数(新创建 + 跳过的总数)。
 */
async function seedRoads(): Promise<number> {
  let count = 0;
  for (const road of ROADS) {
    const exists = await db.road.findFirst({ where: { road } });
    if (exists) {
      count++;
      continue;
    }
    await db.road.create({ data: { road, status: 1 } });
    count++;
  }
  return count;
}

async function seedCommunities(): Promise<number> {
  let count = 0;
  for (const name of COMMUNITIES) {
    const exists = await db.community.findFirst({ where: { name } });
    if (exists) {
      count++;
      continue;
    }
    await db.community.create({ data: { name, status: 1 } });
    count++;
  }
  return count;
}

async function seedVillages(): Promise<number> {
  let count = 0;
  for (const name of VILLAGES) {
    const exists = await db.village.findFirst({ where: { name } });
    if (exists) {
      count++;
      continue;
    }
    await db.village.create({ data: { name, status: 1 } });
    count++;
  }
  return count;
}

async function seedPois(): Promise<number> {
  let count = 0;
  for (const name of POIS) {
    const exists = await db.poi.findFirst({ where: { name } });
    if (exists) {
      count++;
      continue;
    }
    await db.poi.create({ data: { name, status: 1 } });
    count++;
  }
  return count;
}

async function main() {
  console.log("开始播种 addr-sim 候选池...");

  const [roadN, communityN, villageN, poiN] = await Promise.all([
    seedRoads(),
    seedCommunities(),
    seedVillages(),
    seedPois(),
  ]);

  console.log(`✓ road: ${roadN} 条`);
  console.log(`✓ community: ${communityN} 条`);
  console.log(`✓ village: ${villageN} 条`);
  console.log(`✓ poi: ${poiN} 条`);
  console.log("addr-sim 候选池播种完成(幂等,已存在项自动跳过)。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
