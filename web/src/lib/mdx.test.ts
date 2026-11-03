import { describe, expect, it } from "vitest";
import { parseMDX } from "war3-model";
import {
  frame,
  hdTextureUse,
  posed,
  type Shape,
  type Skinnable,
  skinGeosets,
  skinned,
  solidExtent,
  standSequence,
} from "./mdx.ts";

/** An MDX file from the chunks given, each as its tag and its data bytes. */
function mdx(...chunks: [string, number[]][]): ArrayBuffer {
  const parts: number[] = [..."MDLX"].map((c) => c.charCodeAt(0));
  for (const [tag, data] of chunks) {
    const size = data.length;
    parts.push(...[...tag].map((c) => c.charCodeAt(0)));
    parts.push(size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, size >>> 24);
    parts.push(...data);
  }
  return new Uint8Array(parts).buffer;
}

/** Little-endian bytes: 32-bit numbers, then 4-letter tags as they come. */
function le(...values: (number | string)[]): number[] {
  return values.flatMap((value) =>
    typeof value === "string"
      ? [...value].map((c) => c.charCodeAt(0))
      : [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >>> 24],
  );
}

/**
 * A version 1000 geoset of two vertices with a skin chunk whose numbers are `width` bytes each, as the game's files
 * (2) or older Reforged files (1) write it, and tangents unless `tangents` is false; a Classic one without `skin`.
 */
function geoset(skin: number[] | undefined, width: 1 | 2, tangents = true): number[] {
  const data = [
    ...le("VRTX", 2),
    ...new Array(24).fill(0),
    ...le("NRMS", 2),
    ...new Array(24).fill(0),
    ...le("PTYP", 1, 4, "PCNT", 1, 3, "PVTX", 0, "GNDX", 0, "MTGC", 0, "MATS", 0),
    ...le(0, 0, 0, 0), // material, selection group, flags, level of detail
    ...new Array(80).fill(0), // name
    ...new Array(28).fill(0), // extent
    ...le(1),
    ...new Array(28).fill(0), // one animation's extent
    ...(skin && tangents ? [...le("TANG", 2), ...new Array(32).fill(0)] : []),
    ...(skin
      ? [
          ...le("SKIN", skin.length),
          ...skin.flatMap((n) => (width === 2 ? [n & 0xff, n >> 8] : [n])),
        ]
      : []),
    ...le("UVAS", 1, "UVBS", 2),
    ...new Array(16).fill(0),
  ];
  return [...le(data.length + 4), ...data];
}

// The game's models are version 1800; war3-model is wc3-dev's fork, which reads them.
describe("war3-model", () => {
  const skin = [3, 1, 0, 0, 200, 55, 0, 0, 2, 0, 0, 0, 255, 0, 0, 0];
  const skins = (file: ArrayBuffer) => parseMDX(file).Geosets.map((each) => each.SkinWeights);

  it("reads a skin of two-byte numbers, as the game's version 1800 files write it", () => {
    const file = mdx(["VERS", le(1800)], ["GEOS", geoset(skin, 2)]);
    expect(skins(file)).toEqual([new Uint8Array(skin)]);
  });

  it("reads a skin of one-byte numbers, with or without tangents, geoset by geoset", () => {
    const file = mdx(["VERS", le(1000)], ["GEOS", [...geoset(skin, 1), ...geoset(skin, 2, false)]]);
    expect(skins(file)).toEqual([new Uint8Array(skin), new Uint8Array(skin)]);
  });

  it("gives no skin for a Classic geoset", () => {
    const file = mdx(["VERS", le(1000)], ["GEOS", [...geoset(undefined, 1), ...geoset(skin, 2)]]);
    expect(skins(file)).toEqual([undefined, new Uint8Array(skin)]);
  });

  it("reads a version 1800 camera, whose size has 3 in its fourth byte", () => {
    const camera = [...le("Portrait"), ...new Array(72).fill(0), ...new Array(36).fill(0)];
    const file = mdx(
      ["VERS", le(1800)],
      ["CAMS", [...le((4 + camera.length) | 0x3000000), ...camera]],
    );
    expect(parseMDX(file).Cameras.map((each) => each.Name)).toEqual(["Portrait"]);
  });

  it("reads a version 1800 light, with its seven numbers more", () => {
    const node = [...le(96, "Sun"), ...new Array(77).fill(0), ...le(0, -1, 0x200)];
    // The type, the number more, the attenuation, colour, intensity, ambient colour and intensity, the six more.
    const numbers = new Float32Array([80, 200, 1, 1, 1, 1, 1, 1, 1, 0.5, 0, 0, 0, 0, 0, 0]);
    const light = [...node, ...le(1, 0), ...new Uint8Array(numbers.buffer)];
    const file = mdx(["VERS", le(1800)], ["LITE", [...le(4 + light.length), ...light]]);
    const [sun] = parseMDX(file).Lights;
    expect(sun?.AttenuationEnd).toBe(200);
    expect(sun?.AmbIntensity).toBe(0.5);
  });
});

describe("skinGeosets", () => {
  const vertices = [0, 0, 0, 10, 0, 0];
  const normals = [0, 0, 1, 1, 0, 0];

  it("turns a skin's bone numbers from the geoset's list into the model's", () => {
    const skin = new Uint8Array([1, 0, 0, 0, 255, 0, 0, 0, 0, 1, 0, 0, 128, 127, 0, 0]);
    const geosets: Skinnable[] = [
      {
        Vertices: vertices,
        Normals: normals,
        VertexGroup: [],
        Groups: [[7], [4]],
        SkinWeights: skin,
      },
    ];
    expect(skinGeosets(geosets)).toBe(true);
    expect(Array.from(geosets[0]?.SkinWeights ?? [])).toEqual([
      4, 7, 7, 7, 255, 0, 0, 0, 7, 4, 7, 7, 128, 127, 0, 0,
    ]);
    expect(geosets[0]?.Tangents).toHaveLength(8);
  });

  it("gives a Classic geoset of an HD model a skin from its vertex groups", () => {
    const geosets: Skinnable[] = [
      {
        Vertices: vertices,
        Normals: normals,
        VertexGroup: [],
        Groups: [[0]],
        SkinWeights: new Uint8Array(16),
      },
      { Vertices: vertices, Normals: normals, VertexGroup: [0, 1], Groups: [[5], [2, 3]] },
    ];
    skinGeosets(geosets);
    expect(Array.from(geosets[1]?.SkinWeights ?? [])).toEqual([
      5, 0, 0, 0, 255, 0, 0, 0, 2, 3, 0, 0, 128, 127, 0, 0,
    ]);
    expect(Array.from(geosets[1]?.Tangents ?? [])).toEqual([1, 0, 0, 1, 0, 1, 0, 1]);
  });

  it("leaves a Classic model as it is", () => {
    const geosets: Skinnable[] = [
      { Vertices: vertices, Normals: normals, VertexGroup: [0, 0], Groups: [[0]] },
    ];
    expect(skinGeosets(geosets)).toBe(false);
    expect(geosets[0]?.SkinWeights).toBeUndefined();
  });
});

describe("posed", () => {
  it("moves each vertex by its bones' matrices, weighted", () => {
    const moveX = (by: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, by, 0, 0, 1];
    const skin = new Uint8Array([0, 1, 0, 0, 255, 0, 0, 0, 0, 1, 0, 0, 51, 204, 0, 0]);
    const out = posed({ Vertices: [0, 0, 0, 0, 5, 0], SkinWeights: skin }, (bone) =>
      bone === 0 ? moveX(10) : bone === 1 ? moveX(20) : undefined,
    );
    expect(out[0]).toBeCloseTo(10);
    expect(out[3]).toBeCloseTo(18);
    expect(out[4]).toBeCloseTo(5);
  });
});

describe("skinned", () => {
  const moveX = (by: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, by, 0, 0, 1];
  const bones = (bone: number) => (bone === 0 ? moveX(10) : undefined);

  it("moves a point by its bones' matrices, weighted", () => {
    const skin = new Uint8Array([0, 1, 0, 0, 100, 100, 0, 0]);
    expect(skinned(skin, 0, bones, [1, 2, 3, 1])).toEqual([6, 2, 3]);
  });

  it("turns a direction without moving it", () => {
    const skin = new Uint8Array([0, 0, 0, 0, 255, 0, 0, 0]);
    expect(skinned(skin, 0, bones, [1, 2, 3, 0])).toEqual([1, 2, 3]);
  });

  it("finds each vertex's bones by its place", () => {
    const skin = new Uint8Array([1, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0]);
    expect(skinned(skin, 1, bones, [1, 2, 3, 1])).toEqual([11, 2, 3]);
  });

  it("is null for a vertex without weights", () => {
    expect(skinned(new Uint8Array(8), 0, bones, [1, 2, 3, 1])).toBeNull();
  });
});

describe("hdTextureUse", () => {
  it("knows an HD material's normal and ORM maps, by name or by layer", () => {
    const model = {
      Materials: [
        { Layers: [{ ShaderTypeId: 1, TextureID: 0, NormalTextureID: 1, ORMTextureID: 2 }] },
        { Layers: [3, 4, 5, 0, 0, 0].map((TextureID) => ({ TextureID })) },
      ],
      Textures: ["d", "n", "o", "d2", "n2", "o2"].map((Image) => ({ Image })),
    };
    expect(hdTextureUse(model, "n")).toBe("normal");
    expect(hdTextureUse(model, "o")).toBe("orm");
    expect(hdTextureUse(model, "n2")).toBe("normal");
    expect(hdTextureUse(model, "o2")).toBe("orm");
    expect(hdTextureUse(model, "d")).toBeUndefined();
  });
});

describe("standSequence", () => {
  it("picks the first animation whose name starts with Stand", () => {
    expect(standSequence(["Walk", "Attack - 1", "Stand Work", "Stand - 1"])).toBe(2);
    expect(standSequence(["Birth", "stand"])).toBe(1);
  });

  it("falls back to the first animation, and to -1 when there is none", () => {
    expect(standSequence(["Birth", "Death"])).toBe(0);
    expect(standSequence([])).toBe(-1);
  });
});

describe("frame", () => {
  it("centres on the first extent with a size and reaches half its diagonal", () => {
    const empty = { min: [0, 0, 0], max: [0, 0, 0] };
    const box = { min: [-30, -40, 0], max: [30, 40, 120] };
    const framing = frame([undefined, empty, box]);
    expect(framing.centre).toEqual([0, 0, 60]);
    expect(framing.radius).toBeCloseTo(Math.hypot(60, 80, 120) / 2);
  });

  it("falls back to the origin when no extent has a size", () => {
    expect(frame([])).toEqual({ centre: [0, 0, 0], radius: 100 });
  });
});

describe("solidExtent", () => {
  /** A model with a body (alpha-tested), a team glow disc, an additive glow, and a body part hidden in the animation. */
  const model: Shape = {
    Geosets: [
      { Vertices: [-10, -10, 0, 10, 10, 100], MaterialID: 0 },
      { Vertices: [-200, -200, 0, 200, 200, 0], MaterialID: 1 },
      { Vertices: [0, 0, 0, 0, 0, 900], MaterialID: 2 },
      { Vertices: [0, 0, 0, 50, 0, 0], MaterialID: 0 },
    ],
    Materials: [
      { Layers: [{ FilterMode: 1, TextureID: 0 }] },
      { Layers: [{ FilterMode: 2, TextureID: 1 }] },
      { Layers: [{ FilterMode: 3, TextureID: 0 }] },
    ],
    Textures: [{ ReplaceableId: 0 }, { ReplaceableId: 2 }],
    GeosetAnims: [
      {
        GeosetId: 3,
        Alpha: {
          Keys: [
            { Frame: 0, Vector: [0] },
            { Frame: 2000, Vector: [1] },
          ],
        },
      },
    ],
  };

  it("leaves out glows, the team glow and geosets hidden in the animation", () => {
    expect(solidExtent(model, [0, 1000])).toEqual({ min: [-10, -10, 0], max: [10, 10, 100] });
  });

  it("counts a geoset the animation shows", () => {
    expect(solidExtent(model, [2000, 3000])).toEqual({ min: [-10, -10, 0], max: [50, 10, 100] });
  });

  it("leaves out the less detailed copies, and reads the vertices from the pose given", () => {
    const detailed: Shape = {
      ...model,
      Geosets: [
        { Vertices: [0, 0, 0, 1, 1, 1], MaterialID: 0, LevelOfDetail: 0 },
        { Vertices: [0, 0, 0, 500, 1, 1], MaterialID: 0, LevelOfDetail: 1 },
      ],
      GeosetAnims: [],
    };
    expect(solidExtent(detailed)).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
    expect(solidExtent(detailed, undefined, () => [2, 2, 2, 3, 3, 3])).toEqual({
      min: [2, 2, 2],
      max: [3, 3, 3],
    });
  });

  it("is undefined when no geoset is solid", () => {
    expect(solidExtent({ ...model, Geosets: model.Geosets.slice(2, 3) })).toBeUndefined();
  });
});
