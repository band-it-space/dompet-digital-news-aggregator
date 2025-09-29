import express from "express";
import dotenv from "dotenv";

import crawlersInitialRoutes from "./routes/crawlers_initial_routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.use("/crawlers", crawlersInitialRoutes);

app.listen(PORT, () => {
    console.log(`Server http://localhost:${PORT} started`);
});
