import { Request, Response, NextFunction } from "express";
import { pool } from "../models/db";
const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");
import { ClickData, OpenAIResponse } from "../types";
import { decrypt } from "../middleware/awsEncryption";

const aiController = {
  async getDataBedrock(req: Request, res: Response, next: NextFunction) {
    const id = res.locals.userId;
    let { website, timeFrame } = req.body;
    if (website == "overview") {
      website = "";
    }

    let query: string,
      queryParams: Array<string | number> = [id];

    if (website) {
      query = `
        SELECT 
          "page_url",
          COUNT(*) AS total_clicks,
          AVG(CAST("x_coord" AS INTEGER)) AS avg_x_coord,
          AVG(CAST("y_coord" AS INTEGER)) AS avg_y_coord
        FROM 
          "clickTable2"
        WHERE
          "user_id" = $1
          AND "website_name" = $2
          ${
            timeFrame !== "allTime"
              ? `AND "created_at" >= NOW() - INTERVAL '${timeFrame}'`
              : ""
          }
        GROUP BY 
          "page_url"
        ORDER BY 
          "page_url";
      `;
      queryParams.push(website);
    } else {
      query = `
        SELECT 
          "website_name",
          COUNT(*) AS total_clicks
        FROM 
          "clickTable2"
        WHERE
          "user_id" = $1
          ${
            timeFrame !== "allTime"
              ? `AND "created_at" >= NOW() - INTERVAL '${timeFrame}'`
              : ""
          }
        GROUP BY 
          "website_name"
        ORDER BY 
          total_clicks DESC;
      `;
    }

    try {
      const awsCredsQuery = `
        SELECT "AWS_ACCESS_KEY", "AWS_SECRET_KEY" 
        FROM "userTable2" 
        WHERE "cognito_id" = $1
      `;
      const awsCredsResponse = await pool.query(awsCredsQuery, [id]);
      const encryptedClientKey = JSON.parse(
        awsCredsResponse.rows[0].AWS_ACCESS_KEY
      );
      const encryptedSecretKey = JSON.parse(
        awsCredsResponse.rows[0].AWS_SECRET_KEY
      );

      const AWS_ACCESS_KEY = decrypt(encryptedClientKey);
      const AWS_SECRET_KEY = decrypt(encryptedSecretKey);

      const client = new BedrockRuntimeClient({
        region: "us-east-1",
        credentials: {
          accessKeyId: AWS_ACCESS_KEY,
          secretAccessKey: AWS_SECRET_KEY,
        },
      });
      const response = await pool.query(query, queryParams);
      if (response.rows.length === 0) {
        return res.status(404).json({
          message: "Please gather some data before generating an AI response.",
        });
      }

      const relevantData = response.rows.map((row: ClickData) => {
        if (website) {
          return {
            page_url: row.page_url,
            total_clicks: row.total_clicks,
            avg_x_coord: row.avg_x_coord,
            avg_y_coord: row.avg_y_coord,
          };
        } else {
          return {
            website_name: row.website_name,
            total_clicks: row.total_clicks,
          };
        }
      });

      let promptText = "";

      if (website) {
        promptText = `
          Here is the summarized data of user interactions with the website:
          - Page URLs and the total number of clicks.
          - The average x and y coordinates.
          Please provide an overall report and summary of this data.
          Also, analyze the x and y coordinates to summarize where the majority of user interactions occurred on the screen based on screen size.
          Please keep this in numbered list format.
          `;
      } else {
        promptText = `
          Here is the summarized data of user interactions:
          - Website names and the total number of clicks.
          Please provide an overall report and summary of this data.
          Please keep this in numbered list format.
        `;
      }

      const requestBody = JSON.stringify({
        inputText: JSON.stringify(relevantData) + promptText,
        textGenerationConfig: {
          maxTokenCount: 2000,
        },
      });
      const params = {
        modelId: "amazon.titan-text-premier-v1:0",
        contentType: "application/json",
        accept: "application/json",
        body: requestBody,
      };

      const command = new InvokeModelCommand(params);
      const summarized = await client.send(command);
      const result = JSON.parse(Buffer.from(summarized.body).toString("utf-8"));
      res.json(result);
    } catch (err: unknown) {
      const error = err as Error;
      res.status(500).json({
        message:
          "Invalid AWS credentials or server error, please try again later.",
      });
      return next({
        message: "Error in getDataBedrock: " + error.message,
        log: error,
      });
    }
  },
};

export default aiController;
