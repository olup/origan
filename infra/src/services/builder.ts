// Re-export builder image from centralized bake build
// All images are built in parallel with shared cache in images.ts
import { builderImage } from "../core/images.js";

export { builderImage };

// Export the immutable image reference for use by control-api
export const builderImageUrl = builderImage.repoDigest;
