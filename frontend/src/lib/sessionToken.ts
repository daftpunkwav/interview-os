/** 会话能力令牌辅助。

令牌由后端经 HttpOnly Cookie 下发，前端 JS 不可读。
本模块仅保留 WebSocket 子协议 helper（兼容旧连接）。
*/

/** 构造携带令牌的 WebSocket 子协议（避免 token 进 query/日志）。 */
export function wsTokenSubprotocol(token: string): string {
  return `interviewos.${token}`;
}
