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

  return "Đăng ký thất bại";
}


export default function RegisterPage() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);


  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError(
        "Mật khẩu xác nhận không khớp"
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await signUp({
        email: email.trim(),
        password,
      });

      router.replace("/tasks");
    } catch (registerError) {
      setError(
        getMessage(registerError)
      );
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

        <h1>Đăng ký</h1>

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
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </label>

          <label>
            Xác nhận mật khẩu

            <input
              type="password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(
                  event.target.value
                )
              }
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
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
              ? "Đang đăng ký..."
              : "Đăng ký"}
          </button>
        </form>

        <p>
          Đã có tài khoản?{" "}
          <Link href="/login">
            Đăng nhập
          </Link>
        </p>
      </section>
    </main>
  );
}