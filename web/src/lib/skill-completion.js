const MAX_QUERY_LENGTH = 80;
const SKILL_TOKEN_RE = /^\$(?:[a-z0-9][a-z0-9:_-]*)?$/i;

function normalize(value) {
  return String(value || "")
    .trim()
    .replace(/^\$+/, "")
    .toLowerCase();
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function findSkillToken(text, cursor) {
  const value = String(text || "");
  const end = Math.max(0, Math.min(Number(cursor) || 0, value.length));
  let start = end;
  while (start > 0 && !/\s/.test(value[start - 1])) {
    start -= 1;
  }
  const raw = value.slice(start, end);
  if (!raw.startsWith("$") || raw.length > MAX_QUERY_LENGTH || !SKILL_TOKEN_RE.test(raw)) {
    return null;
  }
  const query = raw.slice(1);
  if (query && (/^\d/.test(query) || /^[A-Z0-9_]+$/.test(query))) {
    return null;
  }
  return { start, end, query, raw };
}

function candidateTerms(skill) {
  return unique([skill?.name, ...(skill?.aliases || [])]).map((term) => normalize(term));
}

function descriptionMatches(skill, query) {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 3) {
    return false;
  }
  return normalize(skill?.description).includes(normalizedQuery);
}

export function filterSkillCompletions(skills, query, limit = 5) {
  const normalizedQuery = normalize(query);
  return [...(skills || [])]
    .filter(
      (skill) =>
        !normalizedQuery ||
        candidateTerms(skill).some((term) => term.includes(normalizedQuery)) ||
        descriptionMatches(skill, normalizedQuery)
    )
    .sort((left, right) => {
      const leftName = normalize(left.name);
      const rightName = normalize(right.name);
      const leftAlias = (left.aliases || []).some((alias) => normalize(alias).startsWith(normalizedQuery));
      const rightAlias = (right.aliases || []).some((alias) => normalize(alias).startsWith(normalizedQuery));
      const leftPrefix = leftName.startsWith(normalizedQuery) || leftAlias ? 0 : 1;
      const rightPrefix = rightName.startsWith(normalizedQuery) || rightAlias ? 0 : 1;
      if (leftPrefix !== rightPrefix) {
        return leftPrefix - rightPrefix;
      }
      return leftName.localeCompare(rightName);
    })
    .slice(0, limit);
}

export function applySkillCompletion(text, cursor, skill) {
  const value = String(text || "");
  const token = findSkillToken(value, cursor);
  if (!token || !skill?.name) {
    return { text: value, cursor: Math.max(0, Math.min(Number(cursor) || 0, value.length)) };
  }
  const replacement = `$${skill.name}`;
  const nextText = `${value.slice(0, token.start)}${replacement}${value.slice(token.end)}`;
  return {
    text: nextText,
    cursor: token.start + replacement.length
  };
}

function resolveAlias(token, skills) {
  const normalized = normalize(token);
  if (!normalized || (skills || []).some((skill) => normalize(skill.name) === normalized)) {
    return token;
  }
  const matches = (skills || []).filter((skill) => (skill.aliases || []).some((alias) => normalize(alias) === normalized));
  if (matches.length !== 1) {
    return token;
  }
  return `$${matches[0].name}`;
}

export function normalizeSkillAliases(text, skills) {
  return String(text || "").replace(/\$[a-z0-9][a-z0-9:_-]*/gi, (token) => {
    if (!SKILL_TOKEN_RE.test(token)) {
      return token;
    }
    const query = token.slice(1);
    if (/^\d/.test(query) || /^[A-Z0-9_]+$/.test(query)) {
      return token;
    }
    return resolveAlias(token, skills);
  });
}
