import { toast } from "@/hooks/use-toast";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const userApi = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

export const adminApi = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
  timeout: 10000,
});

// Add request interceptor for admin auth
adminApi.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

const handleResponse = (response: any) => response;
const handleError = (error: any) => {
  if (error.response) {
    console.error("API Error:", error.response.data);
    toast({
      title: "Error",
      description: error.response.data || "Failed!!. Please try again.",
      variant: "destructive",
    });
  } else if (error.request) {
    console.error("Network Error:", error.message);
    toast({
      title: "Error",
      description: error.message || "Network Error!!. Please try again.",
      variant: "destructive",
    });
  } else {
    console.error("Error:", error.message);
  }
  return Promise.reject(error);
};

userApi.interceptors.response.use(handleResponse, handleError);
adminApi.interceptors.response.use(handleResponse, handleError);
