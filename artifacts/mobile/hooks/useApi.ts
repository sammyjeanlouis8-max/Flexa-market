export function getBaseUrl() {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "https://lionfish-app-feohg.ondigitalocean.app/api";
}

export function useApi() {
  return {
    authFetch: async (path: string, options?: RequestInit) => {
      const res = await fetch(`${getBaseUrl()}${path}`, options);
      return res;
    },
  };
}
