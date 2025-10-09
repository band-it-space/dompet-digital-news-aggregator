import fs from "fs";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { trackMixpanel } from "../mixpanel.js";
import { assistant } from "../services/AssistantTextGenService.js";
import { sheet } from "../services/GoogleSheetService.js";
import { postsAddingService } from "../services/PostsAddingService.js";

const filePath = "./data/fin_tech_news.txt";

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
    console.log("FinTechNews crawler started");
    const now = new Date();
    const dateNowStringifyForMixpanel = now.toLocaleString("uk-UA");
    let feed;
    try {
        feed = await parser.parseURL("https://fintechnews.sg/feed/");

        if (!feed) throw new Error("Failed to fetch or parse the RSS feed.");

        console.log(dateNowStringifyForMixpanel);

        let uniqueArticles = [];
        if (fs.existsSync(filePath)) {
            let articlesFromFile = fs
                .readFileSync(filePath, "utf8")
                .split("\n")
                .filter(Boolean);

            //check file length and trim if too long
            if (articlesFromFile.length > 100) {
                articlesFromFile = articlesFromFile.slice(50);
                fs.writeFileSync(filePath, articlesFromFile.join("\n") + "\n");
            }
            feed.items.map((item) => console.log(item.link));

            const articlesSet = new Set(articlesFromFile);
            uniqueArticles = feed.items.filter(
                (item) => !articlesSet.has(item.link)
            );

            if (uniqueArticles.length === 0) {
                console.log("No new updates in the last hour.");
                trackMixpanel(
                    "Parser",
                    "FinTechNews",
                    dateNowStringifyForMixpanel,
                    "",
                    0,
                    true,
                    "No new updates in the last hour."
                );
                return;
            }
        } else {
            fs.writeFileSync(
                filePath,
                feed.items.map((it) => it.link).join("\n") + "\n"
            );
            uniqueArticles.push(...feed.items);
        }

        const articles = uniqueArticles.map((item) => {
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
            "Parser",
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
                    trackMixpanel(
                        "Parser",
                        "FinTechNews",
                        dateNowStringifyForMixpanel,
                        "",
                        0,
                        false,
                        `Error rewording article`
                    );
                    console.error(
                        "Error rewording article:",
                        article.title,
                        error
                    );
                    return null;
                }
            })
        );
        const filteredRewordedArticles = rewordedArticles.filter(Boolean);
        // await sheet.appendRows(filteredRewordedArticles);
        console.log("Parsed new articles:", articles.length);
        await postsAddingService("FinTechNews Test", filteredRewordedArticles);
        fs.appendFileSync(
            filePath,
            uniqueArticles.map((it) => it.link).join("\n") + "\n"
        );
    } catch (error) {
        console.error("FinTechNews crawler error:", error);
        trackMixpanel(
            "Parser",
            "FinTechNews",
            dateNowStringifyForMixpanel,
            "",
            0,
            false,
            `FinTechNews crawler error: ${error}`
        );
    }
}
