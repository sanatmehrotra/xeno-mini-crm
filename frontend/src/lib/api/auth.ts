import apiClient from "./client";

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface MeResponse {
  email: string;
  role: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>("/auth/login", { email, password }),

  me: () => apiClient.get<MeResponse>("/auth/me"),
};
