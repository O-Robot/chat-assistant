import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const projects = [
  {
    image: "/textures/Screenshot 2025-06-22 103331.png",
    url: "https://party-place-phi.vercel.app/",
  },
  {
    image: "/textures/Screenshot 2025-06-22 103652.png",
    url: "https://oguncimma.com//",
  },
  {
    image: "/textures/Screenshot 2025-06-22 103904.png",
    url: "https://www.yctmfb.online/",
  },
  {
    image: "/textures/project-spaze.webp",
    url: "https://thebearss.com/",
  },
  {
    image: "/textures/project-myteachers.jpg",
    url: "https://www.yctmfb.net/",
  },
  {
    image: "/textures/project-wholesale.jpg",
    url: "https://user.speedycardlister.ai/",
  },
];

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

export const aboutCameraPos = {
  x: 0.12,
  y: 0.2,
  z: 0.55,
};

export const aboutCameraRot = {
  x: -1.54,
  y: 0.13,
  z: 1.41,
};

export const projectsCameraPos = {
  x: 1,
  y: 0.45,
  z: 0.01,
};

export const projectsCameraRot = {
  x: 0.05,
  y: 0.05,
  z: 0,
};

// export const defaultCameraPos = {
//   x: 1.109028643133046,
//   y: 0.5463638814987481,
//   z: 0.4983449671971262,
// };

// export const defaultCameraRot = {
//   x: -0.8313297556598935,
//   y: 0.9383399492446749,
//   z: 0.7240714481613063,
// };
export const defaultCameraPos = {
  x: 1.2484806787751097,
  y: 0.46343620455819456,
  z: 0.05769702519139227,
};

export const defaultCameraRot = {
  x: -1.4469353324247252,
  y: 1.2128448895177755,
  z: 1.4386475257629794,
};

export const introCameraStartPos = {
  x: 3,
  y: 2,
  z: 2,
};

export const introCameraZoomOutPos = {
  x: 4,
  y: 3,
  z: 3,
};

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
