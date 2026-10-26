// Local stand-in for https://www.youtube.com/oembed used by E2E tests
// (the sandbox that runs them can't reach youtube.com).
import http from "node:http";

const VIDEOS = {
  AAAAAAAAAAA: { title: "Test Anthem (Karaoke Version)", author_name: "Test Karaoke Channel" },
  DDDDDDDDDDD: { title: "Broken Embed Song (Official Video)", author_name: "Some Artist" },
};
const port = Number(process.env.MOCK_OEMBED_PORT ?? 3299);

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/health") return res.end("ok");
    const target = new URL(url.searchParams.get("url") ?? "https://www.youtube.com/watch");
    const id = target.searchParams.get("v");
    if (id === "BBBBBBBBBBB") {
      res.statusCode = 401; // YouTube answers 401 when embedding is disabled
      return res.end("Unauthorized");
    }
    const video = id && VIDEOS[id];
    if (!video) {
      res.statusCode = 404;
      return res.end("Not Found");
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ...video, type: "video", provider_name: "YouTube" }));
  })
  .listen(port, "127.0.0.1", () => console.log(`mock oEmbed on ${port}`));
