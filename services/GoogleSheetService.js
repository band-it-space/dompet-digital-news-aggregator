import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import fs from "fs/promises";
import { fileURLToPath } from "url";

class GoogleSpreadsheetService {
    constructor(doc, sheet) {
        this.doc = doc;
        this.sheet = sheet;
    }
    static async init({ credsPath, spreadsheetId, sheetIndex = 0 }) {
        const creds = JSON.parse(await fs.readFile(credsPath, "utf-8"));
        const jwt = new JWT({
            email: creds.client_email,
            key: creds.private_key.replace(/\\n/g, "\n"),
            scopes: [
                "https://www.googleapis.com/auth/spreadsheets",
                "https://www.googleapis.com/auth/drive.file",
            ],
        });

        const doc = new GoogleSpreadsheet(spreadsheetId, jwt);
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[sheetIndex];

        return new GoogleSpreadsheetService(doc, sheet);
    }

    async appendRows(objects) {
        if (!Array.isArray(objects))
            throw new Error("Arrey of objects expected");
        if (objects.length === 0) return;

        let headerLoaded = true;
        try {
            await this.sheet.loadHeaderRow();
        } catch (err) {
            headerLoaded = false;
        }
        console.log(1);

        if (!headerLoaded) {
            const headers = Object.keys(objects[0]);
            console.log("[appendRows] 2: setHeaderRow", headers);
            await this.sheet.setHeaderRow(headers);

            await this.sheet.loadHeaderRow();
            console.log(
                "[appendRows] 3: headerValues after set =",
                this.sheet.headerValues
            );
        }
        console.log("Appending rows:", objects);

        await this.sheet.addRows(objects);
    }
}
export const sheet = await GoogleSpreadsheetService.init({
    credsPath: fileURLToPath(new URL("./search_creds.json", import.meta.url)),
    spreadsheetId: "1vNY6EHU2LHnVY-gCFtElqgas1NlFT4YtPwKzp7L6O8U",
    sheetIndex: 1,
});
