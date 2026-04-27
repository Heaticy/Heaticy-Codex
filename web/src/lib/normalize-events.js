function makeId(prefix = "part") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function asText(value) {
  return String(value ?? "").trim();
}

function safeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeKind(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isRenderableImageUrl(url) {
  const value = String(url || "").trim();
  if (!value) {
    return false;
  }
  return (
    /^data:image\//i.test(value) ||
    /^https?:\/\//i.test(value) ||
    /^blob:/i.test(value) ||
    value.startsWith("/uploads/") ||
    value.startsWith("/api/")
  );
}

function collectText(node) {
  if (node == null) {
    return [];
  }
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return [String(node)];
  }
  if (Array.isArray(node)) {
    return node.flatMap((item) => collectText(item));
  }
  if (typeof node !== "object") {
    return [];
  }

  const out = [];
  for (const key of [
    "summary",
    "text",
    "message",
    "title",
    "description",
    "command",
    "tool_name",
    "toolName",
    "path",
    "status",
    "phase",
    "result",
    "output",
    "reasoning",
    "value",
    "content",
    "payload"
  ]) {
    if (key in node) {
      out.push(...collectText(node[key]));
    }
  }
  return out;
}

function summarizeNode(node, maxLen = 220) {
  const text = collectText(node)
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }
  return text.length <= maxLen ? text : `${text.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`;
}

function eventPartTypeForRaw(rawType, fallback = "command_output") {
  const kind = normalizeKind(rawType);
  if (kind.includes("reasoning")) {
    return "reasoning";
  }
  if (kind.includes("commandexecution")) {
    return kind.includes("updated") || kind.includes("output") ? "command_output" : "command_exec";
  }
  if (kind.includes("filechange")) {
    return "file_change";
  }
  if (kind.includes("mcptool") || kind.includes("toolcall") || kind.includes("tool")) {
    return "mcp_tool_call";
  }
  if (kind.includes("todolist") || kind.includes("plan")) {
    return "plan_update";
  }
  if (kind.includes("error")) {
    return "error";
  }
  return fallback;
}

function visibleChatRole(value) {
  const role = asText(value).toLowerCase();
  if (role === "user" || role === "assistant" || role === "system") {
    return role;
  }
  return "";
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
  const rawType = asText(part.rawType || payload?.kind || part.kind || part.type || "message_part");
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

  if (partType === "image") {
    if (!isRenderableImageUrl(part.url)) {
      return [];
    }
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

  if (["tool", "subagent", "reference", "event"].includes(partType)) {
    const text = asText(part.text || part.summary) || summarizeNode(part.payload || part, 280) || rawType;
    if (!text) {
      return [];
    }
    const eventType = eventPartTypeForRaw(rawType || partType);
    return [
      createUiPart({
        sessionId,
        role: eventType === "error" ? "system" : role || "assistant",
        partType: eventType,
        payload: {
          text,
          item: safeObject(part.payload || part.item || part),
          rawType
        },
        ts,
        phase: asText(payload?.phase) || "final",
        source: "message_part",
        rawType
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
  const rawKind = normalizeKind(rawType);
  const text = asText(msg.message || msg.text);

  switch (rawKind) {
    case "user_message":
    case "usermessage":
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
    case "agentmessage": {
      const phase = asText(msg.phase).toLowerCase();
      if (!text) {
        return [];
      }
      if (phase && phase !== "final_answer" && phase !== "commentary") {
        const eventType = eventPartTypeForRaw(phase || rawType);
        return [
          createUiPart({
            sessionId,
            role: eventType === "error" ? "system" : "assistant",
            partType: eventType,
            payload: { text, phase },
            phase: "final",
            source: "event_msg",
            rawType
          })
        ];
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
    }
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
  const rawKind = normalizeKind(rawType);
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
  if (rawKind && rawKind !== "agentmessage" && rawKind !== "usermessage" && rawKind !== "user") {
    const eventType = eventPartTypeForRaw(rawType);
    const summary = text || summarizeNode(item, 280) || rawType;
    if (!summary) {
      return [];
    }
    return [
      createUiPart({
        sessionId,
        role: eventType === "error" ? "system" : role,
        partType: eventType,
        payload: {
          text: summary,
          item,
          rawType
        },
        ts,
        phase: asText(item?.phase || payload?.phase) || "final",
        source: "response_item",
        rawType
      })
    ];
  }
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
