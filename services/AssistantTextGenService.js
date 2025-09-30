import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

if (!process.env.OPENAI_API_KEY || !process.env.ASSISTANT_ID) {
    throw new Error(
        "Missing OpenAI API key or Assistant ID in environment variables"
    );
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
const ASSISTANT_ID = process.env.ASSISTANT_ID;

const retrieveRun = async (threadId, runId) => {
    const resp = await fetch(
        `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                "OpenAI-Beta": "assistants=v2",
            },
        }
    );
    if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Retrieve run failed: ${resp.status} ${body}`);
    }
    return resp.json();
};

const waitForRunCompletion = async ({
    threadId,
    runId,
    intervalMs = 1200,
    timeoutMs = 120000,
}) => {
    if (!threadId?.startsWith("thread_"))
        throw new Error(`waitForRunCompletion: bad threadId ${threadId}`);
    if (!runId?.startsWith("run_"))
        throw new Error(`waitForRunCompletion: bad runId ${runId}`);

    const start = Date.now();
    while (true) {
        const run = await retrieveRun(threadId, runId);

        if (run.status === "completed") return run;
        if (["failed", "cancelled", "expired"].includes(run.status)) {
            throw new Error(`Run ended with status: ${run.status}`);
        }
        if (Date.now() - start > timeoutMs) throw new Error("Run timed out");
        await new Promise((r) => setTimeout(r, intervalMs));
        console.log(
            `Waiting for run to complete, current status: ${run.status}`
        );
    }
};

const getLastAssistantReply = async (threadId) => {
    if (!threadId?.startsWith("thread_"))
        throw new Error(`getLastAssistantReply: bad threadId ${threadId}`);

    const list = await openai.beta.threads.messages.list(threadId, {
        order: "desc",
        limit: 20,
    });

    const reply = list.data.find((m) => m.role === "assistant");
    if (!reply) return { text: "", raw: null };

    const text = (reply.content || [])
        .map((c) => (c.type === "text" ? c.text.value : ""))
        .filter(Boolean)
        .join("\n")
        .trim();

    return { text, raw: reply };
};

export const assistant = async (title, content) => {
    const thread = await openai.beta.threads.create();
    const threadId = thread?.id;
    if (!threadId?.startsWith("thread_"))
        throw new Error(`Invalid thread id: ${threadId}`);

    await openai.beta.threads.messages.create(threadId, {
        role: "user",
        content: [
            { type: "text", text: `Title: ${title}\nContent: ${content}` },
        ],
    });

    const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: ASSISTANT_ID,
    });
    const runId = run?.id;
    if (!runId?.startsWith("run_")) {
        throw new Error(`Invalid run id: ${runId}`);
    }

    await waitForRunCompletion({ threadId, runId });

    const { text } = await getLastAssistantReply(threadId);
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("Not valid JSON");
    }
    return parsed;
};
