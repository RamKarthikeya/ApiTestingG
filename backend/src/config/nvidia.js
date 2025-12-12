// src/config/nvidia.js
import OpenAI from "openai";
import { config } from "./env.js";

// OpenAI client pointed to NVIDIA NIM
const client = new OpenAI({
  apiKey: config.nvidiaKey,
  baseURL: "https://integrate.api.nvidia.com/v1",
});

// Pick any NIM chat model you enabled in NVIDIA Build
// (check model name on the NVIDIA model page)
const MODEL_NAME = "meta/llama3-8b-instruct";
// examples that also work if you enable them:
// "meta/llama3-70b-instruct"
// "deepseek-ai/deepseek-r1"

export const model = {
  /**
   * Wrapper to mimic Gemini's generateContent() shape so your
   * nvidia.service.js code keeps working without changes.
   */
  async generateContent(prompt) {
    try {
      const completion = await client.chat.completions.create({
        model: MODEL_NAME,
        messages: [
          {
            role: "system",
            content:
              "You are a strict QA engineer. You output ONLY JSON when asked.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      });

      const text = completion.choices?.[0]?.message?.content ?? "";

      // Fake the Gemini-like interface used in your service
      return {
        response: {
          text: () => text,
        },
      };
    } catch (error) {
      console.error(
        "NVIDIA Gen Error:",
        error.error?.message,
        error.status,
        error.message
      );
      throw error;
    }
  },
};
