import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export default function LlmsTxt() {
  const [text, setText] = useState("Loading…");
  const location = useLocation();
  const full = location.pathname.includes("llms-full");

  useEffect(() => {
    const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/llms-txt${full ? "?full=true" : ""}`;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject("Failed")))
      .then(setText)
      .catch(() => setText("Error loading llms.txt"));
  }, [full]);

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
