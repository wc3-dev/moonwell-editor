import { describe, expect, it } from "vitest";
import { hasTyped, sendTyped } from "../typing.ts";
import { typedBox, typedText } from "./typedBox.ts";

function fakeBox(value = ""): HTMLInputElement {
  const box = new EventTarget() as unknown as HTMLInputElement;
  box.value = value;
  return box;
}

describe("typedBox", () => {
  it("sends nothing for a box nobody typed in", () => {
    const sent: string[] = [];
    const action = typedBox(fakeBox("as it was"), (value) => sent.push(value));
    action.destroy();
    expect(sent).toEqual([]);
  });

  it("sends once when the box changes", () => {
    const sent: string[] = [];
    const box = fakeBox();
    const action = typedBox(box, (value) => sent.push(value));
    box.value = "typed";
    box.dispatchEvent(new Event("input"));
    expect(hasTyped()).toBe(true);
    box.dispatchEvent(new Event("change"));
    expect(hasTyped()).toBe(false);
    action.destroy();
    expect(sent).toEqual(["typed"]);
  });

  it("sends what is typed when a save asks, with no blur", () => {
    const sent: string[] = [];
    const box = fakeBox();
    const action = typedBox(box, (value) => sent.push(value));
    box.value = "typed";
    box.dispatchEvent(new Event("input"));
    sendTyped();
    box.dispatchEvent(new Event("change"));
    action.destroy();
    expect(sent).toEqual(["typed"]);
  });

  it("sends what is typed when the box goes away", () => {
    const sent: string[] = [];
    const box = fakeBox();
    const action = typedBox(box, (value) => sent.push(value));
    box.value = "typed";
    box.dispatchEvent(new Event("input"));
    action.destroy();
    expect(sent).toEqual(["typed"]);
    expect(hasTyped()).toBe(false);
  });
});

describe("typedText", () => {
  it("sends nothing until the text changed", () => {
    const sent: string[] = [];
    const text = typedText(
      () => "as it was",
      (value) => sent.push(value),
    );
    text.send();
    expect(sent).toEqual([]);
    expect(hasTyped()).toBe(false);
  });

  it("sends what is there when asked, once", () => {
    const sent: string[] = [];
    let value = "first";
    const text = typedText(
      () => value,
      (each) => sent.push(each),
    );
    text.changed();
    value = "last";
    text.changed();
    expect(hasTyped()).toBe(true);
    text.send();
    text.send();
    expect(sent).toEqual(["last"]);
    expect(hasTyped()).toBe(false);
  });

  it("sends when a save asks", () => {
    const sent: string[] = [];
    const text = typedText(
      () => "typed",
      (value) => sent.push(value),
    );
    text.changed();
    sendTyped();
    expect(sent).toEqual(["typed"]);
  });

  it("sends with the last sender given", () => {
    const sent: string[] = [];
    const text = typedText(
      () => "typed",
      () => sent.push("old"),
    );
    text.update(() => sent.push("new"));
    text.changed();
    text.send();
    expect(sent).toEqual(["new"]);
  });
});
