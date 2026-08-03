/** 会话能力令牌（localStorage）。创建时写入，可变 API / WS 携带。 */

const INTERVIEW_PREFIX = "interviewos:session_token:";
const PREP_PREFIX = "interviewos:prep_token:";

function _save(prefix: string, id: number, token: string): void {
  if (!Number.isFinite(id) || !token) return;
  try {
    localStorage.setItem(`${prefix}${id}`, token);
  } catch {
    /* quota / private mode */
  }
}

function _get(prefix: string, id: number): string | null {
  if (!Number.isFinite(id)) return null;
  try {
    return localStorage.getItem(`${prefix}${id}`);
  } catch {
    return null;
  }
}

export function saveSessionToken(sessionId: number, token: string): void {
  _save(INTERVIEW_PREFIX, sessionId, token);
}

export function getSessionToken(sessionId: number): string | null {
  return _get(INTERVIEW_PREFIX, sessionId);
}

export function savePrepToken(sessionId: number, token: string): void {
  _save(PREP_PREFIX, sessionId, token);
}

export function getPrepToken(sessionId: number): string | null {
  return _get(PREP_PREFIX, sessionId);
}

/** 构造携带令牌的 WebSocket 子协议（避免 token 进 query/日志）。 */
export function wsTokenSubprotocol(token: string): string {
  return `interviewos.${token}`;
}

export function interviewAuthHeaders(sessionId: number): Record<string, string> {
  const token = getSessionToken(sessionId);
  return token ? { "X-Interview-Token": token } : {};
}

export function prepAuthHeaders(sessionId: number): Record<string, string> {
  const token = getPrepToken(sessionId);
  return token ? { "X-Interview-Token": token } : {};
}
