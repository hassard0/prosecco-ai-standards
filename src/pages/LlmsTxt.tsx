import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export default function LlmsTxt() {
  const [text, setText] = useState("Loading…");
  const location = useLocation();
  const isJson = location.pathname.includes("directory.json");
  const full = location.pathname.includes("llms-full");

  useEffect(() => {
    const params = isJson ? "?format=json" : full ? "?full=true" : "";
    const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/llms-txt${params}`;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject("Failed")))
      .then((t) => setText(isJson ? JSON.stringify(JSON.parse(t), null, 2) : t))
      .catch(() => setText("Error loading content"));
  }, [full, isJson]);

  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: "monospace",
        fontSize: "14px",
        padding: "2rem",
        margin: 0,
        background: "var(--background)",
        color: "var(--foreground)",
        minHeight: "100vh",
      }}
    >
      {text}
    </pre>
  );
}
