function makeId(prefix = "part") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function asText(value) {
  return String(value ?? "").trim();
}

function safeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function visibleChatRole(value) {
  const role = asText(value).toLowerCase();
  if (role === "user" || role === "assistant" || role === "system") {
    return role;
  }
  return "";
}

function isInternalItemType(value) {
  const type = asText(value).replace(/[._/-]/g, "").toLowerCase();
  return (
    !type ||
    type.includes("commandexecution") ||
    type.includes("filechange") ||
    type.includes("tool") ||
    type.includes("reasoning") ||
    type.includes("tokenusage") ||
    type.includes("approval") ||
    type.includes("status")
  );
}

export function createUiPart({
  sessionId = "",
  role = "assistant",
  partType = "unknown",
  payload = {},
  ts = new Date().toISOString(),
  phase = "final",
  source = "legacy_data",
  rawType = ""
} = {}) {
  return {
    id: makeId("ui"),
    sessionId,
    role,
    partType,
    payload: safeObject(payload),
    ts,
    phase,
    source,
    rawType
  };
}

export function normalizeLegacyDataEvent(payload, sessionId = "") {
  const text = String(payload?.data || "");
  if (!text.trim()) {
    return [];
  }
  return [
    createUiPart({
      sessionId,
      role: "assistant",
      partType: "markdown",
      payload: { text },
      phase: "streaming",
      source: "legacy_data",
      rawType: "data"
    })
  ];
}

export function normalizeMessagePartEvent(payload, sessionId = "") {
  const part = safeObject(payload?.part);
  const role = visibleChatRole(payload?.role || "assistant");
  const partType = asText(part.type);
  const ts = asText(payload?.timestamp) || new Date().toISOString();

  if (!role) {
    return [];
  }

  if ((partType === "text" || partType === "markdown") && asText(part.text)) {
    return [
      createUiPart({
        sessionId,
        role,
        partType: "markdown",
        payload: {
          text: asText(part.text)
        },
        ts,
        phase: asText(payload?.phase) || "streaming",
        source: "message_part",
        rawType: "message_part"
      })
    ];
  }

  if (partType === "event" && asText(part.kind)) {
    return [
      createUiPart({
        sessionId,
        role: role || "assistant",
        partType: asText(part.kind),
        payload: {
          kind: asText(part.kind),
          text: String(part.text || ""),
          item: safeObject(part.item)
        },
        ts,
        phase: asText(payload?.phase) || "final",
        source: "message_part",
        rawType: asText(payload?.kind) || "message_part"
      })
    ];
  }

  if (partType === "image" && asText(part.url)) {
    return [
      createUiPart({
        sessionId,
        role,
        partType: "image",
        payload: {
          url: asText(part.url),
          alt: asText(part.alt) || "image"
        },
        ts,
        phase: "final",
        source: "message_part",
        rawType: "message_part"
      })
    ];
  }

  return [
    createUiPart({
      sessionId,
      role,
      partType: "unknown",
      payload: { raw: payload },
      ts,
      phase: "final",
      source: "message_part",
      rawType: "message_part"
    })
  ];
}

function normalizeEventMsgPayload(eventMsg, sessionId = "") {
  const msg = safeObject(eventMsg);
  const rawType = asText(msg.type) || "event_msg";
  const text = asText(msg.message || msg.text);

  switch (rawType) {
    case "user_message":
      if (!text) {
        return [];
      }
      return [
        createUiPart({
          sessionId,
          role: "user",
          partType: "text",
          payload: { text },
          phase: "final",
          source: "event_msg",
          rawType
        })
      ];
    case "agent_message":
      if (asText(msg.phase) && asText(msg.phase).toLowerCase() !== "final_answer") {
        return [];
      }
      if (!text) {
        return [];
      }
      return [
        createUiPart({
          sessionId,
          role: "assistant",
          partType: "markdown",
          payload: { text },
          phase: "final",
          source: "event_msg",
          rawType
        })
      ];
    case "error":
    case "warning":
      return [
        createUiPart({
          sessionId,
          role: "system",
          partType: "error",
          payload: msg,
          source: "event_msg",
          rawType
        })
      ];
    default:
      return [];
  }
}

function normalizeResponseItemPayload(payload, sessionId = "") {
  const item = safeObject(payload?.item || payload);
  const ts = asText(item?.timestamp || payload?.timestamp) || new Date().toISOString();
  const rawType = asText(item?.type || payload?.type || "response_item");
  if (isInternalItemType(rawType)) {
    return [];
  }
  const role = visibleChatRole(item?.role || payload?.role || (rawType === "user_message" ? "user" : "assistant"));
  if (!role) {
    return [];
  }

  const collectText = (node) => {
    if (node == null) {
      return [];
    }
    if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
      return [String(node)];
    }
    if (Array.isArray(node)) {
      return node.flatMap((child) => collectText(child));
    }
    if (typeof node !== "object") {
      return [];
    }

    const directText = asText(node.text || node.message || node.value);
    const nested = [
      ...collectText(node.content),
      ...collectText(node.output),
      ...collectText(node.result),
      ...collectText(node.parts)
    ];
    return [directText, ...nested].filter(Boolean);
  };

  const text = collectText(item).join("\n").trim();
  if (!text) {
    return [];
  }

  return [
    createUiPart({
      sessionId,
      role,
      partType: "markdown",
      payload: { text },
      ts,
      phase: asText(item?.phase || payload?.phase) || "final",
      source: "response_item",
      rawType
    })
  ];
}

export function normalizeServerPayload(payload, sessionId = "") {
  const type = asText(payload?.type);
  if (!type) {
    return [];
  }
  if (type === "data") {
    return normalizeLegacyDataEvent(payload, sessionId);
  }
  if (type === "message_part") {
    return normalizeMessagePartEvent(payload, sessionId);
  }
  if (type === "event_msg") {
    return normalizeEventMsgPayload(payload?.payload || payload?.msg || payload, sessionId);
  }
  if (type === "response_item") {
    return normalizeResponseItemPayload(payload?.payload || payload, sessionId);
  }
  return [];
}
