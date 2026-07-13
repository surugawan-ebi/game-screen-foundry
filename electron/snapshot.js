"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const { createServer } = require("../server");

const HOST = "127.0.0.1";
const LOAD_TIMEOUT_MS = 45000;

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    options[arg.slice(2)] = args[index + 1] || "";
    index += 1;
  }
  return options;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

async function prepareCanvas(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const deadline = Date.now() + ${LOAD_TIMEOUT_MS};
    let canvas = null;
    while (Date.now() < deadline) {
      canvas = document.getElementById("screenCanvas");
      const layers = canvas ? [...canvas.querySelectorAll("img.screen-layer")] : [];
      if (canvas && canvas.style.width && canvas.style.height && layers.length > 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!canvas || !canvas.style.width || !canvas.style.height) {
      throw new Error("Timed out waiting for the assembled screen canvas.");
    }
    const images = [...canvas.querySelectorAll("img.screen-layer")];
    await Promise.all(images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0) {
        return;
      }
      try {
        await image.decode();
      } catch (error) {
        throw new Error("Failed to load screen layer: " + (image.alt || image.src));
      }
    }));
    canvas.querySelectorAll(".safe-area, .composition-outline, .composition-content-outline, .placement-edit-overlay").forEach((element) => element.remove());
    canvas.querySelectorAll(".screen-layer").forEach((element) => {
      element.classList.remove("is-outside-composition", "is-selected-composition-layer", "is-selected-placement");
    });
    document.body.replaceChildren(canvas);
    Object.assign(document.documentElement.style, {
      margin: "0",
      padding: "0",
      overflow: "hidden",
      background: "#091018"
    });
    Object.assign(document.body.style, {
      margin: "0",
      padding: "0",
      overflow: "hidden",
      background: "#091018"
    });
    Object.assign(canvas.style, {
      position: "fixed",
      left: "0",
      top: "0",
      margin: "0",
      border: "0",
      borderRadius: "0",
      boxShadow: "none"
    });
    return {
      width: Math.round(parseFloat(canvas.style.width)),
      height: Math.round(parseFloat(canvas.style.height)),
      layerCount: images.length
    };
  })()`);
}

async function capture(options) {
  if (!options.folder || !options.screen || !options.out) {
    throw new Error("Snapshot renderer requires --folder, --screen, and --out.");
  }
  const server = createServer();
  let window = null;
  try {
    const address = await listen(server);
    const url = new URL(`http://${HOST}:${address.port}`);
    url.searchParams.set("folder", options.folder);
    url.searchParams.set("screen", options.screen);
    window = new BrowserWindow({
      width: 1600,
      height: 1200,
      show: false,
      backgroundColor: "#091018",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    await window.loadURL(url.toString());
    const canvas = await prepareCanvas(window);
    window.setContentSize(canvas.width, canvas.height);
    await new Promise((resolve) => setTimeout(resolve, 100));
    let image = await window.webContents.capturePage({
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height
    });
    const size = image.getSize();
    if (size.width !== canvas.width || size.height !== canvas.height) {
      image = image.resize({ width: canvas.width, height: canvas.height, quality: "best" });
    }
    const outputPath = path.resolve(options.out);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, image.toPNG());
  } finally {
    if (window && !window.isDestroyed()) {
      window.destroy();
    }
    await closeServer(server);
  }
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    await capture(parseArgs(process.argv.slice(2)));
    app.exit(0);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    app.exit(1);
  }
});
