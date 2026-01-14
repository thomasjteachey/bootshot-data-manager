## Build a standalone distributable (zip-friendly)

This project uses `electron-vite` to build the app bundles and `electron-builder`
to package them into a standalone folder you can zip and hand off.

### 1) Install dependencies

```bash
npm install
```

### 2) Build the app bundles

```bash
npm run build
```

### 3) Create a standalone distributable folder

```bash
npm run dist:dir
```

The packaged app will be created in the `dist/` folder (platform-specific).
You can zip that folder and share it with someone else.
