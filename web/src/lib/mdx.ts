/**
 * Helpers for the game's MDX models once war3-model has parsed them: skins and tangents for the HD shader, poses, extents
 * and textures. The models are all version 1800; wc3-dev's fork of war3-model reads its cameras, lights and skins.
 */

/** The parts of a parsed geoset (war3-model's) that `skinGeosets` reads and sets. */
export type Skinnable = {
  Vertices: ArrayLike<number>;
  Normals: ArrayLike<number>;
  VertexGroup: ArrayLike<number>;
  Groups: readonly (readonly number[])[];
  SkinWeights?: Uint8Array;
  Tangents?: Float32Array;
};

/**
 * Turns each bone number of the geosets' skins from the geoset's own list of bones (its matrix groups) into the model's.
 * When any geoset has a skin, war3-model draws every geoset of the model as HD, so a geoset without one (a Classic part
 * in an HD model) gets one made from its vertex groups, and tangents when it has none. Returns whether the model has
 * skins.
 */
export function skinGeosets(geosets: Skinnable[]): boolean {
  geosets.forEach((geoset) => {
    const skin = geoset.SkinWeights;
    if (!skin || skin.length !== (geoset.Vertices.length / 3) * 8) return;
    const turned = new Uint8Array(skin);
    for (let i = 0; i < turned.length; i += 8) {
      for (let j = 0; j < 4; j++) {
        const bone = geoset.Groups[turned[i + j] ?? 0]?.[0];
        if (bone !== undefined) turned[i + j] = Math.min(255, bone);
      }
    }
    geoset.SkinWeights = turned;
  });
  if (!geosets.some((geoset) => geoset.SkinWeights?.length)) return false;
  for (const geoset of geosets) {
    const count = geoset.Vertices.length / 3;
    if (geoset.SkinWeights?.length !== count * 8) geoset.SkinWeights = groupSkin(geoset, count);
    if (geoset.Tangents?.length !== count * 4) geoset.Tangents = tangents(geoset.Normals, count);
  }
  return true;
}

/** A skin from a Classic geoset's vertex groups: up to four of the group's bones, weighted alike. */
export function groupSkin(geoset: Skinnable, count: number): Uint8Array {
  const skin = new Uint8Array(count * 8);
  for (let v = 0; v < count; v++) {
    const bones = (geoset.Groups[geoset.VertexGroup[v] ?? 0] ?? [0]).slice(0, 4);
    const share = Math.floor(255 / bones.length);
    bones.forEach((bone, j) => {
      skin[v * 8 + j] = Math.min(255, bone);
      skin[v * 8 + 4 + j] = j === 0 ? 255 - share * (bones.length - 1) : share;
    });
  }
  return skin;
}

/** A tangent across each normal, for a geoset that has none: the HD shader needs one to light it. */
function tangents(normals: ArrayLike<number>, count: number): Float32Array {
  const out = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) {
    const x = normals[v * 3] ?? 0;
    // The axis least along the normal, so the shader can bend it square to the normal.
    const along = Math.abs(x) < 0.9;
    out.set(along ? [1, 0, 0, 1] : [0, 1, 0, 1], v * 4);
  }
  return out;
}

/** A skinned geoset's vertices moved by its bones, as the HD shader moves them (`skinned`). */
export function posed(
  geoset: Pick<Skinnable, "Vertices" | "SkinWeights">,
  matrix: (bone: number) => ArrayLike<number> | undefined,
): Float32Array {
  const v = geoset.Vertices;
  const skin = geoset.SkinWeights;
  const out = Float32Array.from(v);
  if (!skin) return out;
  for (let i = 0; i * 3 + 2 < v.length; i++) {
    const moved = skinned(skin, i, matrix, [
      v[i * 3] ?? 0,
      v[i * 3 + 1] ?? 0,
      v[i * 3 + 2] ?? 0,
      1,
    ]);
    if (moved) out.set(moved, i * 3);
  }
  return out;
}

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * A point (w 1) or direction (w 0) of a vertex moved by the weighted sum of its bones' matrices, as the HD shader moves
 * it: `skin` has 8 numbers a vertex, its four bones then their weights out of 255, and `matrix` gives a bone's (16
 * numbers in columns; a bone without one counts as not moved). Null for a vertex without weights, which stays put.
 */
export function skinned(
  skin: ArrayLike<number>,
  vertex: number,
  matrix: (bone: number) => ArrayLike<number> | undefined,
  [x, y, z, w]: readonly [number, number, number, number],
): [number, number, number] | null {
  let total = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let j = 0; j < 4; j++) {
    const weight = (skin[vertex * 8 + 4 + j] ?? 0) / 255;
    if (weight === 0) continue;
    const m = matrix(skin[vertex * 8 + j] ?? 0) ?? identity;
    const at = (i: number) => m[i] ?? 0;
    total += weight;
    sx += weight * (at(0) * x + at(4) * y + at(8) * z + at(12) * w);
    sy += weight * (at(1) * x + at(5) * y + at(9) * z + at(13) * w);
    sz += weight * (at(2) * x + at(6) * y + at(10) * z + at(14) * w);
  }
  return total > 0 ? [sx / total, sy / total, sz / total] : null;
}

/** The parts of a parsed model (war3-model's) that `hdTextureUse` reads. */
export type Materials = {
  Materials: readonly {
    Layers: readonly {
      ShaderTypeId?: number;
      TextureID?: unknown;
      NormalTextureID?: unknown;
      ORMTextureID?: unknown;
    }[];
  }[];
  Textures: readonly { Image?: string }[];
};

/**
 * What an HD material uses the texture at `image` for, when it is the normal map or the ORM map (occlusion, roughness,
 * metalness and the team colour's share): a material of the HD shader names them, or has them as its second and
 * third layers in older files. Undefined for any other texture.
 */
export function hdTextureUse(model: Materials, image: string): "normal" | "orm" | undefined {
  const named = (id: unknown) => typeof id === "number" && model.Textures[id]?.Image === image;
  for (const { Layers: layers } of model.Materials) {
    const first = layers[0];
    if (first?.ShaderTypeId === 1) {
      if (named(first.NormalTextureID)) return "normal";
      if (named(first.ORMTextureID)) return "orm";
    } else if (layers.length === 6) {
      if (named(layers[1]?.TextureID)) return "normal";
      if (named(layers[2]?.TextureID)) return "orm";
    }
  }
  return undefined;
}

/** The animation a preview plays: the first whose name starts with "Stand", else the first; -1 when there are none. */
export function standSequence(names: readonly string[]): number {
  if (names.length === 0) return -1;
  const stand = names.findIndex((name) => name.trim().toLowerCase().startsWith("stand"));
  return Math.max(stand, 0);
}

/** A box, as the model gives its extents: the smallest and largest corner. */
export type Extent = { min: ArrayLike<number>; max: ArrayLike<number> };

/** The parts of a parsed model (war3-model's) that `solidExtent` reads. */
export type Shape = {
  Geosets: readonly { Vertices: ArrayLike<number>; MaterialID: number; LevelOfDetail?: number }[];
  Materials: readonly { Layers: readonly { FilterMode?: number; TextureID?: unknown }[] }[];
  Textures: readonly { ReplaceableId?: number }[];
  GeosetAnims: readonly { GeosetId: number; Alpha: unknown }[];
};

/** The layer blend modes that draw a solid surface: none, transparent (alpha-tested) and blend. */
const solidModes = [0, 1, 2];
/** The texture number the game fills with the hero's team glow, the disc under a hero. */
const teamGlow = 2;

/**
 * The box round the model's solid geosets as they stand in the bind pose, leaving out glows, effect sheets and the
 * team glow, the geosets the animation keeps hidden (from `interval`, the animation's first and last frame), and the
 * HD models' less detailed copies. The animation's own extent often counts the hidden ones, so a hero looks small in
 * it. `pose` gives a geoset's vertices where the animation puts them, for an HD model, whose bind pose stands with its
 * arms out. Undefined when no geoset is solid.
 */
export function solidExtent(
  model: Shape,
  interval?: ArrayLike<number>,
  pose?: (geoset: number) => ArrayLike<number> | undefined,
): Extent | undefined {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let any = false;
  model.Geosets.forEach((geoset, index) => {
    const layer = model.Materials[geoset.MaterialID]?.Layers[0];
    if (!layer || !solidModes.includes(layer.FilterMode ?? 0)) return;
    const texture =
      typeof layer.TextureID === "number" ? model.Textures[layer.TextureID] : undefined;
    if (texture?.ReplaceableId === teamGlow) return;
    if ((geoset.LevelOfDetail ?? 0) !== 0) return;
    const anim = model.GeosetAnims.find((a) => a.GeosetId === index);
    if (anim && !shown(anim.Alpha, interval)) return;
    const v = pose?.(index) ?? geoset.Vertices;
    for (let i = 0; i + 2 < v.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        const value = v[i + axis] ?? 0;
        if (value < (min[axis] ?? 0)) min[axis] = value;
        if (value > (max[axis] ?? 0)) max[axis] = value;
      }
      any = true;
    }
  });
  return any ? { min, max } : undefined;
}

/** Whether a geoset's alpha lets it show at some point in the interval: a key in it, or the one before it, above 0. */
function shown(alpha: unknown, interval?: ArrayLike<number>): boolean {
  if (typeof alpha === "number") return alpha > 0;
  const keys = (alpha as { Keys?: { Frame: number; Vector: ArrayLike<number> }[] } | null)?.Keys;
  if (!keys || keys.length === 0) return true;
  const start = interval?.[0] ?? -Infinity;
  const end = interval?.[1] ?? Infinity;
  const inside = keys.filter((key) => key.Frame >= start && key.Frame <= end);
  const before = keys.filter((key) => key.Frame < start).at(-1);
  const seen = before ? [before, ...inside] : inside;
  if (seen.length === 0) return true;
  return seen.some((key) => (key.Vector[0] ?? 0) > 0);
}

/** Where to point the camera and how far the model reaches from there. */
export type Framing = { centre: [number, number, number]; radius: number };

/**
 * The framing for the first extent that has a size (the animation's, then the model's), or a unit-sized one around
 * the origin with a radius of 100 when none has.
 */
export function frame(extents: readonly (Extent | undefined)[]): Framing {
  for (const extent of extents) {
    if (!extent) continue;
    const size = [0, 1, 2].map((i) => (extent.max[i] ?? 0) - (extent.min[i] ?? 0));
    const radius = Math.hypot(...size) / 2;
    if (!(radius > 0) || !Number.isFinite(radius)) continue;
    const mid = (i: number) => ((extent.min[i] ?? 0) + (extent.max[i] ?? 0)) / 2;
    return { centre: [mid(0), mid(1), mid(2)], radius };
  }
  return { centre: [0, 0, 0], radius: 100 };
}
