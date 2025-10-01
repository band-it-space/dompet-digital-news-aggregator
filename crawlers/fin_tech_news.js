import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { trackMixpanel } from "../mixpanel.js";
import { assistant } from "../services/AssistantTextGenService.js";
import { sheet } from "../services/GoogleSheetService.js";
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

    $("img").remove();
    const cleanText = $("body").text().trim();
    return { content: cleanText || "", originImg: originImg ?? "" };
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
        const dateNowStringifyForMixpanel = now.toLocaleString("uk-UA");

        console.log(dateNowStringifyForMixpanel);

        if (!inLastHour(feed.lastBuildDate, now)) {
            console.log("No new updates in the last hour.");
            trackMixpanel(
                "FinTechNews",
                dateNowStringifyForMixpanel,
                "",
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
            dateNowStringifyForMixpanel,
            articles.map((a) => a.link).join("; "),
            articles.length,
            true,
            "Parsing completed successfully"
        );

        const rewordedArticles = await Promise.all(
            articles.map(async (article) => {
                try {
                    const rewordedArticle = await assistant(
                        article.title,
                        article.contentHtml
                    );

                    return {
                        ...article,
                        categories: article.categories.join(", "),
                        reworded_title_en: rewordedArticle.en.title,
                        reworded_content_en: rewordedArticle.en.content,
                        excerpt_en: rewordedArticle.en.excerpt,
                        reworded_title_id: rewordedArticle.id.title,
                        reworded_content_id: rewordedArticle.id.content,
                        excerpt_id: rewordedArticle.id.excerpt,
                    };
                } catch (error) {
                    console.error(
                        "Error rewording article:",
                        article.title,
                        err
                    );
                    return null;
                }
            })
        );
        const filteredRewordedArticles = rewordedArticles.filter(Boolean);
        await sheet.appendRows(filteredRewordedArticles);
    } catch (error) {
        console.error("FinTechNews crawler error:", error);
    }
}

// For testing purpose
// (async () => {
//     await fetchFinTechNews();
// })();
