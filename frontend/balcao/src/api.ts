import axios from "axios";
import { useStore } from "./store";

const api = axios.create({ baseURL: "" });

api.interceptors.request.use((config) => {
  const token = useStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<void> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const { refreshToken, updateTokens, logout } = useStore.getState();
      if (!refreshToken) { logout(); return Promise.reject(error); }

      if (!refreshing) {
        refreshing = axios
          .post("/auth/refresh", { refresh_token: refreshToken })
          .then((r) => updateTokens(r.data.access_token, r.data.refresh_token))
          .catch(() => logout())
          .finally(() => { refreshing = null; });
      }
      await refreshing;

      const newToken = useStore.getState().accessToken;
      if (!newToken) return Promise.reject(error);
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    }
    return Promise.reject(error);
  }
);

export default api;
