// 3-panel WhatsApp-style layout placeholder (PRD 7.2). Panels are wired
// to real data in the chat-UI iteration.
export default function DashboardPage() {
  return (
    <div className="flex h-screen">
      <aside className="w-80 border-r border-black/40 bg-wa-panel p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-400">
          Percakapan
        </h2>
        <p className="text-xs text-gray-500">List customer (placeholder)</p>
      </aside>

      <section className="flex flex-1 flex-col">
        <header className="border-b border-black/40 bg-wa-panel px-4 py-3 text-sm text-gray-300">
          Pilih percakapan
        </header>
        <div className="flex-1 p-4 text-xs text-gray-500">
          Isi chat (placeholder)
        </div>
      </section>

      <aside className="w-80 border-l border-black/40 bg-wa-panel p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-400">
          Detail & Kontrol AI
        </h2>
        <p className="text-xs text-gray-500">
          Toggle AI, notes, rekomendasi Hermes (placeholder)
        </p>
      </aside>
    </div>
  );
}
