/**
    * Cloudinary legacy cleanup — upload functions removed (all uploads now go to Wasabi).
    * deleteCloudinaryAssets is kept to allow deleting old "cld:" assets still in the database.
    */
    import { v2 as cloudinary } from "cloudinary";

    export function isCloudinaryConfigured(): boolean {
    return !!(process.env["CLOUDINARY_API_KEY"] && process.env["CLOUDINARY_API_SECRET"]);
    }

    if (isCloudinaryConfigured()) {
    cloudinary.config({
      cloud_name: process.env["CLOUDINARY_CLOUD_NAME"] ?? "dvkbgodbk",
      api_key:    process.env["CLOUDINARY_API_KEY"],
      api_secret: process.env["CLOUDINARY_API_SECRET"],
    });
    }

    /**
    * Delete legacy Cloudinary assets by public_id (prefix "cld:" is stripped).
    * Used during cleanup of old tracks that were uploaded before Wasabi migration.
    */
    export async function deleteCloudinaryAssets(
    audioPublicId: string | null | undefined,
    coverPublicId: string | null | undefined,
    ): Promise<void> {
    if (!isCloudinaryConfigured()) return;
    const strip = (id: string | null | undefined) =>
      id ? id.replace(/^cld:/, "") : null;
    const aId = strip(audioPublicId);
    const cId = strip(coverPublicId);
    await Promise.allSettled([
      aId ? cloudinary.uploader.destroy(aId, { resource_type: "video" }) : Promise.resolve(),
      cId ? cloudinary.uploader.destroy(cId, { resource_type: "image" }) : Promise.resolve(),
    ]);
    }
    