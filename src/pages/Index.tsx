import { useState } from "react";
import { Header } from "@/components/Header";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Footer } from "@/components/Footer";

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex flex-col min-h-screen">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-1" style={{ lineHeight: "1.1" }}>
            AI Standards Directory
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl">
            Track the protocols, specifications, and standards shaping the AI ecosystem — from emerging proposals to approved specifications.
          </p>
        </div>

        <KanbanBoard searchQuery={searchQuery} />
      </main>

      <Footer />
    </div>
  );
};

export default Index;
