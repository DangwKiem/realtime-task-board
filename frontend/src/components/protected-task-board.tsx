"use client";

import {
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider"

import TaskBoard from "@/components/task-board"


function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Đăng xuất thất bại";
}


export default function ProtectedTaskBoard() {
  const router = useRouter();

  const {
    user,
    loading,
    signOut,
  } = useAuth();

  const [signingOut, setSigningOut] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);


  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);


  async function handleLogout() {
    setSigningOut(true);
    setError(null);

    try {
      await signOut();
      router.replace("/login");
    } catch (logoutError) {
      setError(
        getMessage(logoutError)
      );
    } finally {
      setSigningOut(false);
    }
  }


  if (loading) {
    return (
      <p>Đang kiểm tra đăng nhập...</p>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <div className="auth-bar">
        <span>
          Đăng nhập với{" "}
          <strong>{user.email}</strong>
        </span>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            void handleLogout()
          }
          disabled={signingOut}
        >
          {signingOut
            ? "Đang đăng xuất..."
            : "Đăng xuất"}
        </button>
      </div>

      {error && (
        <div
          className="error-message"
          role="alert"
        >
          {error}
        </div>
      )}

      <TaskBoard />
    </>
  );
}