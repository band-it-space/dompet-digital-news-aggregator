import axios from "axios";
import { trackMixpanel } from "../mixpanel.js";
import dotenv from "dotenv";
import axiosRetry from "axios-retry";

dotenv.config();

const MAIN_URL = process.env.MAIN_URL;

axiosRetry(axios, {
    retries: 5,
    retryDelay: (retryCount) => {
        console.log(`Retry saving data: ${retryCount}`);
        return retryCount * 2000;
    },
    retryCondition: (error) => {
        const isRetryable = axiosRetry.isNetworkOrIdempotentRequestError(error);
        const status = error.response?.status;

        return isRetryable || [502, 503, 504].includes(status);
    },
});

export const postsAddingService = async (donor, posts) => {
    try {
        await axios.post(
            MAIN_URL,
            JSON.stringify({
                donor,
                posts,
            }),
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        trackMixpanel(donor, posts.length, true, undefined);
    } catch (error) {
        console.error("Error saving data:", error.message);
        console.error("Error saving data:", {
            message: error.message,
            response: error.response?.data || "No response data",
            status: error.response?.status || "No status",
        });
        trackMixpanel(donor, 0, false, error.message);
    }

    console.log(`${companyName} vacancies saved!`);
};
