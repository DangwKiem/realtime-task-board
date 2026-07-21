import ProtectedTaskBoard from "@/components/protected-task-board"


export default function TasksPage() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="eyebrow">
          Next.js + FastAPI
        </p>

        <h1>Realtime Task Board</h1>

      </header>

      <ProtectedTaskBoard />
    </main>
  );
}