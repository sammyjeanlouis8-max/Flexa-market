export const getToken = (): string | null => {
  return localStorage.getItem("flexamarket_token");
};

export const setToken = (token: string): void => {
  localStorage.setItem("flexamarket_token", token);
};

export const clearToken = (): void => {
  localStorage.removeItem("flexamarket_token");
};
