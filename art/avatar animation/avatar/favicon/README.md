# Frida favicons & app icons

## Files
- favicon.svg          - vector favicon, transparent background (modern browsers)
- favicon-16/32/48.png - raster fallbacks, transparent
- apple-touch-icon.png - 180x180, teal background (iOS home screen)
- icon-192.png / icon-512.png - PWA icons, teal background

## HTML <head>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="/favicon-16.png" sizes="16x16" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">

## site.webmanifest
{
  "name": "Leerpad met Frida",
  "short_name": "Frida",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#2FA79B",
  "background_color": "#FDF8EE",
  "display": "standalone"
}
