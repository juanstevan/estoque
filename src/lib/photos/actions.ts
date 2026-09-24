import {
  addAssets,
  coverAsset,
  removeAsset,
  retagAsset,
  type AssetInput,
  type Owner,
} from "./service";

export type AssetBody = {
  action?: string;
  photos?: AssetInput[];
  photoId?: string;
  tag?: string;
};

/** add / tag / cover / delete, shared by the product and group asset routes. */
export async function assetAction(owner: Owner, body: AssetBody) {
  if (body.action === "add") return addAssets(owner, body.photos ?? []);
  if (!body.photoId) throw new Error("photoId is required");
  if (body.action === "tag") return { photos: await retagAsset(owner, body.photoId, body.tag ?? "") };
  if (body.action === "cover") return { photos: await coverAsset(owner, body.photoId) };
  if (body.action === "delete") return { photos: await removeAsset(owner, body.photoId) };
  throw new Error("Unknown action");
}
