"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { FormEvent } from "react";

import { useAuth } from "@/components/auth-provider"


function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Đăng nhập thất bại";
}


export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);


  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setSubmitting(true);
    setError(null);

    try {
      await signIn({
        email: email.trim(),
        password,
      });

      router.replace("/tasks");
    } catch (loginError) {
      setError(getMessage(loginError));
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">
          Realtime Task Board
        </p>

        <h1>Đăng nhập</h1>

        <form
          className="task-form"
          onSubmit={handleSubmit}
        >
          <label>
            Email

            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              autoComplete="email"
              required
            />
          </label>

          <label>
            Mật khẩu

            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              autoComplete="current-password"
              required
            />
          </label>

          {error && (
            <div
              className="error-message"
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? "Đang đăng nhập..."
              : "Đăng nhập"}
          </button>
        </form>

        <p>
          Chưa có tài khoản?{" "}
          <Link href="/register">
            Đăng ký
          </Link>
        </p>
      </section>
    </main>
  );
}