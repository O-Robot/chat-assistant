import sanitize from "sanitize-html";

export function sanitizeHTML(content) {
  if (!content || typeof content !== "string") {
    return "";
  }

  return sanitize(content, {
    allowedTags: [
      "strong",
      "em",
      "u",
      "s",
      "strike",
      "br",
      "p",
      "ul",
      "ol",
      "li",
      "a",
      "span",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "class"],
      "*": ["class"], // allow classes on all tags
    },
    // This force-adds the security attributes to links
    transformTags: {
      a: sanitize.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  }).trim();
}
