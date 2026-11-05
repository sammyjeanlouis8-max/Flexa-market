import { getApiBaseUrl } from "@/lib/config";

export function getBaseUrl() {
  return getApiBaseUrl();
}

export function useApi() {
  return {
    authFetch: async (path: string, options?: RequestInit) => {
      const res = await fetch(`${getBaseUrl()}${path}`, options);
      return res;
    },
  };
}
