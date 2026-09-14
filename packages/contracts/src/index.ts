export type Identifier = string;

export interface ApiError {
  code: string;
  message: string;
}

export interface AuthenticatedUser {
  id: Identifier;
  name: string;
  email: string;
}