import { STATUS } from "../utils/constants.js";
import { CRAWLERS } from "../crawlers/index.js";
import TaskSchedulerService from "../services/TaskSchedulerService.js";

const taskScheduler = new TaskSchedulerService();

export const addTask = (req, res) => {
    const { taskName } = req.body;
    console.log(req.body);

    if (!CRAWLERS[taskName]) {
        return res.status(400).json({
            status: STATUS.error,
            message: `Scraping for ${taskName} was not exist in your scrappers!`,
        });
    }

    if (!taskScheduler.tasks.includes(CRAWLERS[taskName])) {
        taskScheduler.addTask(CRAWLERS[taskName]);
        return res.status(200).json({
            status: STATUS.success,
            message: `Scraping for ${taskName} started!`,
        });
    } else {
        return res.status(400).json({
            status: STATUS.error,
            message: `Scraping for ${taskName} was already started!`,
        });
    }
};

export const removeTask = (req, res) => {
    const { taskName } = req.body;

    if (!CRAWLERS[taskName]) {
        return res.status(400).json({
            status: STATUS.error,
            message: `Scraping for ${taskName} was not exist in your scrappers!`,
        });
    }

    if (taskScheduler.tasks.includes(CRAWLERS[taskName])) {
        taskScheduler.removeTask(CRAWLERS[taskName]);
        return res.status(200).json({
            status: STATUS.success,
            message: `Scraping for ${taskName} was stopped!`,
        });
    } else {
        return res.status(400).json({
            status: STATUS.error,
            message: `Scraping for ${taskName} was already removed!`,
        });
    }
};
