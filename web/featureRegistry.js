(function (global) {
  const registry = Object.create(null);

  function normalizeFeature(id, feature) {
    if (typeof id !== "string" || !id || !feature || typeof feature !== "object") return null;
    return { ...feature, id };
  }

  const api = {
    register(id, feature) {
      const normalized = normalizeFeature(id, feature);
      if (!normalized) return null;
      registry[normalized.id] = normalized;
      return normalized;
    },
    get(id) {
      return registry[id] || null;
    },
    has(id) {
      return Object.prototype.hasOwnProperty.call(registry, id);
    },
    title(id) {
      const feature = this.get(id);
      return typeof feature?.title === "string" ? feature.title : "";
    },
    render(id, context) {
      const feature = this.get(id);
      const method = feature?.render;
      if (typeof method !== "function") return undefined;
      return method.call(feature, context);
    },
    wire(id, context) {
      const feature = this.get(id);
      const method = feature?.wire;
      if (typeof method !== "function") return undefined;
      return method.call(feature, context);
    },
    call(id, methodName, ...args) {
      const feature = this.get(id);
      const method = feature?.[methodName];
      if (typeof method !== "function") return undefined;
      return method.apply(feature, args);
    },
    list() {
      return Object.values(registry);
    }
  };

  global.MaaFeatures = api;
})(window);
