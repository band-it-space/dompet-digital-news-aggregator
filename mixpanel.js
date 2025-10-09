import Mixpanel from "mixpanel";
import dotenv from "dotenv";

dotenv.config();

const MIXPANEL_SECRET = process.env.MIXPANEL_SECRET;
const MIXPANEL_TOKEN = process.env.MIXPANEL_TOKEN;

const mixpanel = Mixpanel.init(MIXPANEL_TOKEN, {
    secret: MIXPANEL_SECRET,
});

export const trackMixpanel = async (
    event,
    crawler,
    stringDate,
    links,
    totalPosts,
    successful,
    message
) => {
    mixpanel.track(
        event,
        {
            crawler,
            posts_found: totalPosts,
            posted_date: stringDate,
            links: links,
            status: successful ? "Success" : "Fail",
            message: message ? message : "Parsing completed successfully",
        },
        (err) => {
            if (err) {
                console.error(`Error tracking event for ${crawler}:`, err);
            } else {
                console.log(
                    `Event:${event} for ${crawler} tracked successfully`
                );
            }
        }
    );
};
