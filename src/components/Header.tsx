import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function Header({ searchQuery, onSearchChange }: HeaderProps) {
  return (
    <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-6 h-16">
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-2xl" aria-hidden>🥂</span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight leading-none text-foreground">
                Prosecco.dev
              </h1>
              <p className="text-xs text-muted-foreground leading-none mt-0.5">
                AI Standards Directory
              </p>
            </div>
          </div>

          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search standards…"
              className="pl-9 h-9 bg-background/60"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
