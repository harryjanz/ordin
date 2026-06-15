import axios from "axios";
import { useStore } from "./store";

const api = axios.create({ baseURL: "" });

api.interceptors.request.use((config) => {
  const token = useStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      useStore.getState().resetSession();
    }
    return Promise.reject(error);
  }
);

export default api;
