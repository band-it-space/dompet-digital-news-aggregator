import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

class TaskSchedulerService {
    constructor(
        schedule = process.env.CRON_SCHEDULE,
        timezone = process.env.TIMEZONE
    ) {
        this.tasks = [];
        this.mainTask = null;
        this.schedule = schedule;
        this.timezone = timezone;
    }

    addTask(task) {
        this.tasks.push(task);
        console.log(`Task added!`);
        this.manageCronJob();
    }

    removeTask(task) {
        this.tasks = this.tasks.filter((t) => t !== task);
        console.log(`Task removed`);
        this.manageCronJob();
    }

    async runTasksSequentially() {
        for (const task of this.tasks) {
            try {
                await task();
            } catch (error) {
                console.log(error);
                console.log("CRAWLER ERROR! Check logs");
            }
        }
    }

    manageCronJob() {
        if (this.tasks.length > 0 && !this.mainTask) {
            this.mainTask = cron.schedule(
                this.schedule,
                async () => {
                    await this.runTasksSequentially();
                },
                { timezone: this.timezone }
            );
            this.mainTask.start();
            console.log("Cron started!");
        } else if (this.tasks.length === 0 && this.mainTask) {
            this.mainTask.stop();
            this.mainTask = null;
            console.log("Cron stopped!");
        }
    }
}

export default TaskSchedulerService;
