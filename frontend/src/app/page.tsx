import Link from "next/link";


export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">
          Mini project
        </p>

        <h1>Realtime Task Board</h1>

        <p>
          Ứng dụng thực hành Next.js,
          React, FastAPI, HTTP và WebSocket.
        </p>

        <Link
          href="/tasks"
          className="primary-link"
        >
          Mở danh sách task
        </Link>
      </section>
    </main>
  );
}