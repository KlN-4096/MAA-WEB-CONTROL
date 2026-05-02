const MaaStorage = (() => {
  function get(key, fallback = null) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }

  function readObject(key, fallback = {}) {
    try {
      const parsed = JSON.parse(get(key, ""));
      return isObject(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function writeObject(key, value) {
    set(key, JSON.stringify(value));
  }

  function pick(source, fields) {
    const result = {};
    fields.forEach((field) => { result[field] = source[field]; });
    return result;
  }

  function copyString(source, target, field) {
    if (typeof source[field] === "string") target[field] = source[field];
  }

  function copyBoolean(source, target, field) {
    if (typeof source[field] === "boolean") target[field] = source[field];
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  return { get, set, readObject, writeObject, pick, copyString, copyBoolean, isObject };
})();
