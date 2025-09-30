import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { trackMixpanel } from "../mixpanel.js";
// import { postsAddingService } from "../services/PostsAddingService.js";

const toArray = (v) => (Array.isArray(v) ? v : v != null ? [v] : []);

const cleanContent = (html = "") => {
    const $ = cheerio.load(html, { decodeEntities: false });

    const featured = $("p em")
        .filter((_, el) =>
            $(el).text().trim().toLowerCase().startsWith("featured image")
        )
        .closest("p");

    let originImg = null;
    if (featured.length > 0) {
        originImg = featured.find("a").attr("href") || null;
    }

    $("p")
        .filter((_, el) => {
            const text = $(el).text().trim();
            return (
                /^The post .* appeared first on /i.test(text) ||
                /^Featured image:/i.test(text)
            );
        })
        .remove();

    return { content: $("body").html() || "", originImg: originImg ?? "" };
};

const inLastHour = (date, now = new Date()) => {
    const postDate = new Date(date || 0);
    if (Number.isNaN(postDate.getTime())) return false;
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    return postDate > oneHourAgo && postDate <= now;
};

const parser = new Parser({
    headers: {
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    },
    timeout: 15000,
    customFields: {
        feed: ["lastBuildDate", "language"],
        item: [
            ["content:encoded", "contentHtml"],
            ["dc:creator", "author"],
        ],
    },
});

export async function fetchFinTechNews() {
    try {
        console.log("FinTechNews crawler started");

        const feed = await parser.parseURL("https://fintechnews.sg/feed/");

        if (!feed) throw new Error("Failed to fetch or parse the RSS feed.");

        const now = new Date();
        const dateNowStringify = now.toISOString();

        if (!inLastHour(feed.lastBuildDate, now)) {
            console.log("No new updates in the last hour.");
            trackMixpanel(
                "FinTechNews",
                dateNowStringify,
                0,
                true,
                "No new updates in the last hour."
            );
            return;
        }
        const recentItems = feed.items.filter((it) =>
            inLastHour(it.isoDate || it.pubDate, now)
        );
        const articles = recentItems.map((item) => {
            const { content, originImg } = cleanContent(
                item.contentHtml || item.content || item.description || ""
            );
            return {
                title: item.title ?? "No title",
                link: item.link ?? null,
                guid: item.guid ?? item.link ?? null,
                pubDate: item.isoDate || item.pubDate || null,
                author: item.author || null,
                categories: toArray(item.categories).map(String),
                contentHtml: content,
                originImg,
            };
        });

        trackMixpanel(
            "FinTechNews",
            dateNowStringify,
            articles.length,
            true,
            "Parsing completed successfully"
        );
        postsAddingService("FinTechNews", articles);
    } catch (error) {
        console.error("FinTechNews crawler error:", error);
    }
}

// For testing purpose
// (async () => {
//     await fetchFinTechNews();
// })();
