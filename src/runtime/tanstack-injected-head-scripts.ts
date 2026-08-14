// Minimal injected head scripts for TanStack Start dev environment.
// Exports a small HTML string to inject into the document head. This
// ensures the favicon and basic meta tags are present in dev SSR and
// Codespaces preview environments where the framework's virtual
// module may not be available.

export const injectedHeadScripts = `
	<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
	<link rel="apple-touch-icon" href="/favicon.svg" />
	<meta name="theme-color" content="#22d3ee" />
`;

export default { injectedHeadScripts };
