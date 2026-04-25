/**
 * Broadcast helper for WebSocket session clients.
 *
 * Example:
 * const bus = new MessageBus();
 * bus.broadcast(session, { type: "session_updated" });
 */
export class MessageBus {
  broadcast(session, payload) {
    for (const client of session.clients || []) {
      try {
        client.send(JSON.stringify(payload));
      } catch {
        // Ignore transient websocket send failures.
      }
    }
  }
}
