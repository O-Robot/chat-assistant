import { User, Status } from "@/types";

interface AvatarProps {
  user: User;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
};

export function Avatar({ user, size = "md" }: AvatarProps) {
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <div className="relative">
      <div
        className={`flex items-center font-bold justify-center rounded-full text-white ${sizeClasses[size]}`}
      >
        <span>{getInitials(user.firstName + " " + user.lastName)}</span>
      </div>
    </div>
  );
}
