/** Publish only provider/model metadata; never forward API keys, auth or provider options. */
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:/+@-]{0,159}$/;
export function validModel(model) {
  return model && typeof model === 'object' && !Array.isArray(model) &&
    typeof model.providerID === 'string' && identifier.test(model.providerID) &&
    typeof model.modelID === 'string' && identifier.test(model.modelID);
}
export function publicModels(response) {
  const connected = new Set(Array.isArray(response?.connected) ? response.connected : []);
  const providers = Array.isArray(response?.all) ? response.all : [];
  const models = [];
  for (const provider of providers) {
    const providerID = provider?.id;
    if (typeof providerID !== 'string' || !identifier.test(providerID) || !connected.has(providerID)) continue;
    const entries = provider.models && typeof provider.models === 'object' ? Object.entries(provider.models) : [];
    for (const [modelID, info] of entries) {
      if (!identifier.test(modelID)) continue;
      const model = { providerID, modelID, name: String(info?.name || modelID).slice(0, 120), providerName: String(provider.name || providerID).slice(0, 80) };
      models.push(model);
      if (models.length >= 300) break;
    }
    if (models.length >= 300) break;
  }
  return models.sort((a, b) => a.providerName.localeCompare(b.providerName) || a.name.localeCompare(b.name));
}
export function isModelAvailable(models, selected) {
  return validModel(selected) && models.some(model => model.providerID === selected.providerID && model.modelID === selected.modelID);
}
