import { Request, Response, NextFunction } from "express";
import { pool } from "../models/db";
const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const client = new BedrockRuntimeClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const aiController = {
  //connect and grab data from bedrock ai
  async getDataBedrock(req: Request, res: Response, next:NextFunction) {
    const id = res.locals.userId;

    const response = await pool.query(
      `SELECT user_id, element, element_name, dataset_id, x_coord, y_coord, user_browser, user_os, page_url
        FROM "clickTable2"
        WHERE user_id = $1`,
      [id]
    );
  const allDataResponse = response.rows.map((row: any) => ({
        element: row.element,
        dataset_id: row.dataset_id,
        x_coord: row.x_coord,
        y_coord: row.y_coord,
        user_browser: row.user_browser,
        user_os: row.user_os,
        page_url: row.page_url
      }));

    const requestBody = JSON.stringify({
        inputText: JSON.stringify(allDataResponse) + "this data is the result of users interating with the website, give a overall report and summary of the data keep it short and sweet",
        textGenerationConfig: {
          maxTokenCount: 2000,
        }
      });
    try {
      const params = {
        modelId: "amazon.titan-text-premier-v1:0",
        contentType: "application/json",
        accept: "application/json",
        body: requestBody,
       }
     

      const command = new InvokeModelCommand(params);
      const response = await client.send(command);
      const result = JSON.parse(Buffer.from(response.body).toString('utf-8'));
      res.json(result.results[0].outputText);
    } catch (err) {
      const error = err as Error;
      return next({
        message: "Error in getAiData: " + error.message,
        log: error,
      });
    }
  },

  async getDataOpenai  (req: Request, res: Response, next:NextFunction) {
    //connect and grab data from open ai
    const id = res.locals.userId;
    const response = await pool.query(
      `SELECT user_id, element, element_name, dataset_id, x_coord, y_coord, user_browser, user_os, page_url
        FROM "clickTable2"
        WHERE user_id = $1`,
      [id]
    );
  const allDataResponse = response.rows.map((row: any) => ({
        element: row.element,
        dataset_id: row.dataset_id,
        x_coord: row.x_coord,
        y_coord: row.y_coord,
        user_browser: row.user_browser,
        user_os: row.user_os,
        page_url: row.page_url
      }));
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: process.env.OPEN_AI_KEY!,
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [
            {
              role: "user",
              content: JSON.stringify(allDataResponse) + "this data is the result of users interating with the website, give a overall report and summary of the data keep it short and sweet"
            },
          ],
        }),
      });
  
      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }
  
      const data :any= await response.json();
      console.log("OpenAI API response:", data);
  
      if (data.choices && data.choices.length > 0) {
        const summarizedText = data.choices[0].message.content;
        res.json({ summarizedText });
      } else {
        res.status(500).json({ error: 'No choices returned from OpenAI API' });
      }
    } catch (err) {
      const error = err as Error;
      return next({
        message: "Error in getAiData: " + error.message,
        log: error,
      });
    }
  },
};

export default aiController;
