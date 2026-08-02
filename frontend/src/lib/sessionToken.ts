/** 面试会话能力令牌（localStorage）。创建时写入，可变 API / WS 携带。 */

const PREFIX = "interviewos:session_token:";

export function saveSessionToken(sessionId: number, token: string): void {
  if (!Number.isFinite(sessionId) || !token) return;
  try {
    localStorage.setItem(`${PREFIX}${sessionId}`, token);
  } catch {
    /* quota / private mode */
  }
}

export function getSessionToken(sessionId: number): string | null {
  if (!Number.isFinite(sessionId)) return null;
  try {
    return localStorage.getItem(`${PREFIX}${sessionId}`);
  } catch {
    return null;
  }
}

export function interviewAuthHeaders(sessionId: number): Record<string, string> {
  const token = getSessionToken(sessionId);
  return token ? { "X-Interview-Token": token } : {};
}
