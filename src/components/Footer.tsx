export function Footer() {
  return (
    <footer className="border-t mt-auto py-8 px-4">
      <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Prosecco.dev</span>{" "}
          — Cataloging AI standards for the community.
        </p>
        <p className="text-center sm:text-right italic opacity-75">
          In memory of Vittorio Bertocci — whose passion for identity standards continues to inspire.
        </p>
      </div>
    </footer>
  );
}
