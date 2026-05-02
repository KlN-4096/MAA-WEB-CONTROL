(function (global) {
  const registry = Object.create(null);
  let nextSequence = 0;

  function normalizeFeature(id, feature) {
    if (typeof id !== "string" || !id || !feature || typeof feature !== "object") return null;
    const order = Number.isFinite(Number(feature.order)) ? Number(feature.order) : 1000;
    return { ...feature, id, order };
  }

  function orderedFeatures() {
    return Object.values(registry).sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return left.sequence - right.sequence;
    });
  }

  const api = {
    register(id, feature) {
      const normalized = normalizeFeature(id, feature);
      if (!normalized) return null;
      normalized.sequence = registry[normalized.id]?.sequence ?? nextSequence;
      if (!registry[normalized.id]) nextSequence += 1;
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
    action(id, actionName, payload, context) {
      const feature = this.get(id);
      const method = feature?.actions?.[actionName];
      if (typeof method !== "function") return undefined;
      return method.call(feature, payload, context);
    },
    actions(id) {
      const actions = this.get(id)?.actions;
      return actions && typeof actions === "object" ? Object.keys(actions) : [];
    },
    command(id, commandName, payload, context) {
      return this.action(id, commandName, payload, context);
    },
    commands(id) {
      return this.actions(id);
    },
    firstId() {
      return orderedFeatures()[0]?.id || "";
    },
    list() {
      return orderedFeatures();
    }
  };

  global.MaaFeatures = api;
})(window);
