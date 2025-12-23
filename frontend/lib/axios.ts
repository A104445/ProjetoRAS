import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";

export const api = axios.create({
  baseURL: "http://localhost:8080/api-gateway/",
});

// Add request interceptor to include JWT token in headers
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Only run on client side
    if (typeof window !== "undefined") {
      // Try to get token from localStorage
      const storedSession = localStorage.getItem("session");
      console.log("DEBUG axios interceptor - Session in localStorage:", storedSession ? "Present" : "Missing");

      if (storedSession) {
        try {
          const session = JSON.parse(storedSession);
          console.log("DEBUG axios interceptor - Token from session:", session?.token ? "Present" : "Missing");
          if (session?.token) {
            config.headers.Authorization = `Bearer ${session.token}`;
            console.log("DEBUG axios interceptor - Added Authorization header");
          }
        } catch (e) {
          console.error("Error parsing session from localStorage:", e);
        }
      }
    }

    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle auth errors
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - could redirect to login
      console.warn("Unauthorized request - token may be expired or missing");
    }
    return Promise.reject(error);
  }
);
