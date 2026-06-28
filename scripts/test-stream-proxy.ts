/**
 * Simule register → fetch token → rewrite manifest pour flux jmp2.uk / Pluto TV.
 * Usage: npx tsx scripts/test-stream-proxy.ts
 */
import {
  registerStreamProxyToken,
  resolveStreamProxyToken,
  proxyStreamFetch,
} from "../src/lib/stream-proxy";

const USER_ID = "test-user";

function firstVideoVariantToken(manifest: string): string | null {
  const lines = manifest.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
      const next = lines[i + 1]?.trim();
      const match = next?.match(/\/api\/stream\/proxy\/([A-Za-z0-9_-]+)/);
      if (match) return match[1];
    }
  }
  return null;
}

function firstSubtitleToken(manifest: string): string | null {
  const lines = manifest.split("\n");
  for (const line of lines) {
    if (line.startsWith("#EXT-X-MEDIA") && /TYPE=SUBTITLES/i.test(line)) {
      const match = line.match(/URI="\/api\/stream\/proxy\/([A-Za-z0-9_-]+)"/);
      if (match) return match[1];
    }
  }
  return null;
}

async function main() {
  const entryUrl = "https://jmp2.uk/plu-6380c94947c72b0007ee9a13.m3u8";

  const mainToken = registerStreamProxyToken(USER_ID, entryUrl);
  if (!mainToken) {
    console.error("FAIL: register entry URL");
    process.exit(1);
  }
  console.log("Main token:", mainToken);

  const resolved = resolveStreamProxyToken(mainToken, USER_ID);
  console.log("Resolved entry:", resolved?.slice(0, 80) + "...");

  const response = await proxyStreamFetch(USER_ID, resolved!);
  console.log("Proxy fetch status:", response.status);

  if (!response.ok) {
    console.error("FAIL: proxy fetch returned", response.status);
    process.exit(1);
  }

  const manifest = await response.text();
  console.log("Manifest lines:", manifest.split("\n").length);

  if (!/TYPE=SUBTITLES/i.test(manifest)) {
    console.error("FAIL: manifest missing SUBTITLES media tracks");
    process.exit(1);
  }
  console.log("Subtitle tracks present: OK");

  const subtitleToken = firstSubtitleToken(manifest);
  if (!subtitleToken) {
    console.error("FAIL: no proxied subtitle URI in manifest");
    process.exit(1);
  }
  console.log("Subtitle token:", subtitleToken);

  const subtitleUrl = resolveStreamProxyToken(subtitleToken, USER_ID);
  if (!subtitleUrl) {
    console.error("FAIL: subtitle token not in cache");
    process.exit(1);
  }
  if (!subtitleUrl.includes("/subtitle/")) {
    console.error("FAIL: subtitle token does not resolve to subtitle playlist");
    process.exit(1);
  }
  console.log("Subtitle URL:", subtitleUrl.slice(0, 120) + "...");

  const subtitleResponse = await proxyStreamFetch(USER_ID, subtitleUrl);
  console.log("Subtitle proxy status:", subtitleResponse.status);
  if (!subtitleResponse.ok) {
    console.error("FAIL: subtitle fetch returned", subtitleResponse.status);
    process.exit(1);
  }

  const subtitlePlaylist = await subtitleResponse.text();
  const vttLines = subtitlePlaylist
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"));
  console.log("Subtitle playlist segment lines:", vttLines.length);

  const longLines = manifest
    .split("\n")
    .filter(
      (l) =>
        l.trim() &&
        !l.startsWith("#") &&
        (l.includes("pluto.tv") || l.includes("jmp2.uk") || l.length > 200)
    );
  const proxyLines = manifest
    .split("\n")
    .filter((l) => l.includes("/api/stream/proxy/"));

  console.log("Lines with upstream URLs (bad):", longLines.length);
  console.log("Lines with proxy tokens (good):", proxyLines.length);

  if (longLines.length > 0) {
    console.error("FAIL: manifest still contains upstream URLs:");
    longLines.slice(0, 3).forEach((l) => console.error(" ", l.slice(0, 120) + "..."));
    process.exit(1);
  }

  const variantToken = firstVideoVariantToken(manifest);
  if (!variantToken) {
    console.error("FAIL: no video variant token in manifest");
    process.exit(1);
  }

  console.log("Video variant token:", variantToken);

  const variantUrl = resolveStreamProxyToken(variantToken, USER_ID);
  if (!variantUrl) {
    console.error("FAIL: variant token not in cache");
    process.exit(1);
  }
  if (variantUrl.includes("/subtitle/")) {
    console.error("FAIL: variant is subtitle track, not video");
    process.exit(1);
  }
  console.log("Variant URL length:", variantUrl.length);
  console.log("Variant URL:", variantUrl.slice(0, 120) + "...");

  const variantResponse = await proxyStreamFetch(USER_ID, variantUrl);
  console.log("Variant proxy status (1st):", variantResponse.status);

  if (!variantResponse.ok) {
    console.error("FAIL: variant fetch returned", variantResponse.status);
    process.exit(1);
  }

  const mediaPlaylist = await variantResponse.text();
  if (!mediaPlaylist.trimStart().startsWith("#EXTM3U")) {
    console.error("FAIL: media playlist missing #EXTM3U");
    process.exit(1);
  }

  const mediaUpstreamLines = mediaPlaylist
    .split("\n")
    .filter(
      (l) =>
        l.trim() &&
        !l.startsWith("#PLUTO") &&
        (l.includes("pluto.tv") || l.includes("jmp2.uk"))
    );
  if (mediaUpstreamLines.length > 0) {
    console.error("FAIL: media playlist still contains upstream URLs");
    process.exit(1);
  }

  const keyUriMatch = mediaPlaylist.match(/#EXT-X-KEY:[^\n]*URI="([^"]+)"/);
  if (keyUriMatch && !keyUriMatch[1].includes("/api/stream/proxy/")) {
    console.error("FAIL: EXT-X-KEY URI not proxied");
    process.exit(1);
  }
  console.log("Media playlist proxied (segments + keys): OK");

  const segmentLines = mediaPlaylist
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"));
  console.log("Media playlist segment lines:", segmentLines.length);

  if (segmentLines.length === 0) {
    console.error("FAIL: no segment lines in media playlist");
    process.exit(1);
  }

  const firstSegmentToken = segmentLines[0].match(/\/api\/stream\/proxy\/([A-Za-z0-9_-]+)/)?.[1];
  if (!firstSegmentToken) {
    console.error("FAIL: first segment not proxied");
    process.exit(1);
  }

  const segmentUrl = resolveStreamProxyToken(firstSegmentToken, USER_ID);
  if (!segmentUrl) {
    console.error("FAIL: segment token not in cache");
    process.exit(1);
  }

  const segmentResponse = await proxyStreamFetch(USER_ID, segmentUrl);
  console.log("First segment proxy status:", segmentResponse.status);
  if (!segmentResponse.ok) {
    console.error("FAIL: segment fetch returned", segmentResponse.status);
    process.exit(1);
  }
  console.log("First segment bytes:", (await segmentResponse.arrayBuffer()).byteLength);

  const variantResponse2 = await proxyStreamFetch(USER_ID, variantUrl);
  console.log("Variant proxy status (refresh):", variantResponse2.status);

  if (!variantResponse2.ok) {
    console.error("FAIL: playlist refresh returned", variantResponse2.status);
    process.exit(1);
  }

  console.log("OK: full proxy flow succeeded (subtitles proxied, refresh OK)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
