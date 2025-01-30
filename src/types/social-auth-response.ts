// src/types/social-auth-response.ts

export interface LoginResponsePerson {
    first_name: string;
    last_name: string;
  }
  
  export interface LoginResponseUser {
    id: number;
    email: string;
    person?: LoginResponsePerson;
  }
  
  export interface LoginSuccessResponse {
    status: 'success';
    data: {
      token: string;
      user: LoginResponseUser;
    };
  }
  
  export interface LoginErrorResponse {
    status: 'error';
    message: string;
  }
  
  export interface LoginRegisterRequiredResponse {
    status: 'register_required';
    socialData: {
      email: string;
      firstName: string;
      lastName: string;
      socialId: string;
      provider: string;
    };
    message: string;
    data?: {
      redirectUrl?: string;
    };
  }
  
  export type LoginResponse = 
    | LoginSuccessResponse 
    | LoginErrorResponse 
    | LoginRegisterRequiredResponse;