import type { FieldView, ObjectView } from "../api.ts";
import { t } from "../text.ts";
import type { MenuItem } from "../ui/ContextMenu.svelte";
import { type DiceFields, rangeEdits, rangeOf } from "./dice.ts";
import { copiedField, copyField, copyRange, fits } from "./fieldClip.ts";

type Needs = {
  view: () => ObjectView;
  notice: (text: string, warn: boolean) => void;
  set: (field: FieldView, value: string) => Promise<string | null>;
  reset: (field: FieldView) => Promise<string | null>;
  /** Changes several fields as one edit; answers with why it was refused, or null. */
  fields: (edits: { field: FieldView; value: string }[]) => Promise<string | null>;
  menu: (x: number, y: number, items: MenuItem[]) => void;
  /** Whether a field is a favourite. */
  isFavourite: (field: FieldView) => boolean;
  /** Stars a field, or takes its star off. */
  favourite: (field: FieldView) => void;
};

/** Copying and pasting a field's value or a total of dice, and their context menus. */
export class FieldActions {
  readonly #needs: Needs;

  constructor(needs: Needs) {
    this.#needs = needs;
  }

  get #editable(): boolean {
    return this.#needs.view().readOnly === null;
  }

  /** The value copied, when it can go in at all; else it says why not. */
  #pasteable(): ReturnType<typeof copiedField> {
    const clip = copiedField();
    if (!clip) {
      this.#needs.notice(t("details.nothingCopied"), false);
      return null;
    }
    if (!this.#editable) {
      const reason = this.#needs.view().readOnly ?? "";
      this.#needs.notice(t("details.readOnly", { reason }), true);
      return null;
    }
    return clip;
  }

  copy(field: FieldView): void {
    copyField(field);
    navigator.clipboard?.writeText(field.value).catch(() => {});
    this.#needs.notice(
      field.level > 0
        ? t("details.copiedLevel", { field: field.label, level: field.level })
        : t("details.copied", { field: field.label }),
      false,
    );
  }

  copyName(field: FieldView): void {
    navigator.clipboard?.writeText(field.label).then(
      () => this.#needs.notice(t("details.copiedName", { field: field.label }), false),
      () => this.#needs.notice(t("details.notCopied"), true),
    );
  }

  async paste(field: FieldView): Promise<void> {
    const clip = this.#pasteable();
    if (!clip) return;
    if (!fits(clip, field)) {
      this.#needs.notice(t("details.doesNotFit", { from: clip.label, to: field.label }), true);
      return;
    }
    const error = await this.#needs.set(field, clip.value);
    this.#needs.notice(
      error ?? t("details.pasted", { from: clip.label, to: field.label }),
      error !== null,
    );
  }

  copyTotal(label: string, dice: DiceFields): void {
    const clip = copyRange(label, rangeOf(dice));
    navigator.clipboard?.writeText(clip.value).catch(() => {});
    this.#needs.notice(t("details.copied", { field: label }), false);
  }

  async pasteTotal(label: string, dice: DiceFields): Promise<void> {
    const clip = this.#pasteable();
    if (!clip) return;
    if (!clip.range) {
      this.#needs.notice(t("details.doesNotFit", { from: clip.label, to: label }), true);
      return;
    }
    const edits = rangeEdits(dice, clip.range);
    const error = edits.length === 0 ? null : await this.#needs.fields(edits);
    this.#needs.notice(
      error ?? t("details.pasted", { from: clip.label, to: label }),
      error !== null,
    );
  }

  /** The context menu of a field (one level of a per-level field). */
  fieldMenu = (field: FieldView, x: number, y: number): void => {
    const clip = copiedField();
    const editable = this.#editable;
    this.#needs.menu(x, y, [
      { label: t("details.menu.copy"), shortcut: "Ctrl C", run: () => this.copy(field) },
      { label: t("details.menu.copyName"), run: () => this.copyName(field) },
      {
        label: clip ? t("details.menu.pasteField", { field: clip.label }) : t("details.menu.paste"),
        shortcut: "Ctrl V",
        disabled: !clip || !editable || !fits(clip, field),
        run: () => this.paste(field),
      },
      { separator: true },
      {
        label: t("details.menu.reset"),
        disabled: !editable || !field.changed,
        run: () => this.#needs.reset(field),
      },
      { separator: true },
      {
        label: this.#needs.isFavourite(field)
          ? t("details.menu.unfavourite")
          : t("details.menu.favourite"),
        run: () => this.#needs.favourite(field),
      },
    ]);
  };

  /** The context menu of a total: copy and paste its range, and reset its three fields. */
  totalMenu(label: string, dice: DiceFields, x: number, y: number): void {
    const clip = copiedField();
    const editable = this.#editable;
    const parts = [dice.base, dice.dice, dice.sides];
    this.#needs.menu(x, y, [
      { label: t("details.menu.copy"), shortcut: "Ctrl C", run: () => this.copyTotal(label, dice) },
      {
        label: clip ? t("details.menu.pasteField", { field: clip.label }) : t("details.menu.paste"),
        shortcut: "Ctrl V",
        disabled: !clip?.range || !editable,
        run: () => this.pasteTotal(label, dice),
      },
      { separator: true },
      {
        label: t("details.menu.reset"),
        disabled: !editable || !parts.some((part) => part.changed),
        run: async () => {
          for (const part of parts) if (part.changed) await this.#needs.reset(part);
        },
      },
    ]);
  }
}
