import { Github } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t mt-auto py-8 px-4">
      <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/ai-standards-lab/prosecco"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
            aria-label="GitHub repository"
          >
            <Github className="h-4 w-4" />
            <span>GitHub</span>
          </a>
          <span className="hidden sm:inline">·</span>
          <p>
            <span className="font-medium text-foreground">Prosecco.dev</span>{" "}
            — Cataloging AI standards for the community.
          </p>
        </div>
        <p className="text-center sm:text-right italic opacity-75">
          In memory of Vittorio Bertocci — whose passion for identity standards continues to inspire.
        </p>
      </div>
    </footer>
  );
}
