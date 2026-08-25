/**
 * envelope transformer:在 SuperJSON 之上包一层 envelope。
 *
 * 服务端:
 *   output.serialize(bizData) → { code: 0, msg: "ok", data: <super-serialized bizData> }
 *   input.deserialize(envelope) → bizData
 *
 * 客户端:
 *   output.deserialize(envelope) → bizData  (自动解包,调用站点无感知)
 *   input.serialize(bizData) → bizData     (不变,发请求时不需要 envelope)
 *
 * 实现要点:
 *   - 双向:serialize 时包 envelope,deserialize 时解 envelope
 *   - 输入/输出时判断"是 envelope 形态就解,否则透传"——支持过渡期
 *   - 错误路径: tRPC 的 transformer 只处理 data 字段;error 走 errorFormatter
 *
 * 配合 envelopeLink 解错误:成功路径由 transformer 解包,失败路径由 link 转 ApiError。
 */

import type { CombinedDataTransformer } from "@trpc/server";
import SuperJSON from "superjson";

/** 简单 envelope 形态判断 */
function isEnvelopeOk(value: unknown): value is { code: 0; data: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value as { code?: unknown }).code === 0 &&
    "data" in value
  );
}

/** 判断对象是否为 SuperJSON 序列化产物({ json, meta } 结构) */
function isSuperJsonShape(value: unknown): value is { json: unknown; meta?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "json" in value
  );
}

/**
 * 把外层 transformer(SuperJSON)包成 envelope 形态。
 */
/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
export function envelopeTransformer(
  inner: CombinedDataTransformer,
): CombinedDataTransformer {
  return {
    input: {
      serialize: (object: any) => inner.input.serialize(object),
      deserialize: (object: any) => inner.input.deserialize(object),
    },
    output: {
      serialize: (object: any) => ({
        code: 0,
        msg: "ok",
        data: inner.output.serialize(object),
      }),
      deserialize: (object: any) => {
        // 成功 envelope:{ code:0, msg:"ok", data:<superjson> } → 取 data 再解 superjson
        if (isEnvelopeOk(object)) {
          return inner.output.deserialize(object.data);
        }
        // 错误响应(TRPCErrorResponse / 连接消息)等非 envelope 对象:
        // - 若是 superjson 产物则正常解
        // - 否则原样透传(不能裸调 SuperJSON.deserialize,它会把无 json 字段的对象吞成 undefined)
        if (isSuperJsonShape(object)) {
          return inner.output.deserialize(object);
        }
        return object;
      },
    },
  };
}

/**
 * 共享的 SuperJSON + envelope 组合 transformer。
 * 服务端(initTRPC.create)与客户端(httpBatchLink)必须用同一个实例,
 * 否则服务端包了 envelope 而客户端解不开,React Query 永远拿不到 data → 一直 loading。
 */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
export const superjsonEnvelopeTransformer = envelopeTransformer({
  input: {
    serialize: (object: any) => SuperJSON.serialize(object),
    deserialize: (object: any) => SuperJSON.deserialize(object),
  },
  output: {
    serialize: (object: any) => SuperJSON.serialize(object),
    deserialize: (object: any) => SuperJSON.deserialize(object),
  },
});
/* eslint-enable @typescript-eslint/no-unsafe-argument */