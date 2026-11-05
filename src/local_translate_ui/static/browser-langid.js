import { t } from "./i18n.js";

let classifier;

async function loadClassifier() {
  const metadata = await fetch(new URL("./langid.json", import.meta.url));
  const response = await fetch(new URL("./langid.bin.gz", import.meta.url));
  if (!metadata.ok || !response.ok) throw new Error(t("言語判定データを取得できませんでした。"));
  const { classes, transitions, states } = await metadata.json();
  const buffer = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  const moves = new Uint32Array(buffer, 0, transitions);
  const rows = new Uint32Array(buffer, transitions * 4, states);
  const output = new Int32Array(buffer, (transitions + states) * 4, states);
  const priors = new Float32Array(buffer, (transitions + 2 * states) * 4, classes.length);
  const weights = new Float32Array(buffer, (transitions + 2 * states + classes.length) * 4);
  return { classes, moves, rows, output, priors, weights };
}

export async function detectLanguage(text) {
  classifier ??= loadClassifier().catch((error) => {
    classifier = undefined;
    throw error;
  });
  const { classes, moves, rows, output, priors, weights } = await classifier;
  if (/\p{Uppercase}/u.test(text) && !/\p{Lowercase}/u.test(text)) text = text.toLowerCase();
  const counts = new Map();
  let state = 0;
  for (const byte of new TextEncoder().encode(text.normalize("NFC"))) {
    state = moves[rows[state] * 256 + byte];
    const feature = output[state];
    if (feature >= 0) counts.set(feature, (counts.get(feature) || 0) + 1);
  }
  if (!counts.size) return classes[0];
  const scores = new Float64Array(priors);
  for (const [feature, count] of counts) {
    const offset = feature * scores.length;
    const factor = Math.log1p(count);
    for (let i = 0; i < scores.length; i++) scores[i] += weights[offset + i] * factor;
  }
  return classes[scores.indexOf(Math.max(...scores))];
}
