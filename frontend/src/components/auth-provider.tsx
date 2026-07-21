"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import type {
  PropsWithChildren,
} from "react";

import {
  ApiError,
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  setCsrfToken,
} from "@/lib/api";

import type {
  LoginInput,
  RegisterInput,
  User,
} from "@/types/auth";


interface AuthContextValue {
  user: User | null;
  loading: boolean;

  signIn:
    (input: LoginInput) =>
      Promise<void>;

  signUp:
    (input: RegisterInput) =>
      Promise<void>;

  signOut:
    () => Promise<void>;
}


const AuthContext =
  createContext<AuthContextValue | null>(
    null,
  );


export default function AuthProvider({
  children,
}: PropsWithChildren) {
  const [user, setUser] =
    useState<User | null>(null);

  const [loading, setLoading] =
    useState(true);


  useEffect(() => {
    let ignore = false;

    async function restoreSession() {
      try {
        const result = await getMe();

        if (!ignore) {
          setUser(result.user);
        }
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status !== 401
        ) {
          console.error(
            "Không khôi phục được session:",
            error,
          );
        }

        if (!ignore) {
          setUser(null);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
  function handleSessionExpired() {
    setCsrfToken(null);
    setUser(null);
  }

  window.addEventListener(
    "taskboard:session-expired",
    handleSessionExpired,
  );

  return () => {
    window.removeEventListener(
      "taskboard:session-expired",
      handleSessionExpired,
    );
  };
}, []);


  async function signIn(
    input: LoginInput,
  ): Promise<void> {
    const result =
      await loginRequest(input);

    setUser(result.user);
  }


  async function signUp(
    input: RegisterInput,
  ): Promise<void> {
    const result =
      await registerRequest(input);

    setUser(result.user);
  }


  async function signOut():
  Promise<void> {
    await logoutRequest();
    setUser(null);
  }


  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}


export function useAuth():
AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth phải nằm trong AuthProvider",
    );
  }

  return context;
}