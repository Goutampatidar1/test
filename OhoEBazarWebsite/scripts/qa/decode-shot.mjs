// Decodes a CDP Page.captureScreenshot JSON dump into an image file (visual QA helper).
// Usage: node scripts/qa/decode-shot.mjs <cdp-response.json> <out.jpg>
import fs from "node:fs";
import path from "node:path";

const [, , input, output] = process.argv;
const json = JSON.parse(fs.readFileSync(input, "utf8"));
const data = json.data ?? json.result?.data;
if (!data) throw new Error("No screenshot data in " + input);
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, Buffer.from(data, "base64"));
console.log("wrote", output);
