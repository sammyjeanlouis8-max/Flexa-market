/**
 * Shared cache for the auth globe flag atlas.
 * downloadAsync runs once; subsequent mounts reuse the same Expo Asset.
 */
import { Asset } from "expo-asset";

let assetPromise: Promise<Asset> | null = null;
let cachedAsset: Asset | null = null;

export function getFlagAtlasAsset(): Promise<Asset> {
  if (cachedAsset?.localUri) {
    return Promise.resolve(cachedAsset);
  }
  if (!assetPromise) {
    assetPromise = (async () => {
      const asset = Asset.fromModule(
        require("../assets/images/auth-globe-flags.jpg"),
      );
      await asset.downloadAsync();
      cachedAsset = asset;
      return asset;
    })().catch((err) => {
      // Allow a later retry if the first download fails.
      assetPromise = null;
      throw err;
    });
  }
  return assetPromise;
}

/** Warm the atlas during idle time so Login does not wait on first paint. */
export function prefetchFlagAtlas(): void {
  void getFlagAtlasAsset().catch(() => {});
}

export function __resetGlobeAssetCacheForTests() {
  assetPromise = null;
  cachedAsset = null;
}
