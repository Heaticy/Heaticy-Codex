/**
 * In-memory live session registry with Map-compatible helpers.
 *
 * Example:
 * const registry = new SessionRegistry();
 * registry.set(session.id, session);
 */
export class SessionRegistry {
  constructor({ ttlMs = 0 } = {}) {
    this.sessions = new Map();
    this.ttlMs = ttlMs;
  }

  get size() {
    return this.sessions.size;
  }

  get(id) {
    return this.sessions.get(id) || null;
  }

  set(id, session) {
    this.sessions.set(id, session);
    return this;
  }

  delete(id) {
    return this.sessions.delete(id);
  }

  clear() {
    this.sessions.clear();
  }

  values() {
    return this.sessions.values();
  }

  entries() {
    return this.sessions.entries();
  }

  [Symbol.iterator]() {
    return this.sessions[Symbol.iterator]();
  }

  pruneExpired(now = Date.now()) {
    if (!this.ttlMs) {
      return 0;
    }
    let removed = 0;
    for (const [id, session] of this.sessions.entries()) {
      const updatedAt = Date.parse(session.updatedAt || session.createdAt || "");
      if (Number.isFinite(updatedAt) && now - updatedAt > this.ttlMs) {
        this.sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}
