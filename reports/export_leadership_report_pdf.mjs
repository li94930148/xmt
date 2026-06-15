import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportDir = path.join(__dirname, "output", "leadership_report_v1");
const htmlPath = path.join(reportDir, "岚曜新媒体平台项目领导汇报初稿.html");
const pdfPath = path.join(reportDir, "岚曜新媒体平台项目领导汇报初稿.pdf");
const previewPath = path.join(reportDir, "岚曜新媒体平台项目领导汇报初稿-预览.png");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1400, height: 1980 },
  deviceScaleFactor: 1.5,
});

await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: {
    top: "0mm",
    right: "0mm",
    bottom: "0mm",
    left: "0mm",
  },
});
await page.screenshot({ path: previewPath, fullPage: true });
await browser.close();

console.log(pdfPath);
