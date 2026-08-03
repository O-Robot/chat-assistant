import { toast } from "@/hooks/use-toast";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
let adminLogoutInProgress = false;

export const userApi = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
  withCredentials: true,
});

export const adminApi = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
  timeout: 30000,
});

adminApi.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

const handleResponse = (response: any) => response;
const getErrorMessage = (error: any) =>
  error.response?.data?.error?.message ||
  error.response?.data?.message ||
  error.message ||
  "Please try again.";

const handleError = (error: any) => {
  if (error.response) {
    console.error("API Error:", error.response.status, error.response.data?.error?.code);
    toast({
      title: "Error",
      description: getErrorMessage(error),
      variant: "destructive",
    });
  } else if (error.request) {
    console.error("Network Error:", error.message);
    toast({
      title: "Error",
      description: getErrorMessage(error),
      variant: "destructive",
    });
  } else {
    console.error("Error:", error.message);
  }
  return Promise.reject(error);
};

const handleAdminError = async (error: any) => {
  const status = error.response?.status;
  const requestUrl = error.config?.url || "";
  const isAuthRequest = requestUrl.startsWith("/auth/admin/");

  if (status === 401 && !isAuthRequest && typeof window !== "undefined") {
    if (!adminLogoutInProgress) {
      adminLogoutInProgress = true;

      // Use fetch instead of adminApi so this cleanup request cannot trigger the
      // interceptor again when the expired cookie is rejected by the server.
      try {
        await fetch(`${API_URL}/auth/admin/logout`, {
          method: "POST",
          credentials: "include",
        });
      } finally {
        window.location.replace("/admin/auth?reason=session-expired");
      }
    }

    return Promise.reject(error);
  }

  return handleError(error);
};

userApi.interceptors.response.use(handleResponse, handleError);
adminApi.interceptors.response.use(handleResponse, handleAdminError);
