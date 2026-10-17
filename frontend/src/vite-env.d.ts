/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_MOCK?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_GOOGLE_MAPS_BROWSER_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace JSX {
  interface IntrinsicElements {
    'gmp-place-details': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    'gmp-place-details-place-request': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & { 'place-id'?: string },
      HTMLElement
    >;
  }
}
