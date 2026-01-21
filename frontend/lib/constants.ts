import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import DOMPurify from "dompurify";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(datetime: string) {
  const date = new Date(datetime);

  const day = date.getDate();
  const getDaySuffix = (d: number) => {
    if (d >= 11 && d <= 13) return "th";
    switch (d % 10) {
      case 1:
        return "st";
      case 2:
        return "nd";
      case 3:
        return "rd";
      default:
        return "th";
    }
  };
  const dayWithSuffix = `${day}${getDaySuffix(day)}`;

  // Month and year
  const month = date.toLocaleString("en-US", { month: "long" });
  const year = date.getFullYear();

  // Time
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return `${dayWithSuffix} ${month} ${year}, ${hour12}:${minutes} ${ampm}`;
}

export const Console = (() => {
  // Check if the current environment is development
  const isDevMode = process.env.NODE_ENV === "development";

  return new Proxy(console, {
    get(target: any, prop: any) {
      if (!isDevMode && typeof target[prop] === "function") {
        return () => {};
      }
      return target[prop];
    },
  });
})();

export const TruncateText = (text?: string, count?: number): string => {
  const truncate = (str: string): string => {
    if (count && str?.length > count) {
      return str.slice(0, count) + "...";
    } else if (!count && str.length > 15) {
      return str.slice(0, 15) + "...";
    }
    return str;
  };

  return truncate(text || "");
};

export const sanitizedContent = (content: any) =>
  DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
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
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
  });

export const modules = {
  toolbar: [
    ["bold", "italic", "underline", "strike", "blockquote"],
    [
      { list: "ordered" },
      { list: "bullet" },
      { indent: "-1" },
      { indent: "+1" },
    ],
    ["link"],
    ["clean"],
  ],
};

export const formats = [
  "bold",
  "italic",
  "underline",
  "strike",
  "blockquote",
  "list",
  "indent",
  "link",
];
