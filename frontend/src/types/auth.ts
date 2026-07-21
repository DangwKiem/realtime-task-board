export interface User {
  id: number;
  email: string;
  created_at: string;
}


export interface RegisterInput {
  email: string;
  password: string;
}


export interface LoginInput {
  email: string;
  password: string;
}


export interface AuthResponse {
  user: User;
  csrf_token: string;
}