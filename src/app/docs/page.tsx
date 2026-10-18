"use client";

import Script from "next/script";

declare global {
  interface Window {
    SwaggerUIBundle?: (config: Record<string, unknown>) => unknown;
  }
}

export default function DocsPage() {
  return (
    <div className="docs-frame">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" />
      <div id="swagger" />
      <Script
        src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"
        strategy="afterInteractive"
        onLoad={() => window.SwaggerUIBundle?.({ url: "/openapi.yaml", dom_id: "#swagger", deepLinking: true })}
      />
    </div>
  );
}
