const FORMAT_PREFERENCE = ['ogg', 'm4a'];

export function formatOrder(files) {
  return FORMAT_PREFERENCE.filter((format) => format in files);
}

export function findAsset(manifest, id) {
  return manifest.assets.find((asset) => asset.id === id);
}
