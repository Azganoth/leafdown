import type { EditorView } from "@milkdown/kit/prose/view";

export interface ImageGrant {
  target: string;
  allowOutsideFolder: boolean;
  remoteImage: ArrayBuffer | null;
}

/** What the author has explicitly approved for the images a document shows, by target. */
export interface ImageGrants {
  outsideFolderTargets: ReadonlySet<string>;
  remoteImages: ReadonlyMap<string, ArrayBuffer>;
}

export const NO_IMAGE_GRANTS: ImageGrants = {
  outsideFolderTargets: new Set(),
  remoteImages: new Map(),
};

// Approval belongs to one rendered image, so each image view keeps its own entry and it leaves
// with the view; nothing here outlives the document's editor.
const grantsByView = new WeakMap<EditorView, Map<object, ImageGrant>>();

export const setImageGrant = (view: EditorView, owner: object, grant: ImageGrant) => {
  let grants = grantsByView.get(view);

  if (!grants) {
    grants = new Map();
    grantsByView.set(view, grants);
  }

  grants.set(owner, grant);
};

export const deleteImageGrant = (view: EditorView, owner: object) => {
  grantsByView.get(view)?.delete(owner);
};

export const readImageGrants = (view: EditorView): ImageGrants => {
  const outsideFolderTargets = new Set<string>();
  const remoteImages = new Map<string, ArrayBuffer>();

  for (const grant of grantsByView.get(view)?.values() ?? []) {
    if (grant.allowOutsideFolder) {
      outsideFolderTargets.add(grant.target);
    }

    if (grant.remoteImage) {
      remoteImages.set(grant.target, grant.remoteImage);
    }
  }

  return { outsideFolderTargets, remoteImages };
};
