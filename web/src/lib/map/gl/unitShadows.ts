/**
 * Classic's unit shadows: each unit's shadow picture (black, its alpha the shadow) laid flat on the ground under it,
 * unturned, the unit at the picture's centre point (see UnitShadow on the app's side); one draw a picture. Flat at the
 * ground's height where the unit stands, a little above it, so it does not dip into the ground on a gentle slope.
 */
import type { mat4 } from "gl-matrix";
import { groundAt, type PlacedThing, type Terrain } from "../scene.ts";
import { program } from "./program.ts";

/** How far above the ground the pictures lie. */
const lift = 2;

/**
 * The units' shadow pictures as triangles, by picture path: five numbers a corner (x, y, z, u, v), six corners a
 * unit; the picture's top row (v 0) at its north edge.
 */
export function shadowQuads(
  things: readonly PlacedThing[],
  terrain: Terrain,
): Map<string, Float32Array> {
  const byPicture = new Map<string, number[]>();
  for (const thing of things) {
    const shadow = thing.shadow;
    if (thing.kind !== "Unit" || !shadow) continue;
    const left = thing.x - shadow.x;
    const bottom = thing.y - shadow.y;
    const right = left + shadow.width;
    const top = bottom + shadow.height;
    const z = groundAt(terrain, thing.x, thing.y) + lift;
    const corners = [
      [left, bottom, 0, 1],
      [right, bottom, 1, 1],
      [right, top, 1, 0],
      [left, bottom, 0, 1],
      [right, top, 1, 0],
      [left, top, 0, 0],
    ];
    const list = byPicture.get(shadow.texture) ?? [];
    for (const [x, y, u, v] of corners) list.push(x ?? 0, y ?? 0, z, u ?? 0, v ?? 0);
    byPicture.set(shadow.texture, list);
  }
  return new Map([...byPicture].map(([path, list]) => [path, Float32Array.from(list)]));
}

const vertex = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec2 uv;
uniform mat4 viewProjection;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = viewProjection * vec4(position, 1.0);
}`;

const fragment = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D picture;
out vec4 color;
void main() {
  color = texture(picture, vUv);
}`;

type Quads = {
  path: string;
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  count: number;
};

export class UnitShadowLayer {
  private readonly program: WebGLProgram;
  private quads: Quads[] = [];
  /** The pictures loaded, by path: they stay when the units are laid again. */
  private readonly pictures = new Map<string, WebGLTexture>();
  private readonly uniforms: Record<string, WebGLUniformLocation | null>;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    things: readonly PlacedThing[],
    terrain: Terrain,
  ) {
    this.program = program(gl, vertex, fragment);
    this.uniforms = Object.fromEntries(
      ["viewProjection", "picture"].map((name) => [
        name,
        gl.getUniformLocation(this.program, name),
      ]),
    );
    this.place(things, terrain);
  }

  /** Lays the units' pictures again, after a change to the units or to the ground under them. */
  place(things: readonly PlacedThing[], terrain: Terrain): void {
    const { gl } = this;
    this.dropQuads();
    for (const [path, vertices] of shadowQuads(things, terrain)) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
      gl.bindVertexArray(null);
      this.quads.push({ path, vao, buffer, count: vertices.length / 5 });
    }
  }

  /** The pictures the layer waits for: those its units use that are not loaded. */
  get wanted(): string[] {
    return this.quads.map((quads) => quads.path).filter((path) => !this.pictures.has(path));
  }

  setPicture(path: string, texture: WebGLTexture): void {
    // A picture asked for twice (by a load and by a change while it was on its way) keeps the first.
    if (this.pictures.has(path)) this.gl.deleteTexture(texture);
    else this.pictures.set(path, texture);
  }

  draw(viewProjection: mat4): void {
    const { gl } = this;
    if (this.quads.length === 0) return;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.viewProjection ?? null, false, viewProjection);
    gl.uniform1i(this.uniforms.picture ?? null, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const quads of this.quads) {
      const texture = this.pictures.get(quads.path);
      if (!texture) continue;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.bindVertexArray(quads.vao);
      gl.drawArrays(gl.TRIANGLES, 0, quads.count);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  private dropQuads(): void {
    for (const quads of this.quads) {
      this.gl.deleteVertexArray(quads.vao);
      this.gl.deleteBuffer(quads.buffer);
    }
    this.quads = [];
  }

  dispose(): void {
    this.dropQuads();
    for (const texture of this.pictures.values()) this.gl.deleteTexture(texture);
    this.pictures.clear();
    this.gl.deleteProgram(this.program);
  }
}
