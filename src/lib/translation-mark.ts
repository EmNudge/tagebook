import { Mark, mergeAttributes } from "@tiptap/react";

/** Dotted underline for word/phrase definitions */
export const DefinitionMark = Mark.create({
  name: "definition",

  addAttributes() {
    return {
      phrase: { default: null },
      definition: { default: null },
      partOfSpeech: { default: null },
      colorIndex: { default: 0 },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-definition]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-definition": HTMLAttributes.definition,
        "data-pos": HTMLAttributes.partOfSpeech,
        "data-mark-type": "definition",
        "data-color-index": HTMLAttributes.colorIndex,
        class: `definition-mark color-${HTMLAttributes.colorIndex}`,
      }),
      0,
    ];
  },
});

/** Wavy underline for grammar issues */
export const GrammarMark = Mark.create({
  name: "grammar",

  addAttributes() {
    return {
      phrase: { default: null },
      correction: { default: null },
      explanation: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-grammar]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-correction": HTMLAttributes.correction,
        "data-explanation": HTMLAttributes.explanation,
        "data-mark-type": "grammar",
        class: "grammar-mark",
      }),
      0,
    ];
  },
});
