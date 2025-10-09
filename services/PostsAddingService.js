import axios from "axios";
import { trackMixpanel } from "../mixpanel.js";
import dotenv from "dotenv";
import axiosRetry from "axios-retry";

dotenv.config();

const MAIN_URL = process.env.MAIN_URL;
const WP_USER = process.env.WP_USER;
const WP_PASS = process.env.WP_PASS;

const POST_STATUS = "draft";
const DEFAULT_CATEGORY_EN = 7;
const DEFAULT_CATEGORY_ID = 1;
const AUTHOR_ID = 2;

if (!MAIN_URL || !WP_PASS || !WP_USER) {
    throw new Error("Missed frontend credentials");
}

const basicToken = Buffer.from(`${WP_USER}:${WP_PASS}`).toString("base64");
const defaultHeaders = {
    "Content-Type": "application/json",
    Authorization: `Basic ${basicToken}`,
};

axiosRetry(axios, {
    retries: 5,
    retryDelay: (retryCount) => {
        console.log(`Retry saving data: ${retryCount}`);
        return retryCount * 2000;
    },
    retryCondition: (error) => {
        const isRetryable = axiosRetry.isNetworkOrIdempotentRequestError(error);
        const status = error.response?.status;

        return isRetryable || [429, 500, 502, 503, 504].includes(status);
    },
});

const addPost = async (source, date, post, lang, status = "draft") => {
    const { title, content, excerpt, author = 1, categories } = post;

    try {
        const payload = {
            title: title ?? `Untitled`,
            content: content ?? "",
            excerpt: excerpt ?? "",
            status: status ?? "draft",
            lang: lang,
            author,
            categories,
        };

        const response = await axios.post(
            `${MAIN_URL}wp-json/wp/v2/posts`,
            payload,
            {
                headers: defaultHeaders,
                timeout: 20000,
            }
        );
        console.log(`Response ${lang}`, response.data.link);

        trackMixpanel(
            "PostsAdder",
            source,
            date,
            response.data.link,
            1,
            true,
            "Post added successful"
        );
        return response?.data?.id;
    } catch (error) {
        console.log(
            `Post adding failed: ${error?.message ?? error.response?.data}`
        );
        trackMixpanel(
            "PostsAdder",
            source,
            date,
            "",
            1,
            false,
            error.response?.data ?? `Adding post failed for ${source}`
        );
    }
};

export const postsAddingService = async (source, posts) => {
    console.log(posts);

    const now = new Date();
    const dateNowStringifyForMixpanel = now.toLocaleString("uk-UA");
    console.log(`Start saving process for ${source}`);

    try {
        const savedPosts = [];

        let categories = null;
        try {
            const { data } = await axios.get(
                `${MAIN_URL}wp-json/wp/v2/categories?per_page=100`,
                {
                    headers: defaultHeaders,
                    timeout: 20000,
                }
            );
            categories = data;
            console.log(categories);
        } catch (error) {
            console.log("Error preparation categories!", error.message);
        }

        for (const post of posts) {
            const categoriesEn = [];
            const categoriesId = [];

            if (categories?.length > 0) {
                for (const category of categories) {
                    if (post.categories.includes(category.name)) {
                        categoriesEn.push(
                            category?.translations?.en ?? DEFAULT_CATEGORY_EN
                        );
                        categoriesId.push(
                            category?.translations?.id ?? DEFAULT_CATEGORY_ID
                        );
                        break;
                    }
                }

                if (categoriesEn.length === 0 || categoriesId.length === 0) {
                    categoriesEn.push(DEFAULT_CATEGORY_EN);
                    categoriesId.push(DEFAULT_CATEGORY_ID);
                }
            } else {
                categoriesEn.push(DEFAULT_CATEGORY_EN);
                categoriesId.push(DEFAULT_CATEGORY_ID);
            }

            // eng
            const engPostId = await addPost(
                source,
                dateNowStringifyForMixpanel,
                {
                    title: post.reworded_title_en,
                    content: post.reworded_content_en,
                    excerpt: post.excerpt_en,
                    author: AUTHOR_ID,
                    categories: categoriesEn,
                },

                "en",
                POST_STATUS
            );

            // ind
            const indPostId = await addPost(
                source,
                dateNowStringifyForMixpanel,
                {
                    title: post.reworded_title_id,
                    content: post.reworded_content_id,
                    excerpt: post.excerpt_id,
                    author: AUTHOR_ID,
                    categories: categoriesId,
                },
                "id",
                POST_STATUS
            );

            savedPosts.push({ engPostId, indPostId });
        }
        console.log(savedPosts);
        //link translations together
        savedPosts.map(async ({ engPostId, indPostId }) => {
            if (!engPostId || !indPostId) return;

            const body = { translations: { en: engPostId, id: indPostId } };

            try {
                await axios.post(
                    `${MAIN_URL}wp-json/wp/v2/posts/${indPostId}`,
                    body,
                    {
                        headers: defaultHeaders,
                        timeout: 20000,
                    }
                );
            } catch (error) {
                console.log(
                    "Error while link translations together",
                    error.message
                );
            }
        });
    } catch (error) {
        console.error("Error saving data:", error.message);
        console.error("Error saving data:", {
            message: error.message,
            response: error.response?.data || "No response data",
            status: error.response?.status || "No status",
        });
        trackMixpanel(
            "PostsAdder",
            source,
            dateNowStringifyForMixpanel,
            "",
            0,
            false,
            `Adding posts failed for ${source}`
        );
    }
};
