# Netlify Config Bundle

This bundle includes:
- `.nvmrc` to lock Node.js version to 20 (needed for Next.js 14).
- `netlify.toml` to set build command and publish directory.

## How to use
1. Unzip this bundle.
2. Drag and drop **both files** into your GitHub repo root.
3. Commit changes.
4. Trigger a new deploy on Netlify.

Once in place, Netlify will:
- Use Node 20 for builds
- Run `npm run build && npm run export`
- Serve from the `out` directory
