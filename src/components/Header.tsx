import { Search, Bot } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Settings, Radar, Network, Clock } from "lucide-react";
import { NavLink } from "./NavLink";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function Header({ searchQuery, onSearchChange }: HeaderProps) {
  const { isAdmin } = useAuth();

  return (
    <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16">
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

          <div className="relative max-w-sm w-full hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search standards…"
              className="pl-9 h-9 bg-background/60"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground hover:text-foreground" asChild>
              <Link to="/radar">
                <Radar className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Radar</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground hover:text-foreground" asChild>
              <Link to="/timeline">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Timeline</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground hover:text-foreground" asChild>
              <Link to="/affiliations">
                <Network className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Affiliations</span>
              </Link>
            </Button>
            {isAdmin && (
              <Button variant="ghost" size="icon" className="h-9 w-9" asChild>
                <Link to="/admin" aria-label="Admin dashboard">
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" aria-label="LLMs.txt">
                  <Bot className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href="/llms.txt" target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                    llms.txt
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="/llms-full.txt" target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                    llms-full.txt
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="/directory.json" target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                    directory.json
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="/mcp" target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                    MCP Server
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle />
          </div>
        </div>

        {/* Mobile search */}
        <div className="pb-3 sm:hidden">
          <div className="relative">
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
